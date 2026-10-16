// api/crm-crear-prospecto.js
//
// Fase 4 de la sincronización Prospectos↔CRM (ver
// claude/prospectos-crm-sincronizacion.md, sección 6). Jp pidió (2026-10-16)
// que TODOS los prospectos nuevos que entren por el importador de
// Meta/Sheets (renderSubirProspectos/subirProspectos en index.html) se den
// de alta también en el CRM (módulo Leads), no solo en la app. Mismo
// patrón que api/crm-crear-oportunidad.js (Fase 4 de Oportunidades).
//
// Se dispara en el momento, uno por uno, desde subirProspectos() — no por
// cron. Si el prospecto ya tiene prospecto_crm_id (ya está ligado — p.ej.
// por la reconciliación de Fase 1, o porque ya se creó antes), no crea
// nada duplicado: regresa {ok:true, skipped:true}.
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
// Oportunidades). Cuando Jp ligue a Carolina/Joshua a sus usuarios reales
// de Vtiger (igual que ya están Dulce/Manuel), los Leads nuevos de sus
// prospectos quedarán asignados a ellos automáticamente, sin tocar este
// archivo.
//
// ⚠️ Sin confirmar en vivo todavía — mismo espíritu que las notas de
// crm-actualizar-prospecto.js:
//   - "Company" suele ser obligatorio en el módulo Leads estándar de
//     Vtiger — si el prospecto no trae empresa capturada, se manda
//     "Sin empresa" en vez de dejarlo vacío, para no tronar el alta.
//     Si esta instalación no lo exige, no hace daño mandarlo igual.
//   - El Lead se crea con leadstatus "Not Contacted" (default estándar de
//     Vtiger para un Lead que nadie ha trabajado todavía).

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

async function vtigerCreate(sessionName, element) {
  const body = new URLSearchParams({
    operation: 'create',
    sessionName,
    elementType: 'Leads',
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

async function supabaseInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table} failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data[0];
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const usuario = await validarUsuarioSupabase(accessToken);
  if (!usuario) return res.status(401).json({ ok: false, error: 'sesión inválida — vuelve a iniciar sesión' });

  const { prospecto_id } = req.body || {};
  if (!prospecto_id) return res.status(400).json({ ok: false, error: 'falta prospecto_id' });

  try {
    const prospectos = await supabaseGet(
      `prospectos?id=eq.${encodeURIComponent(prospecto_id)}&select=*`
    );
    const p = prospectos[0];
    if (!p) return res.status(404).json({ ok: false, error: 'prospecto no encontrado' });
    if (p.prospecto_crm_id) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'ya estaba ligado al CRM' });
    }

    // Usuario de Vtiger del agente asignado (o respaldo).
    let crmUserId = null;
    if (p.asignado_a) {
      const usuarios = await supabaseGet(`usuarios?id=eq.${encodeURIComponent(p.asignado_a)}&select=crm_user_id`);
      crmUserId = usuarios[0]?.crm_user_id || null;
    }
    const asignadoFallback = !crmUserId;
    const assigned_user_id = crmUserId || VTIGER_USUARIO_RESPALDO;

    const sistemaAspel = (p.sistemas_aspel && p.sistemas_aspel.length) ? p.sistemas_aspel[p.sistemas_aspel.length - 1] : 'SIN INTERES';

    const sessionName = await vtigerLogin();
    const element = {
      lastname: p.apellidos || p.nombre || 'Prospecto',
      firstname: p.apellidos ? (p.nombre || '') : '',
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
    const creado = await vtigerCreate(sessionName, element);

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
      crm_leadid: creado.id,
      numero_prospecto: creado.lead_no || null,
      asignado_fallback: asignadoFallback,
    });
  } catch (err) {
    console.error('crm-crear-prospecto failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
