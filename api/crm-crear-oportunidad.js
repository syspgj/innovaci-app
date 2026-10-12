// api/crm-crear-oportunidad.js
//
// Fase 4: cuando un vendedor agrega una negociación NUEVA en Proyección y
// la liga a una cuenta real de Cartera, este endpoint crea la Oportunidad
// correspondiente en Vtiger (una Oportunidad en Vtiger siempre cuelga de
// una Cuenta — nunca se crea para negociaciones en texto libre).
//
// Se dispara en el momento (desde index.html, dentro de guardarFilaPipe,
// solo cuando es una fila NUEVA con cuenta ligada), no por cron.
//
// A diferencia de Fase 2/3 (que trabajan sobre Oportunidades que ya
// existían en el CRM), aquí la app es la que origina el registro.
//
// Seguridad: igual que crm-actualizar-oportunidad.js — no usa un secreto
// fijo expuesto en el navegador, exige el token de sesión de Supabase del
// usuario ya logueado en la app y lo valida contra el propio proyecto de
// Supabase antes de tocar el CRM.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/crm-crear-oportunidad.js  dentro del
//      repo de Innovaci OS (github.com/syspgj/innovaci-app).
//   2. No requiere variables de entorno nuevas — reutiliza las mismas
//      que ya están configuradas: VTIGER_BASE_URL, VTIGER_USER,
//      VTIGER_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//   3. No lleva entrada en vercel.json (no es un cron).
//   4. Sube el archivo a tu repo como siempre y Vercel despliega solo.
//
// Qué hace:
//   - Valida que quien llama tiene una sesión válida de Supabase.
//   - Recibe { cliente_cartera_id, nombre_oportunidad, monto, fase_venta,
//     probabilidad, fecha_prevista, vendedor_usuario_id }.
//   - Busca en Supabase el id real de la Cuenta en Vtiger
//     (clientes_cartera → stg_cuentas_crm_raw.crm_record_id, vía
//     num_cliente/account_no). Si la cuenta no tiene equivalente en el
//     CRM, no crea nada y regresa un error claro.
//   - Busca el usuario de Vtiger que le corresponde al vendedor
//     (usuarios.crm_user_id). Si el vendedor no tiene esa liga
//     configurada todavía, cae de vuelta al usuario Analisis y avisa en
//     la respuesta (asignado_fallback:true) para que la app se lo diga
//     al vendedor.
//   - Login a Vtiger con el usuario Analisis, crea la Oportunidad
//     (operation=create) ligada a esa Cuenta.
//   - Inserta el espejo correspondiente en oportunidades_crm en
//     Supabase y regresa su id, para que la app pueda ligar de una vez
//     pipeline_vendedor.oportunidad_crm_id.

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Analisis — usuario de respaldo cuando el vendedor no tiene todavía su
// usuario de Vtiger ligado en usuarios.crm_user_id.
const VTIGER_USUARIO_RESPALDO = '19x27';

// "Tipo de Servicio" — campo personalizado cf_1176 en Potentials, dado de
// alta por Jp en Vtiger el 2026-10-12. Mismas 9 opciones que TIPOS_SERVICIO
// en index.html (Proyección) — homologado para poder escribirlo sin tabla
// de equivalencias. Nombre interno confirmado vía describe (Jp, 2026-10-12).
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

// Mismo vocabulario que Fase 3 (ver claude/oportunidades-crm-diseno.md).
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

async function vtigerCreate(sessionName, element) {
  const body = new URLSearchParams({
    operation: 'create',
    sessionName,
    elementType: 'Potentials',
    element: JSON.stringify(element),
  });
  const res = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!res.success) {
    throw new Error('create failed: ' + JSON.stringify(res));
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

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
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

  const {
    cliente_cartera_id,
    nombre_oportunidad,
    monto,
    fase_venta,
    probabilidad,
    fecha_prevista,
    vendedor_usuario_id,
    tipo_servicio,
  } = req.body || {};

  if (!cliente_cartera_id || !nombre_oportunidad || !vendedor_usuario_id) {
    return res.status(400).json({ ok: false, error: 'faltan datos (cliente_cartera_id, nombre_oportunidad, vendedor_usuario_id)' });
  }
  if (fase_venta !== undefined && !FASES_PERMITIDAS.includes(fase_venta)) {
    return res.status(400).json({ ok: false, error: 'fase_venta no reconocida: ' + fase_venta });
  }
  if (tipo_servicio !== undefined && tipo_servicio !== null && tipo_servicio !== '' && !TIPOS_SERVICIO_PERMITIDOS.includes(tipo_servicio)) {
    return res.status(400).json({ ok: false, error: 'tipo_servicio no reconocido: ' + tipo_servicio });
  }

  try {
    // 1. Cuenta real en Cartera -> su id en Vtiger.
    const cuentas = await supabaseGet(
      `clientes_cartera?id=eq.${encodeURIComponent(cliente_cartera_id)}&select=num_cliente,razon_social`
    );
    const cuenta = cuentas[0];
    if (!cuenta || !cuenta.num_cliente) {
      return res.status(400).json({ ok: false, error: 'cuenta no encontrada en Cartera' });
    }
    const cuentasCrm = await supabaseGet(
      `stg_cuentas_crm_raw?account_no=eq.${encodeURIComponent(cuenta.num_cliente)}&select=crm_record_id`
    );
    const crmAccountId = cuentasCrm[0]?.crm_record_id;
    if (!crmAccountId) {
      return res.status(400).json({
        ok: false,
        error: 'esta cuenta no tiene equivalente en el CRM (no se puede crear la Oportunidad ahí automáticamente)',
      });
    }

    // 2. Vendedor de la app -> su usuario de Vtiger (o Analisis de respaldo).
    const usuarios = await supabaseGet(
      `usuarios?id=eq.${encodeURIComponent(vendedor_usuario_id)}&select=crm_user_id`
    );
    const crmUserId = usuarios[0]?.crm_user_id;
    const asignadoFallback = !crmUserId;
    const assigned_user_id = crmUserId || VTIGER_USUARIO_RESPALDO;

    // 3. Crear en Vtiger.
    const sessionName = await vtigerLogin();
    const element = {
      potentialname: nombre_oportunidad,
      related_to: crmAccountId,
      assigned_user_id,
      sales_stage: fase_venta || 'Prospectando',
      probability: String(probabilidad ?? 50),
    };
    if (monto !== undefined && monto !== null) element.amount = String(monto);
    if (fecha_prevista) element.closingdate = fecha_prevista;
    if (tipo_servicio) element[CAMPO_TIPO_SERVICIO] = tipo_servicio;
    const creado = await vtigerCreate(sessionName, element);

    // 4. Espejo en Supabase. Vtiger regresa el registro recién creado
    // completo, incluyendo potential_no (el folio "bonito", ej. "OP6384")
    // — se guarda de una vez, sin esperar al sync diario (Jp, 2026-10-12).
    const ahora = new Date().toISOString();
    const nuevaFila = await supabaseInsert('oportunidades_crm', {
      crm_potentialid: creado.id,
      crm_folio: creado.potential_no || null,
      nombre_oportunidad,
      monto: monto ?? null,
      fase_venta: fase_venta || 'Prospectando',
      probabilidad: probabilidad ?? 50,
      fecha_cierre_prevista: fecha_prevista || null,
      cliente_cartera_id,
      vendedor_asignado: vendedor_usuario_id,
      vendedor_crm_texto: 'Creada desde Proyección (Fase 4)',
      abierta: true,
      fecha_creacion_crm: ahora,
      fecha_actualizacion_crm: ahora,
    });

    return res.status(200).json({
      ok: true,
      crm_potentialid: creado.id,
      oportunidad_crm_id: nuevaFila.id,
      asignado_fallback: asignadoFallback,
    });
  } catch (err) {
    console.error('crm-crear-oportunidad failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
