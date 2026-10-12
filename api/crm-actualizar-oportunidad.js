// api/crm-actualizar-oportunidad.js
//
// Fase 3: cuando un vendedor cambia el Estatus o la Probabilidad de una
// negociación en Proyección que está ligada a una Oportunidad real del
// CRM (pipeline_vendedor.oportunidad_crm_id), este endpoint refleja ese
// cambio de vuelta en Vtiger (fase_venta / probability del Potential).
//
// Se dispara en el momento (desde index.html, dentro de guardarFilaPipe),
// no por cron.
//
// Política de conflicto: Proyección siempre gana — este endpoint
// sobreescribe sales_stage/probability en Vtiger sin comparar contra lo
// que hubiera ahí antes.
//
// Seguridad: a diferencia de los sync de cron, este endpoint lo llama
// el propio navegador del vendedor en cada guardado — un secreto fijo
// ahí quedaría visible para cualquiera que abra las herramientas de
// desarrollador del navegador. En vez de eso, exige el token de sesión
// de Supabase del usuario ya logueado en la app y lo valida contra el
// propio proyecto de Supabase antes de tocar el CRM.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/crm-actualizar-oportunidad.js  dentro
//      del repo de Innovaci OS (github.com/syspgj/innovaci-app).
//   2. No requiere variables de entorno nuevas — reutiliza las mismas
//      que ya están configuradas para sync-crm-accounts.js y
//      sync-crm-oportunidades.js:
//        VTIGER_BASE_URL, VTIGER_USER, VTIGER_ACCESS_KEY,
//        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   3. No lleva entrada en vercel.json (no es un cron, es un endpoint
//      normal que la app llama directo).
//   4. Sube el archivo a tu repo como siempre y Vercel despliega solo.
//
// Qué hace:
//   - Valida que quien llama tiene una sesión válida de Supabase
//     (usuario real logueado en la app).
//   - Valida que fase_venta (si viene) sea uno de los valores que
//     Proyección tiene permitido escribir — cualquier otro valor se
//     rechaza, así nunca se manda basura al CRM.
//   - Login contra Vtiger con el usuario Analisis (misma Access Key que
//     ya usan los sync).
//   - Trae el registro completo de la Oportunidad (retrieve) y le
//     cambia solo sales_stage/probability antes de reenviarlo — Vtiger
//     exige el registro completo (con todo campo obligatorio del módulo
//     con valor) en cualquier update, así no estés tocando ese campo.
//   - Además actualiza de inmediato el espejo en oportunidades_crm en
//     Supabase, para no tener que esperar al sync diario del día
//     siguiente para ver el cambio reflejado ahí también.

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Único vocabulario que Proyección tiene permitido escribir de vuelta al
// CRM (ver claude/oportunidades-crm-diseno.md). Entrega de Producto,
// Entrega 24/7, Servidor en la Nube y Suscripción Aspel se dejan fuera
// a propósito — Jp decidió no tocarlas desde Proyección por ahora.
const FASES_PERMITIDAS = [
  'Prospectando',
  'Evaluando Requerimientos',
  'Valoración con Soporte',
  'Valoración con Dirección',
  'Preparando Propuesta',
  'Cotización enviada',
  'Negociación o Revisión con Cliente',
  'Pausada por Cliente',
  'CAP',
  'Cerrada-Ganada',
  'Cerrada-Perdida',
];

// "Tipo de Servicio" — campo personalizado cf_1176 en Potentials (Jp,
// 2026-10-12). Mismas 9 opciones que TIPOS_SERVICIO en index.html —
// homologado para no necesitar tabla de equivalencias.
const CAMPO_TIPO_SERVICIO = 'cf_1176';
const TIPOS_SERVICIO_PERMITIDOS = [
  'Póliza',
  'Curso Empresarial',
  'IT',
  'Servicio por Evento',
  'Suscripción Aspel',
  'Licenciamiento Aspel',
  'Servidor Cloud',
  '24/7',
  'Curso o Diplomado en Vivo',
];

async function vtigerLogin() {
  const challengeRes = await fetch(
    `${VTIGER_BASE}?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`
  ).then((r) => r.json());
  if (!challengeRes.success) {
    throw new Error('getchallenge failed: ' + JSON.stringify(challengeRes));
  }
  const token = challengeRes.result.token;
  const hash = crypto.createHash('md5').update(token + VTIGER_ACCESS_KEY).digest('hex');
  const body = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: hash });
  const loginRes = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!loginRes.success) {
    throw new Error('login failed: ' + JSON.stringify(loginRes));
  }
  return loginRes.result.sessionName;
}

async function vtigerRetrieve(sessionName, id) {
  const url = `${VTIGER_BASE}?operation=retrieve&sessionName=${encodeURIComponent(
    sessionName
  )}&id=${encodeURIComponent(id)}`;
  const res = await fetch(url).then((r) => r.json());
  if (!res.success) {
    throw new Error('retrieve failed: ' + JSON.stringify(res));
  }
  return res.result;
}

async function vtigerUpdate(sessionName, record) {
  const body = new URLSearchParams({
    operation: 'update',
    sessionName,
    element: JSON.stringify(record),
  });
  const res = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!res.success) {
    throw new Error('update failed: ' + JSON.stringify(res));
  }
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

async function actualizarMirrorSupabase(crmPotentialId, fase_venta, probabilidad) {
  const ahora = new Date().toISOString();
  const patch = { fecha_actualizacion_crm: ahora, updated_at: ahora };
  if (fase_venta !== undefined) patch.fase_venta = fase_venta;
  if (probabilidad !== undefined) patch.probabilidad = probabilidad;
  await fetch(
    `${SUPABASE_URL}/rest/v1/oportunidades_crm?crm_potentialid=eq.${encodeURIComponent(crmPotentialId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const authHeader = req.headers['authorization'] || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const usuario = await validarUsuarioSupabase(accessToken);
  if (!usuario) {
    return res.status(401).json({ ok: false, error: 'sesión inválida — vuelve a iniciar sesión' });
  }

  const { crm_potentialid, fase_venta, probabilidad, tipo_servicio } = req.body || {};
  if (!crm_potentialid) {
    return res.status(400).json({ ok: false, error: 'falta crm_potentialid' });
  }
  if (fase_venta !== undefined && !FASES_PERMITIDAS.includes(fase_venta)) {
    return res.status(400).json({ ok: false, error: 'fase_venta no reconocida: ' + fase_venta });
  }
  if (
    probabilidad !== undefined &&
    (typeof probabilidad !== 'number' || probabilidad < 0 || probabilidad > 100)
  ) {
    return res.status(400).json({ ok: false, error: 'probabilidad inválida' });
  }
  if (tipo_servicio !== undefined && tipo_servicio !== null && tipo_servicio !== '' && !TIPOS_SERVICIO_PERMITIDOS.includes(tipo_servicio)) {
    return res.status(400).json({ ok: false, error: 'tipo_servicio no reconocido: ' + tipo_servicio });
  }
  if (fase_venta === undefined && probabilidad === undefined && !tipo_servicio) {
    return res.status(400).json({ ok: false, error: 'nada que actualizar' });
  }

  try {
    const sessionName = await vtigerLogin();
    // Vtiger exige el registro COMPLETO en un update — si falta algún
    // campo obligatorio del módulo (así no lo estemos tocando), lo
    // rechaza. Por eso traemos primero el registro tal cual está y solo
    // le cambiamos fase_venta/probability antes de reenviarlo.
    const actual = await vtigerRetrieve(sessionName, crm_potentialid);
    const record = { ...actual };
    if (fase_venta !== undefined) record.sales_stage = fase_venta;
    if (probabilidad !== undefined) record.probability = String(probabilidad);
    if (tipo_servicio) record[CAMPO_TIPO_SERVICIO] = tipo_servicio;
    const actualizado = await vtigerUpdate(sessionName, record);

    await actualizarMirrorSupabase(crm_potentialid, fase_venta, probabilidad);

    return res.status(200).json({ ok: true, id: actualizado.id });
  } catch (err) {
    console.error('crm-actualizar-oportunidad failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
