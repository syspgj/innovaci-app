// api/crm-crear-cuenta.js
//
// Jp, 2026-10-30 — "convertir un prospecto en cuenta" directo desde la App,
// sin tener que entrar al CRM. Verbatim: "A mí me encantaría que fuera en
// la aplicación... porque todo el seguimiento lo tenemos ahorita en la
// app... lo ideal sería... que se dé de alta en la app y que se replique
// en el CRM." Mismo patrón que crm-crear-oportunidad.js (Fase 4: la App es
// la que origina el registro, no el CRM) pero para el módulo Accounts.
//
// Flujo (ver index.html, función convertirProspectoACuenta):
//   1. El navegador manda { prospecto_id, vendedor_usuario_id }.
//   2. Este endpoint lee el prospecto en Supabase, crea la Cuenta en
//      Vtiger (operation=create, elementType=Accounts), y Vtiger regresa
//      el registro completo YA CON su folio "bonito" (account_no, ej.
//      "ACC1498") — igual que potential_no en Oportunidades.
//   3. Se inserta la fila espejo en clientes_cartera (origen='prospecto_app')
//      y se actualiza prospectos.cliente_cartera_id — a partir de ahí esa
//      fila se trata en toda la App igual que cualquier cuenta normal de
//      Cartera (badge "🏢 CUENTA", ficha completa, Suscripciones, etc. —
//      ver línea ~17395 de index.html).
//   4. El navegador, después de recibir la respuesta ok, llama aparte a
//      sincronizarPipelinesDeProspectoConvertido() (ya existente) para
//      convertir cualquier negociación abierta de Proyección ligada a este
//      prospecto en una Oportunidad real del CRM ligada a la cuenta nueva.
//
// A propósito NO mapea campos personalizados (RFC, sistemas Aspel, CFDI,
// etc.) — la cuenta se crea con lo mínimo seguro (razón social, teléfono,
// correo) y se completa a mano después, mismo criterio que
// api/cron/mapear-cuentas-crm.js (cuentas nuevas traídas desde el CRM).
//
// Seguridad: igual que crm-crear-oportunidad.js — exige el token de
// sesión de Supabase del usuario ya logueado, lo valida contra el propio
// proyecto de Supabase antes de tocar el CRM. No usa SYNC_SECRET.
//
// Variables de entorno: las mismas ya configuradas — VTIGER_BASE_URL,
// VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Analisis — mismo usuario de respaldo que usan crm-crear-oportunidad.js y
// crm-documento.js cuando el vendedor no tiene su usuario de Vtiger ligado.
const VTIGER_USUARIO_RESPALDO = '19x27';

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

async function vtigerCreateAccount(sessionName, element) {
  const body = new URLSearchParams({
    operation: 'create',
    sessionName,
    elementType: 'Accounts',
    element: JSON.stringify(element),
  });
  const res = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!res.success) throw new Error('create Accounts failed: ' + JSON.stringify(res));
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

async function supabasePatch(table, filtro, cambios) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filtro}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(cambios),
  });
  if (!res.ok) throw new Error(`Supabase patch ${table} failed (${res.status}): ${await res.text()}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const usuario = await validarUsuarioSupabase(accessToken);
  if (!usuario) return res.status(401).json({ ok: false, error: 'sesión inválida — vuelve a iniciar sesión' });

  const { prospecto_id, vendedor_usuario_id } = req.body || {};
  if (!prospecto_id) return res.status(400).json({ ok: false, error: 'falta prospecto_id' });

  try {
    const prospectos = await supabaseGet(
      `prospectos?id=eq.${encodeURIComponent(prospecto_id)}&select=id,nombre,apellidos,empresa,telefono,email,cliente_cartera_id,notas`
    );
    const p = prospectos[0];
    if (!p) return res.status(404).json({ ok: false, error: 'prospecto no encontrado' });
    if (p.cliente_cartera_id) {
      return res.status(400).json({ ok: false, error: 'este prospecto ya está convertido a cuenta' });
    }
    const razonSocial = (p.empresa || `${p.nombre || ''} ${p.apellidos || ''}`).trim();
    if (!razonSocial) return res.status(400).json({ ok: false, error: 'el prospecto no tiene empresa ni nombre con qué dar de alta la cuenta' });

    // Vendedor de la app -> su usuario de Vtiger (o Analisis de respaldo) —
    // mismo patrón que crm-crear-oportunidad.js.
    let assigned_user_id = VTIGER_USUARIO_RESPALDO;
    if (vendedor_usuario_id) {
      const usuarios = await supabaseGet(`usuarios?id=eq.${encodeURIComponent(vendedor_usuario_id)}&select=crm_user_id`);
      assigned_user_id = usuarios[0]?.crm_user_id || VTIGER_USUARIO_RESPALDO;
    }

    const sessionName = await vtigerLogin();
    const element = {
      accountname: razonSocial,
      phone: p.telefono || undefined,
      email1: p.email || undefined,
      assigned_user_id,
      description: `Convertido desde Prospectos en App VENTAS el ${new Date().toISOString().slice(0, 10)}.${p.notas ? ' Notas: ' + p.notas : ''}`,
    };
    const creado = await vtigerCreateAccount(sessionName, element);
    if (!creado.account_no) {
      // No debería pasar (Vtiger siempre asigna el folio al crear), pero si
      // pasa, no hay con qué ligar correctamente stg_cuentas_crm_raw/Cartera
      // después — mejor avisar claro que dejar una cuenta huérfana.
      return res.status(502).json({ ok: false, error: 'la Cuenta se creó en Vtiger pero no regresó account_no — revisa el CRM directamente para ligarla a mano.', crm_record_id: creado.id });
    }

    const nuevaCuenta = await supabaseInsert('clientes_cartera', {
      num_cliente: creado.account_no,
      razon_social: razonSocial,
      telefono: p.telefono || null,
      correo_principal: p.email || null,
      origen: 'prospecto_app',
      notas: `Convertida desde Prospectos (App) el ${new Date().toISOString().slice(0, 10)}.${p.notas ? '\n\nNotas del prospecto: ' + p.notas : ''}`,
    });

    await supabasePatch('prospectos', `id=eq.${encodeURIComponent(prospecto_id)}`, {
      cliente_cartera_id: nuevaCuenta.id,
    });

    return res.status(200).json({
      ok: true,
      cliente_cartera_id: nuevaCuenta.id,
      num_cliente: creado.account_no,
      razon_social: razonSocial,
      crm_record_id: creado.id,
    });
  } catch (err) {
    console.error('crm-crear-cuenta failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
