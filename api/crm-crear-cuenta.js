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

// Jp, 2026-11-04 — el CRM exige campos personalizados obligatorios (cf_1044, …)
// que la API no rellena sola con el valor por defecto de la pantalla. Se crea la
// Cuenta y, si Vtiger responde MANDATORY_FIELDS_MISSING, se completa el campo
// pedido con el valor neutro/default de abajo (los más comunes en cuentas
// recientes del espejo) y se reintenta. Valores de lista = deben existir en el
// picklist del CRM; "NA" es el "no aplica" que ya usa el CRM.
const VTIGER_DEFAULTS_CF = {
  cf_1044: 'NA', cf_924: 'NA', cf_928: 'NA', cf_932: 'NA', cf_936: 'NA', cf_940: 'NA',
  cf_944: 'NA', cf_948: 'NA', cf_952: 'NA', cf_954: 'NA',
  cf_1062: 'E Red List', cf_1066: '0', cf_1074: '3.3', cf_1094: 'Azul',
  cf_1136: 'Mensual', cf_1146: 'Mensual', cf_1150: 'Mensual', cf_1154: 'Mensual', cf_1160: 'Mensual',
};

async function vtigerCreateAccount(sessionName, element) {
  const el = { ...element };
  for (let intento = 0; intento < 15; intento++) {
    const body = new URLSearchParams({
      operation: 'create',
      sessionName,
      elementType: 'Accounts',
      element: JSON.stringify(el),
    });
    const res = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
    if (res.success) return res.result;
    const msg = (res.error && res.error.message) || '';
    const m = res.error && res.error.code === 'MANDATORY_FIELDS_MISSING' && msg.match(/^(\w+) does not have a value/);
    if (m && !(m[1] in el) && VTIGER_DEFAULTS_CF[m[1]] !== undefined) {
      el[m[1]] = VTIGER_DEFAULTS_CF[m[1]];
      continue;
    }
    throw new Error('create Accounts failed: ' + JSON.stringify(res));
  }
  throw new Error('create Accounts failed: demasiados campos obligatorios sin valor');
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

async function supabaseUpsertRaw(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stg_cuentas_crm_raw?on_conflict=account_no`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) console.error('upsert stg_cuentas_crm_raw failed', res.status, await res.text());
}

async function crearDesdeCuentaApp(res, clienteId) {
  try {
    const filas = await supabaseGet(
      `clientes_cartera?id=eq.${encodeURIComponent(clienteId)}&select=id,razon_social,rfc,telefono,correo_principal,num_cliente,vendedor_asignado,cliente_padre_id`
    );
    const c = filas[0];
    if (!c) return res.status(404).json({ ok: false, error: 'cuenta no encontrada' });
    if (!/^ALT-/i.test(c.num_cliente || '')) {
      return res.status(400).json({ ok: false, error: 'esta cuenta ya tiene folio del CRM (' + c.num_cliente + ')' });
    }
    let assigned_user_id = VTIGER_USUARIO_RESPALDO;
    if (c.vendedor_asignado) {
      const u = await supabaseGet(`usuarios?id=eq.${encodeURIComponent(c.vendedor_asignado)}&select=crm_user_id`);
      assigned_user_id = u[0]?.crm_user_id || VTIGER_USUARIO_RESPALDO;
    }
    // Subcuenta: si tiene cuenta principal con folio del CRM, se liga con el campo
    // "Miembro de" (account_id en Vtiger). Jp, 2026-11-05.
    let padreCrmId = null, padreNombre = null;
    if (c.cliente_padre_id) {
      const pf = await supabaseGet(`clientes_cartera?id=eq.${encodeURIComponent(c.cliente_padre_id)}&select=num_cliente,razon_social`);
      padreNombre = pf[0]?.razon_social || null;
      if (pf[0]?.num_cliente) {
        const pr = await supabaseGet(`stg_cuentas_crm_raw?account_no=eq.${encodeURIComponent(pf[0].num_cliente)}&select=crm_record_id`);
        padreCrmId = pr[0]?.crm_record_id || null;
      }
    }
    const sessionName = await vtigerLogin();
    const elemento = {
      accountname: c.razon_social,
      siccode: c.rfc || undefined, // el CRM usa siccode como RFC
      phone: c.telefono || undefined,
      email1: c.correo_principal || undefined,
      assigned_user_id,
      description: `Alta directa desde App VENTAS el ${new Date().toISOString().slice(0, 10)}.${padreNombre ? ' Subcuenta de ' + padreNombre + '.' : ''}`,
    };
    let creado, padreLigado = false;
    if (padreCrmId) {
      try { creado = await vtigerCreateAccount(sessionName, { ...elemento, account_id: padreCrmId }); padreLigado = true; }
      catch (e) {
        // Si el CRM rechaza el campo "Miembro de", se crea sin liga y se avisa.
        if (!/account_id|member/i.test(String(e && e.message))) throw e;
        creado = await vtigerCreateAccount(sessionName, elemento);
      }
    } else {
      creado = await vtigerCreateAccount(sessionName, elemento);
    }
    if (!creado.account_no) {
      return res.status(502).json({ ok: false, error: 'la Cuenta se creó en Vtiger pero no regresó account_no — revísala en el CRM.', crm_record_id: creado.id });
    }
    await supabasePatch('clientes_cartera', `id=eq.${encodeURIComponent(clienteId)}`, { num_cliente: creado.account_no });
    // Espejo inmediato para que "Abrir en CRM" funcione sin esperar al siguiente sync.
    await supabaseUpsertRaw({
      account_no: creado.account_no,
      accountname: c.razon_social,
      crm_record_id: creado.id,
      assigned_user_id,
      synced_at: new Date().toISOString(),
    });
    return res.status(200).json({ ok: true, cliente_cartera_id: clienteId, num_cliente: creado.account_no, razon_social: c.razon_social, crm_record_id: creado.id, es_subcuenta: !!c.cliente_padre_id, padre_ligado: padreLigado, padre: padreNombre });
  } catch (err) {
    console.error('crm-crear-cuenta (desde cuenta App) failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const usuario = await validarUsuarioSupabase(accessToken);
  if (!usuario) return res.status(401).json({ ok: false, error: 'sesión inválida — vuelve a iniciar sesión' });

  const { prospecto_id, vendedor_usuario_id, cliente_cartera_id } = req.body || {};
  // Jp, 2026-11-04 — cuentas dadas de alta directo en la App ("➕ Nuevo cliente",
  // num_cliente 'ALT-…') nunca llegaban al CRM: al abrirlas decía "aún no está en
  // el espejo del CRM" y no se podía crear su Oportunidad. Con cliente_cartera_id
  // se crea esa Cuenta en Vtiger y se reemplaza el 'ALT-…' por el folio ACC real.
  if (cliente_cartera_id) return crearDesdeCuentaApp(res, cliente_cartera_id);
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
