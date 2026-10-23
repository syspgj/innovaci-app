// api/crm-comentarios.js
//
// Jp, 2026-10-13 — lee y agrega comentarios del CRM (Vtiger, módulo
// ModComments) para una Cuenta o una Oportunidad desde la app. Jp aclaró
// que en el CRM los comentarios de Cuenta, Oportunidad y Proyecto son
// independientes entre sí (puedes verlos por separado o todos combinados).
// Esta primera versión trae SOLO los comentarios ligados directamente al
// registro pedido (no combina Cuenta+Oportunidad+Proyecto) — combinarlos
// requeriría además sincronizar Proyectos, que hoy no existen en la app
// (Jp lo dejó como "más adelante"). Si más tarde se quiere la vista
// combinada, se puede extender este mismo endpoint.
//
// GET  ?tipo=cuenta&num_cliente=ACC607          -> lista de comentarios de esa cuenta
// GET  ?tipo=oportunidad&crm_potentialid=13x104370 -> lista de comentarios de esa oportunidad
// GET  ?tipo=proyecto&numero_proyecto_crm=POL2455  -> lista de comentarios del proyecto (Mesa de Control / resguardo, 2026-10-23)
// POST { tipo, num_cliente|crm_potentialid|numero_proyecto_crm, comentario, vendedor_usuario_id }
//      -> agrega un comentario nuevo a ese registro en el CRM
//
// Para "tipo=cuenta" el id real de Vtiger (ACCOUNTID, formato "11x123") no
// se guarda hoy en clientes_cartera (solo num_cliente tipo "ACC607", que es
// el folio de negocio, no el id interno) — este endpoint lo resuelve solo,
// buscando en stg_cuentas_crm_raw (espejo crudo del sync diario) el
// account_no que coincida, con el service_role key (no depende de permisos
// del cliente/anon). Si la cuenta todavía no tiene espejo en el CRM (nunca
// sincronizada, o num_cliente no es un ACCxxx del CRM), regresa un mensaje
// claro en vez de tronar.
//
// Nota para Jp: 2026-10-13, ya se probó una vez en vivo y se encontró que
// stg_cuentas_crm_raw.account_id casi nunca viene poblado (es un campo
// legado) — el id real de Vtiger está en crm_record_id, ya corregido abajo
// (ver resolverAccountIdCrm). El nombre del campo "related_to" de ModComments
// sigue sin probarse contra el CRM en vivo — si al usarlo no calza, lo
// ajustamos con el mismo patrón de diagnóstico que usamos para encontrar
// "Tipo de Servicio" (api/crm-describir-oportunidades.js).
//
// Variables de entorno: reutiliza las ya configuradas — VTIGER_BASE_URL,
// VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// No requiere SYNC_SECRET (se llama desde la sesión del vendedor en la app,
// no desde un cron) — igual que /api/crm-agregar-comentario, solo exige que
// venga un header Authorization con el token de sesión de Supabase.

import crypto from 'node:crypto';

const VTIGER_BASE_URL = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

async function vtigerLogin() {
  const challengeUrl = `${VTIGER_BASE_URL}/webservice.php?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`;
  const challengeJson = await fetch(challengeUrl).then((r) => r.json());
  if (!challengeJson.success) {
    throw new Error('getchallenge falló: ' + JSON.stringify(challengeJson));
  }
  const token = challengeJson.result.token;
  const accessKeyHash = md5(token + VTIGER_ACCESS_KEY);
  const loginBody = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: accessKeyHash });
  const loginJson = await fetch(`${VTIGER_BASE_URL}/webservice.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginBody,
  }).then((r) => r.json());
  if (!loginJson.success) {
    throw new Error('login falló: ' + JSON.stringify(loginJson));
  }
  return loginJson.result.sessionName;
}

function escaparVtigerQL(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Resuelve el ACCOUNTID real de Vtiger (ej. "11x67227") a partir del
// num_cliente de negocio (ej. "ACC607"), usando el espejo crudo del sync
// diario — no depende de que clientes_cartera guarde ese id.
//
// Jp, 2026-10-13 — bug encontrado al probar esto en vivo: la columna
// "account_id" de stg_cuentas_crm_raw casi nunca viene poblada (solo 46 de
// 1480 filas la tienen — probablemente un campo legado de otro sync). El id
// real de Vtiger SÍ llega siempre, en la columna "crm_record_id" (formato
// "11xNNNNN", 1480/1480 filas). Se corrige para usar esa columna.
async function resolverAccountIdCrm(numCliente) {
  const url = `${SUPABASE_URL}/rest/v1/stg_cuentas_crm_raw?account_no=eq.${encodeURIComponent(numCliente)}&select=crm_record_id`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error('No se pudo consultar stg_cuentas_crm_raw: ' + (await res.text()));
  const rows = await res.json();
  return rows?.[0]?.crm_record_id || null;
}

// Jp, 2026-10-16 — Fase 3 de Prospectos↔CRM: resuelve el LEADID real de
// Vtiger a partir del prospecto_id de la app (prospectos.prospecto_crm_id
// -> prospectos_crm.crm_leadid). Si el prospecto no está ligado al CRM
// todavía, no es un error del endpoint: se avisa claro para que quien
// llama (registrarLlamada en index.html) decida no tronar por esto —
// la mayoría de los prospectos, antes de pasar por Fase 4, no tienen
// folio de CRM.
async function resolverLeadIdCrm(prospectoId) {
  const prosRes = await fetch(
    `${SUPABASE_URL}/rest/v1/prospectos?id=eq.${encodeURIComponent(prospectoId)}&select=prospecto_crm_id`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!prosRes.ok) throw new Error('No se pudo consultar prospectos: ' + (await prosRes.text()));
  const prospectoCrmId = (await prosRes.json())?.[0]?.prospecto_crm_id;
  if (!prospectoCrmId) return null;
  const espejoRes = await fetch(
    `${SUPABASE_URL}/rest/v1/prospectos_crm?id=eq.${encodeURIComponent(prospectoCrmId)}&select=crm_leadid`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!espejoRes.ok) throw new Error('No se pudo consultar prospectos_crm: ' + (await espejoRes.text()));
  return (await espejoRes.json())?.[0]?.crm_leadid || null;
}

// Jp, 2026-10-23 — Mesa de Control / resguardo: resuelve el CRMID real del
// Proyecto (Vtiger, módulo Project) a partir del numero_proyecto_crm guardado
// en la póliza (clientes_polizas.numero_proyecto_crm, formato "POL####" —
// mismo sufijo numérico que proyectos_crm.crm_project_no en formato
// "PROJ####", ver claude/mesa-control-operaciones.md, Lote 8). Si la póliza
// todavía no tiene su proyecto espejado del CRM, se avisa claro en vez de
// tronar — Jp aclaró que cada póliza de resguardo debe tener su Proyecto en
// CRM, pero el sync diario puede no haber corrido todavía para una póliza
// nueva.
async function resolverProjectIdCrm(numeroProyectoCrm) {
  const numero = String(numeroProyectoCrm).replace(/^POL/i, '').replace(/^PROJ/i, '');
  const url = `${SUPABASE_URL}/rest/v1/proyectos_crm?crm_project_no=eq.${encodeURIComponent('PROJ' + numero)}&select=crm_projectid`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error('No se pudo consultar proyectos_crm: ' + (await res.text()));
  const rows = await res.json();
  return rows?.[0]?.crm_projectid || null;
}

async function obtenerCrmId(tipo, body) {
  if (tipo === 'oportunidad') {
    if (!body.crm_potentialid) throw new Error('Falta crm_potentialid');
    return body.crm_potentialid;
  }
  if (tipo === 'cuenta') {
    if (!body.num_cliente) throw new Error('Falta num_cliente');
    const accountId = await resolverAccountIdCrm(body.num_cliente);
    if (!accountId) throw new Error(`La cuenta ${body.num_cliente} no tiene espejo en el CRM todavía (o nunca se ha sincronizado) — no se puede ligar a comentarios.`);
    return accountId;
  }
  if (tipo === 'prospecto') {
    if (!body.prospecto_id) throw new Error('Falta prospecto_id');
    const leadId = await resolverLeadIdCrm(body.prospecto_id);
    if (!leadId) throw new Error('Este prospecto no tiene folio de CRM todavía — no se puede ligar a comentarios.');
    return leadId;
  }
  if (tipo === 'proyecto') {
    if (!body.numero_proyecto_crm) throw new Error('Falta numero_proyecto_crm');
    const projId = await resolverProjectIdCrm(body.numero_proyecto_crm);
    if (!projId) throw new Error(`La póliza ${body.numero_proyecto_crm} no tiene proyecto espejado del CRM todavía.`);
    return projId;
  }
  throw new Error('tipo debe ser "cuenta", "oportunidad", "prospecto" o "proyecto"');
}

async function listarComentarios(crmid) {
  const sessionName = await vtigerLogin();
  const query = `select * from ModComments where related_to='${escaparVtigerQL(crmid)}' order by createdtime desc limit 50;`;
  const url = `${VTIGER_BASE_URL}/webservice.php?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(query)}`;
  const json = await fetch(url).then((r) => r.json());
  if (!json.success) throw new Error('query a ModComments falló: ' + JSON.stringify(json));
  return (json.result || []).map((c) => ({
    id: c.commentsid || c.id || null,
    contenido: c.commentcontent || '',
    fecha: c.createdtime || c.modifiedtime || null,
    // El nombre del campo de autor varía entre instalaciones de Vtiger —
    // se incluyen los candidatos más comunes, el frontend usa el primero
    // que venga con valor.
    autor: c.userid || c.creator || c.smownerid || null,
  }));
}

async function agregarComentario(crmid, comentario) {
  const sessionName = await vtigerLogin();
  const record = { commentcontent: comentario, related_to: crmid };
  const body = new URLSearchParams({ operation: 'create', sessionName, element: JSON.stringify(record), elementType: 'ModComments' });
  const json = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body }).then((r) => r.json());
  if (!json.success) throw new Error('create ModComments falló: ' + JSON.stringify(json));
  return json.result;
}

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ ok: false, error: 'No autorizado' });

  try {
    if (req.method === 'GET') {
      const tipo = req.query?.tipo;
      const crmid = await obtenerCrmId(tipo, req.query || {});
      const comentarios = await listarComentarios(crmid);
      return res.status(200).json({ ok: true, comentarios });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const tipo = body.tipo;
      if (!body.comentario || !body.comentario.trim()) return res.status(400).json({ ok: false, error: 'Falta el texto del comentario' });
      const crmid = await obtenerCrmId(tipo, body);
      const resultado = await agregarComentario(crmid, body.comentario.trim());
      // Jp, 2026-10-14 — se regresa el id del comentario recién creado
      // (ModComments) para poder adjuntarle un documento específico después
      // (ver api/crm-documento.js): Jp pidió que los documentos queden
      // colgados del comentario exacto de la bitácora con el que se suben,
      // no de forma general de la Cuenta — igual que se ve en el CRM.
      return res.status(200).json({ ok: true, comentario_id: resultado?.id || null });
    }
    return res.status(405).json({ ok: false, error: 'Método no soportado' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
