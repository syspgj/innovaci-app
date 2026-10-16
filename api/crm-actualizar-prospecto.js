// api/crm-actualizar-prospecto.js
//
// Fase 3 de la sincronización Prospectos↔CRM (ver
// claude/prospectos-crm-sincronizacion.md, sección 6). Cuando un prospecto
// que YA está ligado al CRM (prospectos.prospecto_crm_id no nulo) se edita
// en la app — datos de contacto, estatus, interés, o el sistema que tiene
// marcado — este endpoint refleja ese cambio en el Lead real de Vtiger.
// Mismo patrón que api/crm-actualizar-oportunidad.js (Fase 3 de
// Oportunidades), adaptado al módulo Leads.
//
// Política de conflicto: igual que Oportunidades, la app siempre gana —
// este endpoint sobreescribe los campos que recibe sin comparar contra lo
// que hubiera en Vtiger antes.
//
// Se llama en el momento desde index.html (guardarDatosProspecto,
// guardarProspecto, guardarSistemasProspecto, registrarLlamada) — nunca
// por cron. Si el prospecto NO está ligado al CRM todavía, no es un
// error: regresa {ok:true, skipped:true} y la app sigue de largo (la
// mayoría de los prospectos del pool de Meta/Sheets, antes de pasar por
// Fase 4, no tienen folio del CRM).
//
// Seguridad: exige el token de sesión de Supabase del usuario ya logueado
// (no un secreto fijo expuesto en el navegador) — igual que el resto de
// los endpoints que llama la app directamente (no los cron de sync).
//
// Variables de entorno: reutiliza las ya configuradas — VTIGER_BASE_URL,
// VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Entrada: POST { prospecto_id, nombre?, apellidos?, empresa?, puesto?,
//   telefono?, email?, origen?, estatus?, interes?, sistema_aspel? }
//   — cualquier subconjunto; lo que no venga, no se toca en Vtiger.
//
// ⚠️ Dos cosas sin probar en vivo todavía (igual que "related_to" en
// crm-comentarios.js cuando se construyó) — si algo de esto no calza al
// primer uso real, se ajusta con el mismo diagnóstico que ya se usó para
// encontrar "Tipo de Servicio" (ver api/crm-describir-oportunidades.js):
//   1. El nombre interno del campo "Puesto" en Leads — se usa
//      "designation" (nombre estándar de Vtiger), no confirmado contra
//      esta instalación en concreto.
//   2. El mapeo de Estatus (app) -> Estado del Prospecto (Vtiger) es un
//      mapeo razonable inverso al que ya usa la reconciliación (ver
//      ESTADO_PROSPECTO_APP_A_CRM abajo), pero Jp no lo confirmó
//      explícitamente campo por campo — en particular "Canalizado a
//      ventas" y "Cliente 24/7" no tienen un estado equivalente limpio en
//      Vtiger (no se hace conversión de Lead a Potential/Contacto desde
//      aquí, eso sería una fase aparte) y se mandan como "Negociando".

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// "Interés Aspel" — cf_1116 en Leads (NOI/COI/SAE/.../SIN INTERES), mismo
// campo que ya lee vw_prospectos_crm_mapeado. "Interés" (cursos/talleres)
// es cf_1068.
const CAMPO_INTERES = 'cf_1068';
const CAMPO_INTERES_ASPEL = 'cf_1116';

// Traducción inversa de ESTATUS_COLORS (index.html) -> leadstatus real de
// Vtiger. Ver nota de cabecera sobre Canalizado a ventas / Cliente 24/7.
const ESTADO_PROSPECTO_APP_A_CRM = {
  'Nuevo': 'Not Contacted',
  'Contactado': 'Contacted',
  'No contestó': 'Attempted to Contact',
  'En WhatsApp': 'Contacted',
  'Interesado': 'Negociando',
  'Canalizado a ventas': 'Negociando',
  'Cliente 24/7': 'Negociando',
  'No interesado': 'Prospecto Fallido',
  'Perdido': 'Prospecto Basura',
};
// Valores de leadstatus que este endpoint tiene permitido escribir — igual
// de espíritu que FASES_PERMITIDAS en Oportunidades: nunca se manda un
// valor crudo sin traducir.
const ESTADOS_CRM_PERMITIDOS = Object.values(ESTADO_PROSPECTO_APP_A_CRM);

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

async function vtigerRetrieve(sessionName, id) {
  const url = `${VTIGER_BASE}?operation=retrieve&sessionName=${encodeURIComponent(sessionName)}&id=${encodeURIComponent(id)}`;
  const res = await fetch(url).then((r) => r.json());
  if (!res.success) throw new Error('retrieve failed: ' + JSON.stringify(res));
  return res.result;
}

async function vtigerUpdate(sessionName, record) {
  const body = new URLSearchParams({ operation: 'update', sessionName, element: JSON.stringify(record) });
  const res = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!res.success) throw new Error('update failed: ' + JSON.stringify(res));
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

  const { prospecto_id, nombre, apellidos, empresa, puesto, telefono, email, origen, estatus, interes, sistema_aspel } = req.body || {};
  if (!prospecto_id) return res.status(400).json({ ok: false, error: 'falta prospecto_id' });

  let estadoCrm;
  if (estatus !== undefined) {
    estadoCrm = ESTADO_PROSPECTO_APP_A_CRM[estatus];
    if (!estadoCrm || !ESTADOS_CRM_PERMITIDOS.includes(estadoCrm)) {
      return res.status(400).json({ ok: false, error: 'estatus no reconocido: ' + estatus });
    }
  }

  try {
    // 1. ¿Este prospecto está ligado al CRM? Si no, no hay nada que hacer.
    const prospectos = await supabaseGet(
      `prospectos?id=eq.${encodeURIComponent(prospecto_id)}&select=prospecto_crm_id`
    );
    const prospectoCrmId = prospectos[0]?.prospecto_crm_id;
    if (!prospectoCrmId) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'prospecto sin folio de CRM todavía' });
    }
    const espejos = await supabaseGet(
      `prospectos_crm?id=eq.${encodeURIComponent(prospectoCrmId)}&select=crm_leadid`
    );
    const crmLeadId = espejos[0]?.crm_leadid;
    if (!crmLeadId) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'sin crm_leadid en el espejo' });
    }

    // 2. Traer el Lead completo (Vtiger exige el registro completo en un
    // update) y solo cambiar los campos recibidos.
    const sessionName = await vtigerLogin();
    const actual = await vtigerRetrieve(sessionName, crmLeadId);
    const record = { ...actual };
    if (nombre !== undefined) record.firstname = apellidos ? nombre : '';
    if (apellidos !== undefined && apellidos) record.lastname = apellidos;
    else if (nombre !== undefined && !apellidos) record.lastname = nombre || record.lastname;
    if (empresa !== undefined && empresa) record.company = empresa;
    if (puesto !== undefined) record.designation = puesto || '';
    if (telefono !== undefined) record.phone = telefono || '';
    if (email !== undefined) record.email = email || '';
    if (origen !== undefined && origen) record.leadsource = origen;
    if (estadoCrm) record.leadstatus = estadoCrm;
    if (interes !== undefined) record[CAMPO_INTERES] = interes || '';
    if (sistema_aspel !== undefined) record[CAMPO_INTERES_ASPEL] = sistema_aspel || 'SIN INTERES';
    const actualizado = await vtigerUpdate(sessionName, record);

    // 3. Espejo en Supabase, sin esperar al sync diario.
    const patch = { fecha_actualizacion_crm: new Date().toISOString() };
    if (estadoCrm) patch.estado_prospecto = estadoCrm;
    await supabasePatch(`prospectos_crm?id=eq.${encodeURIComponent(prospectoCrmId)}`, patch);

    return res.status(200).json({ ok: true, id: actualizado.id });
  } catch (err) {
    console.error('crm-actualizar-prospecto failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
