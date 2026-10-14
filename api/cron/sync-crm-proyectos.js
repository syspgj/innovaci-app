// api/cron/sync-crm-proyectos.js
//
// Jp, 2026-10-14 — Fase 1 de "Proyectos" (punto 4, antes "más adelante").
// Mismo patrón que api/cron/sync-crm-oportunidades.js, pero con una
// diferencia a propósito: en vez de dejar el mapeo crudo→negocio como un
// segundo paso manual (lo que pasó con Cuentas y causó que clientes_cartera
// se desactualizara 8+ días sin que nadie lo notara — ver conversación del
// 2026-10-14), este cron hace las DOS cosas en una sola corrida:
//   1. Trae todos los proyectos de Vtiger (módulo "Project") y los guarda
//      crudos en stg_proyectos_crm_raw (igual que los demás syncs, para
//      poder diagnosticar si algo sale raro).
//   2. Mapea cada uno a proyectos_crm con sus columnas de negocio ya
//      resueltas (cliente, oportunidad, vendedor, activo/cerrado), sin
//      depender de que alguien corra un segundo script después.
//
// "activo": projectstatus NOT IN ('Archivado','Concluido') — los otros 6
// valores (En Asignación, En curso, Detenido por Cliente, Detenido por
// Soporte, Parcialmente Concluido, Confirmado por Cliente) cuentan como
// proyecto todavía abierto/con seguimiento. Confirmado contra el describe
// en vivo del módulo (ver api/crm-describir-proyectos.js, ya usado y
// puede borrarse del repo).
//
// cliente_cartera_id: linktoaccountscontacts (id de Cuenta en Vtiger) ->
// stg_cuentas_crm_raw.crm_record_id -> account_no -> clientes_cartera.num_cliente
// (mismo patrón ya probado con Oportunidades).
//
// oportunidad_crm_id: potentialid (si el proyecto se originó de una
// Oportunidad ganada) -> oportunidades_crm.crm_potentialid.
//
// vendedor_asignado: heredado de clientes_cartera.vendedor_asignado de la
// cuenta ya resuelta (igual que Oportunidades) — no tiene caso resolverlo
// desde assigned_user_id de Vtiger, porque ese es el usuario de ahí, no
// necesariamente el vendedor de Cartera en la app.
//
// Variables de entorno: reutiliza las ya configuradas — VTIGER_BASE_URL,
// VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SYNC_SECRET. No requiere ninguna nueva.
//
// Cron: agregar a vercel.json, mismo bloque "crons", después del de
// Oportunidades — ver nota en ese archivo.

import crypto from 'node:crypto';

const VTIGER_BASE_URL = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_SECRET = process.env.SYNC_SECRET;

// Proyectos con estatus en alguno de estos dos valores cuentan como
// cerrados/archivados — todo lo demás es "activo".
const ESTATUS_CERRADOS = new Set(['Archivado', 'Concluido']);

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

async function vtigerLogin() {
  const challengeUrl = `${VTIGER_BASE_URL}/webservice.php?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`;
  const challengeRes = await fetch(challengeUrl);
  const challengeJson = await challengeRes.json();
  if (!challengeJson.success) {
    throw new Error('No se pudo obtener el challenge token de Vtiger: ' + JSON.stringify(challengeJson));
  }
  const token = challengeJson.result.token;
  const accessKeyHash = md5(token + VTIGER_ACCESS_KEY);
  const loginBody = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: accessKeyHash });
  const loginRes = await fetch(`${VTIGER_BASE_URL}/webservice.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginBody,
  });
  const loginJson = await loginRes.json();
  if (!loginJson.success) {
    throw new Error('Login a Vtiger falló: ' + JSON.stringify(loginJson));
  }
  return loginJson.result.sessionName;
}

async function vtigerQueryAll(sessionName, moduleName) {
  const pageSize = 100;
  let offset = 0;
  let all = [];
  while (true) {
    const query = `select * from ${moduleName} limit ${offset},${pageSize};`;
    const url = `${VTIGER_BASE_URL}/webservice.php?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) {
      throw new Error(`Query a ${moduleName} falló (offset ${offset}): ` + JSON.stringify(json));
    }
    const rows = json.result || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
    if (offset > 50 * pageSize) break; // límite de seguridad, igual que Oportunidades
  }
  return all;
}

async function upsertRaw(table, idField, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({ [idField]: r.id, raw: r, synced_at: new Date().toISOString() }));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${idField}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upsert a ${table} falló (${res.status}): ${text}`);
  }
  return payload.length;
}

async function fetchTodo(table, select) {
  let todos = [];
  let desde = 0;
  const pageSize = 1000;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${pageSize}&offset=${desde}`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) throw new Error(`No se pudo leer ${table}: ` + (await res.text()));
    const rows = await res.json();
    todos = todos.concat(rows);
    if (rows.length < pageSize) break;
    desde += pageSize;
  }
  return todos;
}

function parseFechaCRM(v) {
  // Vtiger regresa fechas como "YYYY-MM-DD" o "" — se deja tal cual o null.
  if (!v) return null;
  return v;
}

function parseFechaHoraCRM(v) {
  // createdtime/modifiedtime vienen como "YYYY-MM-DD HH:MM:SS" (hora local
  // del servidor Vtiger) — se manda tal cual, Postgres lo interpreta.
  if (!v) return null;
  return v;
}

// Jp, 2026-10-14 — bug encontrado en la primera corrida real: targetbudget
// viene de Vtiger como texto con formato de moneda (ej. "$1,709.00"), no
// como número — Postgres lo rechaza tal cual ("invalid input syntax for
// type numeric"). Se limpia a solo dígitos/punto/signo antes de guardar.
function parseMonedaCRM(v) {
  if (v === null || v === undefined || v === '') return null;
  const limpio = String(v).replace(/[^0-9.-]/g, '');
  if (!limpio || limpio === '-' || limpio === '.') return null;
  const num = Number(limpio);
  return Number.isFinite(num) ? num : null;
}

export default async function handler(req, res) {
  const secret = req.query?.secret || req.headers['x-sync-secret'];
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    res.status(401).json({ ok: false, error: 'No autorizado' });
    return;
  }

  try {
    const sessionName = await vtigerLogin();

    // El nombre real del módulo quedó confirmado como "Project" (singular)
    // con el describe del 2026-10-14 — ver crm-describir-proyectos.js.
    const proyectos = await vtigerQueryAll(sessionName, 'Project');
    const totalRaw = await upsertRaw('stg_proyectos_crm_raw', 'crm_projectid', proyectos);

    // Tablas de apoyo para resolver cliente_cartera_id / oportunidad_crm_id
    // / vendedor_asignado — mismo patrón que Oportunidades.
    const [cuentasCrm, clientesCartera, oportunidades] = await Promise.all([
      fetchTodo('stg_cuentas_crm_raw', 'crm_record_id,account_no'),
      fetchTodo('clientes_cartera', 'id,num_cliente,vendedor_asignado'),
      fetchTodo('oportunidades_crm', 'id,crm_potentialid'),
    ]);
    const accountNoPorCrmId = new Map(cuentasCrm.map((c) => [c.crm_record_id, c.account_no]));
    const clientePorNumCliente = new Map(clientesCartera.map((c) => [c.num_cliente, c]));
    const oportunidadPorPotentialId = new Map(oportunidades.map((o) => [o.crm_potentialid, o.id]));

    const payload = proyectos.map((p) => {
      const accountId = p.linktoaccountscontacts || null;
      const accountNo = accountId ? accountNoPorCrmId.get(accountId) || null : null;
      const cliente = accountNo ? clientePorNumCliente.get(accountNo) || null : null;
      const estatus = p.projectstatus || null;
      return {
        crm_projectid: p.id,
        crm_project_no: p.project_no || null,
        nombre_proyecto: p.projectname || null,
        tipo_proyecto: p.projecttype || null,
        estatus_proyecto: estatus,
        activo: estatus ? !ESTATUS_CERRADOS.has(estatus) : null,
        progreso: p.progress || null,
        prioridad: p.projectpriority || null,
        fecha_inicio: parseFechaCRM(p.startdate),
        fecha_fin_prevista: parseFechaCRM(p.targetenddate),
        fecha_fin_real: parseFechaCRM(p.actualenddate),
        presupuesto: parseMonedaCRM(p.targetbudget),
        descripcion: p.description || null,
        cliente_cartera_id: cliente?.id || null,
        oportunidad_crm_id: p.potentialid ? oportunidadPorPotentialId.get(p.potentialid) || null : null,
        vendedor_crm_texto: p.assigned_user_id || null,
        vendedor_asignado: cliente?.vendedor_asignado || null,
        fecha_creacion_crm: parseFechaHoraCRM(p.createdtime),
        fecha_actualizacion_crm: parseFechaHoraCRM(p.modifiedtime),
        updated_at: new Date().toISOString(),
      };
    });

    let totalMapeado = 0;
    if (payload.length) {
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/proyectos_crm?on_conflict=crm_projectid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(payload),
      });
      if (!res2.ok) {
        const text = await res2.text();
        throw new Error(`Upsert a proyectos_crm falló (${res2.status}): ${text}`);
      }
      totalMapeado = payload.length;
    }

    const conCuenta = payload.filter((p) => p.cliente_cartera_id).length;
    const activos = payload.filter((p) => p.activo).length;

    res.status(200).json({
      ok: true,
      totalRaw,
      totalMapeado,
      conCuenta,
      sinCuenta: totalMapeado - conCuenta,
      activos,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
