// api/crm-crear-prospecto.js
//
// Fase 4 de la sincronización Prospectos↔CRM (ver
// claude/prospectos-crm-sincronizacion.md, sección 6) — REVISADA 2026-10-16
// para evitar duplicados, por petición expresa de Jp:
//
//   "es importante que se haga una validación para evitar duplicidad...
//    de los que son CUENTAS, sugiero que ahí se indique y que solo se
//    registre en la CUENTA que asistió al evento o masterclass"
//
// Jp confirmó (vía AskUserQuestion, 2026-10-16) el orden de validación y
// que aplica SIEMPRE desde ahora (no solo para destrabar el rezago de
// prospectos ya existentes en la app) — este mismo endpoint sirve tanto
// para altas nuevas (disparadas una por una desde subirProspectos() en
// index.html) como para el lote retroactivo (ver
// api/crm-sincronizar-prospectos-pendientes.js), ambos llaman este archivo
// con el mismo {prospecto_id}.
//
// Antes de crear un Lead nuevo en Vtiger, se valida en este orden:
//   1. ¿Ya existe un Lead en el CRM que haga match por correo o teléfono
//      (últimos 10 dígitos)? -> se LIGA a ese Lead (nunca se duplica).
//      Fuente: vw_prospectos_crm_mapeado (espejo completo de TODOS los
//      Leads del CRM, ligados o no — ya trae telefono_last10/email_norm
//      precalculados, misma convención que la reconciliación de Fase 1).
//   2. Si no hay Lead, ¿esta persona ya es CLIENTE en Cartera (match por
//      correo o teléfono contra clientes_cartera)? -> NO se crea Lead.
//      Se marca el prospecto como "es cuenta" (prospectos.cliente_cartera_id)
//      y se registra en esa Cuenta, dentro del CRM, UN comentario por cada
//      evento/masterclass al que asistió (prospecto_eventos) — mismo
//      patrón de "un comentario por acción" que ya usa Cartera.
//   3. Si ninguna de las dos aplica: se crea un Lead nuevo (comportamiento
//      original de esta Fase 4).
//
// Si el prospecto ya tiene prospecto_crm_id (ya ligado a un Lead) O ya
// tiene cliente_cartera_id (ya marcado como cuenta), no se repite la
// validación — solo se revisa si hay eventos nuevos sin comentar todavía
// en el CRM (prospecto_eventos.comentado_crm_at IS NULL) y se comentan.
// Esto hace que el endpoint sea seguro de llamar más de una vez sobre el
// mismo prospecto (idempotente), necesario para el lote retroactivo.
//
// Seguridad: igual que el resto de los endpoints que llama la app en el
// momento — exige el token de sesión de Supabase, no un secreto fijo.
//
// Variables de entorno: reutiliza las ya configuradas — VTIGER_BASE_URL,
// VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Entrada: POST { prospecto_id }
//
// ⚠️ Jp confirmó (2026-10-16, vía AskUserQuestion): Carolina y Joshua
// (telemarketing) todavía NO tienen usuario de Vtiger ligado
// (usuarios.crm_user_id) — por ahora, si el prospecto no tiene
// "asignado_a" con un crm_user_id configurado, el Lead se crea asignado
// al usuario de respaldo (Analisis, mismo "19x27" que ya usa Fase 4 de
// Oportunidades).
//
// ⚠️ Sin confirmar en vivo todavía:
//   - "Company" suele ser obligatorio en el módulo Leads estándar de
//     Vtiger — si el prospecto no trae empresa capturada, se manda
//     "Sin empresa" en vez de dejarlo vacío.
//   - El Lead se crea con leadstatus "Not Contacted".
//   - El nombre del campo "related_to" de ModComments para pegar un
//     comentario a una Cuenta (mismo campo ya usado en
//     api/crm-comentarios.js, sin problemas reportados).
//   - El match de "ya es cliente de Cartera" usa la función de Supabase
//     buscar_cuenta_cartera_por_contacto (correo exacto o teléfono por
//     últimos 10 dígitos contra telefono/telefono2/telefono_whatsapp) —
//     mismo criterio usado en todo el resto de la app, pero aquí se usa
//     por primera vez contra clientes_cartera (que no tiene columnas
//     normalizadas precalculadas como sí tiene el espejo de Leads).

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Analisis — usuario de respaldo en Vtiger, mismo que usa Fase 4 de
// Oportunidades (api/crm-crear-oportunidad.js) cuando el vendedor/agente
// todavía no tiene su usuario de Vtiger ligado.
const VTIGER_USUARIO_RESPALDO = '19x27';

const CAMPO_INTERES = 'cf_1068';
const CAMPO_INTERES_ASPEL = 'cf_1116';

async function vtigerLogin() {
  const challengeRes = await fetch(
    `${VTIGER_BASE}?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`
  ).then((r) => r.json());
  if (!challengeRes.success) throw new Error('getchallenge failed: ' + JSON.stringify(challengeRes));
  const token = challengeRes.result.token;
  const hash = crypto.createHash('md5').update(token + VTIGER_ACCESS_KEY).digest('hex');
  const body = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: hash });
  const loginRes = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!loginRes.success) throw new Error('login failed: ' + JSON.stringify(loginRes));
  return loginRes.result.sessionName;
}

async function vtigerCreate(sessionName, elementType, element) {
  const body = new URLSearchParams({
    operation: 'create',
    sessionName,
    elementType,
    element: JSON.stringify(element),
  });
  const res = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!res.success) throw new Error('create failed: ' + JSON.stringify(res));
  return res.result;
}

async function validarUsuarioSupabase(accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user && user.id ? user : null;
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function supabasePost(path, body, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase POST ${path} failed (${res.status}): ${await res.text()}`);
  if (prefer === 'return=minimal') return null;
  const data = await res.json();
  return Array.isArray(body) ? data : data[0];
}

async function supabaseInsert(table, row) {
  return supabasePost(table, row, 'return=representation');
}

async function supabasePatch(path, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path} failed (${res.status}): ${await res.text()}`);
}

async function supabaseRpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${fn} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function normalizarEmail(email) {
  return (email || '').trim().toLowerCase();
}
function ultimos10Digitos(telefono) {
  const solo = (telefono || '').replace(/\D/g, '');
  return solo.length >= 10 ? solo.slice(-10) : null;
}

// Paso 1: ¿ya existe un Lead en el CRM que haga match por correo/teléfono?
async function buscarLeadExistente(email, telefono) {
  const emailNorm = normalizarEmail(email);
  const tel10 = ultimos10Digitos(telefono);
  const filtros = [];
  if (emailNorm) filtros.push(`email_norm.eq.${encodeURIComponent(emailNorm)}`);
  if (tel10) filtros.push(`telefono_last10.eq.${encodeURIComponent(tel10)}`);
  if (!filtros.length) return null;
  const rows = await supabaseGet(
    `vw_prospectos_crm_mapeado?select=crm_leadid,numero_prospecto,estado_prospecto,fecha_creacion_crm,fecha_actualizacion_crm&or=(${filtros.join(',')})&limit=1`
  );
  return rows[0] || null;
}

// Paso 2: ¿ya es cliente de Cartera?
async function buscarCuentaExistente(email, telefono) {
  const rows = await supabaseRpc('buscar_cuenta_cartera_por_contacto', {
    p_telefono: telefono || null,
    p_email: email || null,
  });
  return (rows && rows[0]) || null;
}

async function resolverAccountIdCrm(numCliente) {
  const rows = await supabaseGet(
    `stg_cuentas_crm_raw?account_no=eq.${encodeURIComponent(numCliente)}&select=crm_record_id`
  );
  return rows?.[0]?.crm_record_id || null;
}

async function agregarComentarioCrm(sessionName, relatedTo, comentario) {
  return vtigerCreate(sessionName, 'ModComments', { commentcontent: comentario, related_to: relatedTo });
}

function formatearFechaEvento(ev) {
  const f = ev.fecha_evento || ev.fecha_registro;
  return f ? String(f).slice(0, 10) : 'fecha no registrada';
}

function textoComentarioEvento(ev) {
  let txt = `[Prospectos→Cuenta] Asistió al evento/masterclass "${ev.evento || 'Sin nombre'}" (${formatearFechaEvento(ev)})`;
  if (ev.tipo_evento) txt += ` · Tipo: ${ev.tipo_evento}`;
  if (ev.sistema_relacionado) txt += ` · Sistema: ${ev.sistema_relacionado}`;
  if (ev.promocion) txt += ` · Promoción: ${ev.promocion}`;
  return txt;
}

// Comenta en el CRM (sobre la Cuenta ya resuelta) cada evento de
// prospecto_eventos que todavía no tenga comentado_crm_at — y lo marca,
// para no repetirlo si este endpoint se vuelve a llamar sobre el mismo
// prospecto (retroactivo, o un reintento).
async function comentarEventosPendientes(prospectoId, accountIdCrm) {
  const eventos = await supabaseGet(
    `prospecto_eventos?prospecto_id=eq.${encodeURIComponent(prospectoId)}&comentado_crm_at=is.null&select=id,evento,fecha_registro,fecha_evento,tipo_evento,sistema_relacionado,promocion`
  );
  if (!eventos.length) return 0;
  if (!accountIdCrm) return 0; // la cuenta aún no tiene espejo en el CRM — se reintentará después
  const sessionName = await vtigerLogin();
  let comentados = 0;
  const ahora = new Date().toISOString();
  for (const ev of eventos) {
    await agregarComentarioCrm(sessionName, accountIdCrm, textoComentarioEvento(ev));
    await supabasePatch(`prospecto_eventos?id=eq.${encodeURIComponent(ev.id)}`, { comentado_crm_at: ahora });
    comentados++;
  }
  return comentados;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const usuario = await validarUsuarioSupabase(accessToken);
  if (!usuario) return res.status(401).json({ ok: false, error: 'sesión inválida — vuelve a iniciar sesión' });

  const { prospecto_id } = req.body || {};
  if (!prospecto_id) return res.status(400).json({ ok: false, error: 'falta prospecto_id' });

  try {
    const prospectos = await supabaseGet(`prospectos?id=eq.${encodeURIComponent(prospecto_id)}&select=*`);
    const p = prospectos[0];
    if (!p) return res.status(404).json({ ok: false, error: 'prospecto no encontrado' });

    // Ya ligado a un Lead — Fase 3 (crm-actualizar-prospecto.js) es quien
    // mantiene ese Lead al día; aquí no hay nada más que crear.
    if (p.prospecto_crm_id) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'ya estaba ligado al CRM (Lead)' });
    }

    // Ya marcado como cuenta — solo falta revisar si hay eventos nuevos
    // sin comentar todavía.
    if (p.cliente_cartera_id) {
      const cuentas = await supabaseGet(`clientes_cartera?id=eq.${encodeURIComponent(p.cliente_cartera_id)}&select=num_cliente`);
      const numCliente = cuentas[0]?.num_cliente || null;
      const accountIdCrm = numCliente ? await resolverAccountIdCrm(numCliente) : null;
      const comentados = await comentarEventosPendientes(prospecto_id, accountIdCrm);
      return res.status(200).json({ ok: true, skipped: true, reason: 'ya marcado como cuenta', eventos_comentados: comentados });
    }

    // --- Validación 1: ¿ya existe un Lead que haga match? -> ligar ---
    const leadExistente = await buscarLeadExistente(p.email, p.telefono);
    if (leadExistente) {
      const ahora = new Date().toISOString();
      const nuevoEspejo = await supabaseInsert('prospectos_crm', {
        crm_leadid: leadExistente.crm_leadid,
        nombre: p.nombre,
        estado_prospecto: leadExistente.estado_prospecto || null,
        vendedor_asignado: p.asignado_a || null,
        vendedor_crm_texto: 'Vinculado automáticamente — ya existía un Lead en el CRM con este correo/teléfono (validación anti-duplicados, Fase 4)',
        fecha_creacion_crm: leadExistente.fecha_creacion_crm || ahora,
        fecha_actualizacion_crm: leadExistente.fecha_actualizacion_crm || ahora,
      });
      await supabasePatch(`prospectos?id=eq.${encodeURIComponent(prospecto_id)}`, {
        prospecto_crm_id: nuevoEspejo.id,
        numero_prospecto: leadExistente.numero_prospecto || null,
        updated_at: ahora,
      });
      return res.status(200).json({ ok: true, accion: 'vinculado_lead_existente', crm_leadid: leadExistente.crm_leadid });
    }

    // --- Validación 2: ¿ya es cliente de Cartera? -> marcar cuenta + comentar eventos ---
    const cuentaExistente = await buscarCuentaExistente(p.email, p.telefono);
    if (cuentaExistente) {
      const ahora = new Date().toISOString();
      await supabasePatch(`prospectos?id=eq.${encodeURIComponent(prospecto_id)}`, {
        cliente_cartera_id: cuentaExistente.id,
        updated_at: ahora,
      });
      const accountIdCrm = await resolverAccountIdCrm(cuentaExistente.num_cliente);
      const comentados = await comentarEventosPendientes(prospecto_id, accountIdCrm);
      return res.status(200).json({
        ok: true,
        accion: 'marcado_como_cuenta',
        num_cliente: cuentaExistente.num_cliente,
        razon_social: cuentaExistente.razon_social,
        eventos_comentados: comentados,
        cuenta_sin_espejo_crm: !accountIdCrm,
      });
    }

    // --- Validación 3: nada existía -> crear Lead nuevo (comportamiento original) ---
    let crmUserId = null;
    if (p.asignado_a) {
      const usuarios = await supabaseGet(`usuarios?id=eq.${encodeURIComponent(p.asignado_a)}&select=crm_user_id`);
      crmUserId = usuarios[0]?.crm_user_id || null;
    }
    const asignadoFallback = !crmUserId;
    const assigned_user_id = crmUserId || VTIGER_USUARIO_RESPALDO;
    const sistemaAspel = (p.sistemas_aspel && p.sistemas_aspel.length) ? p.sistemas_aspel[p.sistemas_aspel.length - 1] : 'SIN INTERES';

    const sessionName = await vtigerLogin();
    // Jp, 2026-10-16 — bug encontrado al correr el lote retroactivo en vivo:
    // esta instalación de Vtiger exige "firstname" con valor (mandatory
    // field) y antes se mandaba vacío cuando el prospecto no tenía
    // apellidos capturados (el caso más común: los que suben por
    // Meta/Sheets solo traen un campo "nombre"). Eso tronaba el alta con
    // MANDATORY_FIELDS_MISSING para prácticamente todos los prospectos sin
    // apellido — se corrige para que firstname siempre lleve el nombre
    // completo cuando no hay apellido que separar.
    const nombreCompleto = p.nombre || 'Prospecto';
    const element = {
      lastname: p.apellidos || nombreCompleto,
      firstname: nombreCompleto,
      company: p.empresa || 'Sin empresa',
      designation: p.puesto || '',
      phone: p.telefono || '',
      email: p.email || '',
      leadsource: p.origen || 'Telemarketing',
      leadstatus: 'Not Contacted',
      assigned_user_id,
      [CAMPO_INTERES]: p.interes || '',
      [CAMPO_INTERES_ASPEL]: sistemaAspel,
    };
    const creado = await vtigerCreate(sessionName, 'Leads', element);

    const ahora = new Date().toISOString();
    const nuevoEspejo = await supabaseInsert('prospectos_crm', {
      crm_leadid: creado.id,
      nombre: p.nombre,
      estado_prospecto: 'Not Contacted',
      vendedor_asignado: p.asignado_a || null,
      vendedor_crm_texto: 'Creado desde la app (Fase 4, importador Meta/Sheets)',
      fecha_creacion_crm: ahora,
      fecha_actualizacion_crm: ahora,
    });

    await supabasePatch(`prospectos?id=eq.${encodeURIComponent(prospecto_id)}`, {
      prospecto_crm_id: nuevoEspejo.id,
      numero_prospecto: creado.lead_no || null,
      updated_at: ahora,
    });

    return res.status(200).json({
      ok: true,
      accion: 'creado_lead_nuevo',
      crm_leadid: creado.id,
      numero_prospecto: creado.lead_no || null,
      asignado_fallback: asignadoFallback,
    });
  } catch (err) {
    console.error('crm-crear-prospecto failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
