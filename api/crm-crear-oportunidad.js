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

// ── Nomenclatura del nombre de la Oportunidad (Jp, 2026-11-10) ─────────────────────────────
// En el CRM los nombres van en MAYÚSCULAS y con un formato fijo para que Ventas los encuentre:
//   Póliza:     CLIENTE | POLIZA MI EMPRESA (NOVIEMBRE 2026) | SR
//   Resguardo:  CLIENTE | RESGUARDO INN 2 - ANUAL (NOVIEMBRE 2026) | NUBE
//   24/7:       CLIENTE | MEMBRESIA ... (ENERO 2026) | LINEA
//   Otros:      CLIENTE | PRODUCTO EN MAYUSCULAS
// El mes/año sale de la fecha prevista de cierre. Sin acentos (como ya están en el CRM), conserva Ñ.
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
function mayusSinAcentos(t) {
  return String(t == null ? '' : t)
    .replace(/ñ/g, '\u0001').replace(/Ñ/g, '\u0001')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\u0001/g, 'Ñ')
    .replace(/\s+/g, ' ').trim();
}
function construirNombreOportunidad({ cliente_nombre, producto, tipo_servicio, fecha_prevista, nombre_oportunidad }) {
  if (!cliente_nombre || !producto) return mayusSinAcentos(nombre_oportunidad || '');
  const cli = mayusSinAcentos(cliente_nombre);
  let prod = mayusSinAcentos(producto);
  const f = fecha_prevista ? new Date(String(fecha_prevista).slice(0, 10) + 'T12:00:00') : new Date();
  const mesAnio = `(${MESES[(isNaN(f) ? new Date() : f).getMonth()]} ${(isNaN(f) ? new Date() : f).getFullYear()})`;
  const esPoliza = tipo_servicio === 'Póliza' || tipo_servicio === 'Resguardo';
  if (esPoliza) {
    const esResguardo = tipo_servicio === 'Resguardo' || /^(RESGUARDO|PERSONALIZADO)\b/.test(prod);
    if (esResguardo) {
      prod = prod.replace(/\s*\(.*?\)\s*$/, '');
      return `${cli} | ${prod} ${mesAnio} | NUBE`;
    }
    prod = prod.replace(/^POLIZA\s+/, '').replace(/\s*\(.*?\)\s*$/, '');
    return `${cli} | POLIZA ${prod} ${mesAnio} | SR`;
  }
  if (tipo_servicio === '24/7') {
    prod = prod.replace(/\s*\|\s*LINEA\s*$/, '');
    return /\(\s*[A-ZÑ]+\s+\d{4}\s*\)/.test(prod) ? `${cli} | ${prod} | LINEA` : `${cli} | ${prod} ${mesAnio} | LINEA`;
  }
  return `${cli} | ${prod}`;
}

// ── Contacto de la Oportunidad (campos reales del CRM, tomados de oportunidades ya existentes) ──
//   cf_970 = Vendedor (texto) · cf_982 = Correo electrónico · cf_980 / cf_984 = Teléfono
//   contact_id = "Nombre del Contacto" (relación a un Contacto del CRM, de la misma Cuenta)
async function vtigerQuery(sessionName, q) {
  const url = `${VTIGER_BASE}?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(q)}`;
  const r = await fetch(url).then((x) => x.json());
  return r.success ? r.result || [] : [];
}
const esc1 = (t) => String(t).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
// Devuelve el id del Contacto en el CRM: busca por correo dentro de la misma Cuenta (o por nombre exacto); si no existe, lo crea.
async function asegurarContactoCrm(sessionName, { crmAccountId, nombre, correo, telefono, assigned_user_id }) {
  if (!nombre) return null;
  if (correo) {
    const ya = await vtigerQuery(sessionName, `select id from Contacts where email='${esc1(correo)}' and account_id='${crmAccountId}' limit 1;`);
    if (ya[0] && ya[0].id) return ya[0].id;
  }
  const partes = nombre.trim().split(/\s+/);
  const element = {
    lastname: partes.length > 1 ? partes.slice(1).join(' ') : partes[0],
    account_id: crmAccountId,
    assigned_user_id,
  };
  if (partes.length > 1) element.firstname = partes[0];
  if (correo) element.email = correo;
  if (telefono) { element.mobile = telefono; element.phone = telefono; }
  const body = new URLSearchParams({ operation: 'create', sessionName, elementType: 'Contacts', element: JSON.stringify(element) });
  const res = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!res.success) throw new Error('no se pudo crear el Contacto: ' + JSON.stringify(res.error || res));
  return res.result.id;
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

  // ── Modo corrección (Jp, 2026-11-10): Oportunidades ya creadas (p. ej. OP6511) con nombre viejo y sin contacto.
  // Vuelve a calcular el nombre con la nomenclatura y reenvía contacto/vendedor desde la fila de Proyección.
  if (req.body && req.body.corregir_pipeline_id) {
    try {
      const fila = (await supabaseGet(`pipeline_vendedor?id=eq.${encodeURIComponent(req.body.corregir_pipeline_id)}&select=cliente,producto,tipo_servicio,fecha_prevista,contacto_nombre,contacto_correo,contacto_telefono,usuario_id,cliente_cartera_id,oportunidad_crm_id`))[0];
      if (!fila || !fila.oportunidad_crm_id) return res.status(400).json({ ok: false, error: 'La negociación no tiene Oportunidad en el CRM' });
      const opp = (await supabaseGet(`oportunidades_crm?id=eq.${fila.oportunidad_crm_id}&select=id,crm_potentialid,crm_folio`))[0];
      if (!opp || !opp.crm_potentialid) return res.status(400).json({ ok: false, error: 'No encontré la Oportunidad en el espejo del CRM' });
      const cuenta = (await supabaseGet(`clientes_cartera?id=eq.${encodeURIComponent(fila.cliente_cartera_id)}&select=num_cliente`))[0];
      const cuentaCrm = cuenta && (await supabaseGet(`stg_cuentas_crm_raw?account_no=eq.${encodeURIComponent(cuenta.num_cliente)}&select=crm_record_id`))[0];
      const vend = (await supabaseGet(`usuarios?id=eq.${encodeURIComponent(fila.usuario_id)}&select=crm_user_id,nombre`))[0];
      const tipoN = TIPOS_SERVICIO_PERMITIDOS.includes(fila.tipo_servicio) ? fila.tipo_servicio : undefined;
      const nombreNuevo = construirNombreOportunidad({ cliente_nombre: fila.cliente, producto: fila.producto, tipo_servicio: tipoN, fecha_prevista: fila.fecha_prevista });
      const sessionName = await vtigerLogin();
      const rec = await fetch(`${VTIGER_BASE}?operation=retrieve&sessionName=${encodeURIComponent(sessionName)}&id=${encodeURIComponent(opp.crm_potentialid)}`).then((r) => r.json());
      if (!rec.success) throw new Error('retrieve falló: ' + JSON.stringify(rec));
      const cambios = { potentialname: nombreNuevo };
      const avisos = [];
      if (vend && vend.nombre) cambios.cf_970 = vend.nombre;
      if (fila.contacto_correo) cambios.cf_982 = fila.contacto_correo;
      if (fila.contacto_telefono) { cambios.cf_980 = fila.contacto_telefono; cambios.cf_984 = fila.contacto_telefono; }
      if (fila.contacto_nombre && cuentaCrm && cuentaCrm.crm_record_id) {
        try {
          const cid = await asegurarContactoCrm(sessionName, { crmAccountId: cuentaCrm.crm_record_id, nombre: fila.contacto_nombre, correo: fila.contacto_correo, telefono: fila.contacto_telefono, assigned_user_id: (vend && vend.crm_user_id) || VTIGER_USUARIO_RESPALDO });
          if (cid) cambios.contact_id = cid;
        } catch (e) { avisos.push('Contacto: ' + String((e && e.message) || e)); }
      }
      const upd = async (extra) => fetch(VTIGER_BASE, { method: 'POST', body: new URLSearchParams({ operation: 'update', sessionName, element: JSON.stringify({ ...rec.result, ...extra }) }) }).then((r) => r.json());
      let r1 = await upd(cambios);
      if (!r1.success) {
        avisos.push('El CRM rechazó los campos de contacto/vendedor: ' + JSON.stringify(r1.error || r1).slice(0, 300));
        r1 = await upd({ potentialname: nombreNuevo });
      }
      if (!r1.success) return res.status(200).json({ ok: false, error: 'El CRM rechazó el cambio: ' + JSON.stringify(r1.error || r1).slice(0, 300) });
      await fetch(`${SUPABASE_URL}/rest/v1/oportunidades_crm?id=eq.${opp.id}`, { method: 'PATCH', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ nombre_oportunidad: nombreNuevo }) });
      return res.status(200).json({ ok: true, folio: opp.crm_folio, nombre_oportunidad: nombreNuevo, enviado: Object.keys(cambios), avisos });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
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
    cliente_nombre,
    producto,
    contacto_nombre,
    contacto_correo,
    contacto_telefono,
  } = req.body || {};

  if (!cliente_cartera_id || !nombre_oportunidad || !vendedor_usuario_id) {
    return res.status(400).json({ ok: false, error: 'faltan datos (cliente_cartera_id, nombre_oportunidad, vendedor_usuario_id)' });
  }
  if (fase_venta !== undefined && !FASES_PERMITIDAS.includes(fase_venta)) {
    return res.status(400).json({ ok: false, error: 'fase_venta no reconocida: ' + fase_venta });
  }
  // 'Resguardo' lo manda Proyección para pólizas de resguardo: solo afecta al nombre, no al campo Tipo de Servicio del CRM.
  const tipoParaNombre = tipo_servicio;
  const tipoCrm = tipo_servicio === 'Resguardo' ? 'Póliza' : tipo_servicio;
  if (tipoCrm !== undefined && tipoCrm !== null && tipoCrm !== '' && !TIPOS_SERVICIO_PERMITIDOS.includes(tipoCrm)) {
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
      `usuarios?id=eq.${encodeURIComponent(vendedor_usuario_id)}&select=crm_user_id,nombre`
    );
    const crmUserId = usuarios[0]?.crm_user_id;
    const vendedorNombre = usuarios[0]?.nombre || null;
    const nombreFinal = construirNombreOportunidad({ cliente_nombre, producto, tipo_servicio: tipoParaNombre, fecha_prevista, nombre_oportunidad });
    const asignadoFallback = !crmUserId;
    const assigned_user_id = crmUserId || VTIGER_USUARIO_RESPALDO;

    // 3. Crear en Vtiger.
    const sessionName = await vtigerLogin();
    const element = {
      potentialname: nombreFinal,
      related_to: crmAccountId,
      assigned_user_id,
      sales_stage: fase_venta || 'Prospectando',
      probability: String(probabilidad ?? 50),
    };
    if (monto !== undefined && monto !== null) element.amount = String(monto);
    if (fecha_prevista) element.closingdate = fecha_prevista;
    if (tipoCrm) element[CAMPO_TIPO_SERVICIO] = tipoCrm;

    // Datos de contacto y vendedor (Jp, 2026-11-10): antes no se mandaban y la Oportunidad quedaba con esos campos vacíos.
    const extras = {};
    const avisos = [];
    if (vendedorNombre) extras.cf_970 = vendedorNombre;
    if (contacto_correo) extras.cf_982 = contacto_correo;
    if (contacto_telefono) { extras.cf_980 = contacto_telefono; extras.cf_984 = contacto_telefono; }
    if (contacto_nombre) {
      try {
        const contactId = await asegurarContactoCrm(sessionName, { crmAccountId, nombre: contacto_nombre, correo: contacto_correo, telefono: contacto_telefono, assigned_user_id });
        if (contactId) extras.contact_id = contactId;
      } catch (e) { avisos.push('Contacto: ' + String((e && e.message) || e)); }
    }
    let creado;
    try {
      creado = await vtigerCreate(sessionName, { ...element, ...extras });
    } catch (e1) {
      // Si el CRM rechaza algún campo extra (p. ej. una lista cerrada), se crea igual sin ellos y se avisa.
      if (!Object.keys(extras).length) throw e1;
      avisos.push('El CRM rechazó los campos de contacto/vendedor: ' + String((e1 && e1.message) || e1).slice(0, 300));
      creado = await vtigerCreate(sessionName, element);
    }

    // 4. Espejo en Supabase. Vtiger regresa el registro recién creado
    // completo, incluyendo potential_no (el folio "bonito", ej. "OP6384")
    // — se guarda de una vez, sin esperar al sync diario (Jp, 2026-10-12).
    const ahora = new Date().toISOString();
    const nuevaFila = await supabaseInsert('oportunidades_crm', {
      crm_potentialid: creado.id,
      crm_folio: creado.potential_no || null,
      nombre_oportunidad: nombreFinal,
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
      nombre_oportunidad: nombreFinal,
      avisos,
    });
  } catch (err) {
    console.error('crm-crear-oportunidad failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
