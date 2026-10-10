// api/cron/sync-crm-oportunidades.js
//
// Jp, 2026-10-07 — Fase 1 del diseño "Oportunidades (CRM <-> Proyección)"
// (ver claude/oportunidades-crm-diseno.md en el proyecto App VENTAS).
//
// Espejo CRUDO de lectura de dos módulos de Vtiger: Oportunidades (Potentials)
// y Prospectos (Leads). Mismo patrón que api/cron/sync-crm-accounts.js, pero
// a propósito NO mapeamos a columnas de negocio todavía — con Cuentas
// aprendimos que Vtiger reutiliza nombres de campo de forma poco intuitiva
// (RFC guardado en "siccode", por ejemplo), así que aquí cada registro se
// guarda completo como JSONB en una tabla "raw". El mapeo a columnas de
// negocio (oportunidades_crm / prospectos_crm) se construye en un segundo
// paso, DESPUÉS de inspeccionar un sync real y ver los nombres de campo
// verdaderos — igual que se hizo con stg_cuentas_crm_raw -> vw_cuentas_crm_mapeado.
//
// Reutiliza las mismas variables de entorno que sync-crm-accounts.js:
// VTIGER_BASE_URL, VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET. No se necesita ninguna nueva.
//
// Protegido igual que el endpoint de Cuentas: requiere
// ?secret=SYNC_SECRET (o header x-sync-secret) para evitar que cualquiera
// en internet dispare el sync.

import crypto from 'node:crypto';

const VTIGER_BASE_URL = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_SECRET = process.env.SYNC_SECRET;

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

  const loginBody = new URLSearchParams({
    operation: 'login',
    username: VTIGER_USER,
    accessKey: accessKeyHash,
  });
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

// Trae TODOS los registros de un módulo, paginando (Vtiger limita cada
// query a 100 filas por default). No filtramos por fase/estatus en el
// VTIGERQL para evitar problemas de escape con acentos ("Suscripción
// Aspel", etc.) — se trae todo y se filtra/mapea después, en la vista de
// mapeo (segundo paso, pendiente).
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
    // Límite de seguridad: nunca más de 50 páginas (5000 registros) en una
    // sola corrida, para no colgar la función si algo sale mal con el loop.
    if (offset > 50 * pageSize) break;
  }
  return all;
}

async function upsertRaw(table, idField, crmIdKey, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    [idField]: r[crmIdKey] ?? r.id,
    raw: r,
    synced_at: new Date().toISOString(),
  }));
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

export default async function handler(req, res) {
  const secret = req.query?.secret || req.headers['x-sync-secret'];
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    res.status(401).json({ ok: false, error: 'No autorizado' });
    return;
  }

  try {
    const sessionName = await vtigerLogin();

    const potentials = await vtigerQueryAll(sessionName, 'Potentials');
    const leads = await vtigerQueryAll(sessionName, 'Leads');

    const totalOportunidades = await upsertRaw('stg_oportunidades_crm_raw', 'crm_potentialid', 'id', potentials);
    const totalProspectos = await upsertRaw('stg_prospectos_crm_raw', 'crm_leadid', 'id', leads);

    res.status(200).json({
      ok: true,
      totalOportunidades,
      totalProspectos,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
