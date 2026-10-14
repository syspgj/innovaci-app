// api/crm-documento.js
//
// Jp, 2026-10-14 — segunda parte del feature de documentos adjuntos que pidió
// el 13/oct ("necesitamos agregar la posibilidad de agregar documentos, que
// estos documentos queden integrados en la aplicación, pero que se repliquen
// en CRM, porque CRM tiene esa función de agregar documentos"). Autorizado
// explícitamente a construir "ambos niveles" (Supabase + replicar en Vtiger).
//
// Flujo (ver también index.html, funciones fcSubirDocumentoCrm / pipeSubirDocumentoCrm):
//   1) El navegador sube el archivo directo a Supabase Storage (bucket
//      "crm-documentos") y guarda una fila en la tabla crm_documentos con
//      crm_sync_estatus='pendiente'.
//   2) El navegador llama a este endpoint con el id de esa fila. Este
//      endpoint genera una URL firmada de larga duración hacia el archivo en
//      Storage, y crea un registro en el módulo "Documents" de Vtiger como
//      "External URL" apuntando a esa URL firmada (no sube el binario a
//      Vtiger — eso sería un segundo paso, más adelante, si se necesita).
//   3) Si Vtiger lo soporta, además liga el documento al registro de la
//      Cuenta u Oportunidad (operation=addRelatedRecord). Si esa relación en
//      particular no existe en esta instalación de Vtiger, el documento igual
//      queda creado (solo no se ve colgado del folio) y se reporta el error
//      de la relación aparte, sin tronar todo el request.
//
// *** NOTA PARA Jp: esta es la primera vez que se prueba crear/relacionar
// documentos contra este Vtiger en vivo — los nombres de campos del módulo
// Documents (filelocationtype, folderid, etc.) son los estándar de Vtiger,
// pero cada instalación puede tener variaciones (folderid obligatorio con
// otro valor, campos custom, etc.). Si al probarlo el create falla, revisa el
// mensaje de error que regresa (lo mandamos tal cual del webservice) — con
// eso ajustamos el payload, igual que se hizo con "Tipo de Servicio" en
// api/crm-describir-oportunidades.js. ***
//
// POST { crm_documento_id (uuid de la fila en crm_documentos) }
//   -> genera la URL firmada, crea el Document en Vtiger, intenta relacionarlo,
//      actualiza crm_documentos.crm_sync_estatus/crm_documento_id/crm_sync_error.
//
// Variables de entorno: las mismas que api/crm-comentarios.js —
// VTIGER_BASE_URL, VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

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
  if (!challengeJson.success) throw new Error('getchallenge falló: ' + JSON.stringify(challengeJson));
  const token = challengeJson.result.token;
  const accessKeyHash = md5(token + VTIGER_ACCESS_KEY);
  const loginBody = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: accessKeyHash });
  const loginJson = await fetch(`${VTIGER_BASE_URL}/webservice.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginBody,
  }).then((r) => r.json());
  if (!loginJson.success) throw new Error('login falló: ' + JSON.stringify(loginJson));
  return loginJson.result.sessionName;
}

function escaparVtigerQL(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function resolverAccountIdCrm(numCliente) {
  const url = `${SUPABASE_URL}/rest/v1/stg_cuentas_crm_raw?account_no=eq.${encodeURIComponent(numCliente)}&select=crm_record_id`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error('No se pudo consultar stg_cuentas_crm_raw: ' + (await res.text()));
  const rows = await res.json();
  return rows?.[0]?.crm_record_id || null;
}

async function obtenerFilaDocumento(id) {
  const url = `${SUPABASE_URL}/rest/v1/crm_documentos?id=eq.${encodeURIComponent(id)}&select=*`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error('No se pudo consultar crm_documentos: ' + (await res.text()));
  const rows = await res.json();
  return rows?.[0] || null;
}

async function obtenerNumClienteDeCuenta(clienteCarteraId) {
  const url = `${SUPABASE_URL}/rest/v1/clientes_cartera?id=eq.${encodeURIComponent(clienteCarteraId)}&select=num_cliente`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error('No se pudo consultar clientes_cartera: ' + (await res.text()));
  const rows = await res.json();
  return rows?.[0]?.num_cliente || null;
}

async function obtenerPotentialIdDeOportunidad(pipelineVendedorId) {
  const url = `${SUPABASE_URL}/rest/v1/pipeline_vendedor?id=eq.${encodeURIComponent(pipelineVendedorId)}&select=oportunidad_crm_id`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error('No se pudo consultar pipeline_vendedor: ' + (await res.text()));
  const rows = await res.json();
  const oportunidadCrmId = rows?.[0]?.oportunidad_crm_id;
  if (!oportunidadCrmId) return null;
  const url2 = `${SUPABASE_URL}/rest/v1/oportunidades_crm?id=eq.${encodeURIComponent(oportunidadCrmId)}&select=crm_potentialid`;
  const res2 = await fetch(url2, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res2.ok) throw new Error('No se pudo consultar oportunidades_crm: ' + (await res2.text()));
  const rows2 = await res2.json();
  return rows2?.[0]?.crm_potentialid || null;
}

async function crearUrlFirmada(storagePath) {
  // 7 días — suficiente para que quien revise el Document en Vtiger lo pueda
  // abrir; si se necesita más, se puede volver a generar llamando de nuevo.
  const url = `${SUPABASE_URL}/storage/v1/object/sign/crm-documentos/${storagePath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.signedURL) throw new Error('No se pudo firmar la URL del archivo: ' + JSON.stringify(json));
  return `${SUPABASE_URL}/storage/v1${json.signedURL}`;
}

async function crearDocumentoVtiger(sessionName, nombreArchivo, urlFirmada, notas) {
  const ext = (nombreArchivo.split('.').pop() || '').toLowerCase();
  const record = {
    notes: notas || nombreArchivo,
    filename: nombreArchivo,
    filetype: ext || 'bin',
    filelocationtype: 'E', // E = External URL (no se sube el binario a Vtiger, solo se liga)
    fileurl: urlFirmada,
    filestatus: 1,
    folderid: 'T2', // carpeta raíz por defecto de Vtiger — si esta instalación usa otra, ajustar aquí
  };
  const body = new URLSearchParams({ operation: 'create', sessionName, element: JSON.stringify(record), elementType: 'Documents' });
  const json = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body }).then((r) => r.json());
  if (!json.success) throw new Error('create Documents falló: ' + JSON.stringify(json));
  return json.result;
}

async function relacionarDocumento(sessionName, crmId, documentoId) {
  const body = new URLSearchParams({ operation: 'addRelatedRecord', sessionName, id: crmId, relatedId: documentoId.id || documentoId.documentsid || documentoId });
  const json = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body }).then((r) => r.json());
  if (!json.success) throw new Error('addRelatedRecord falló: ' + JSON.stringify(json));
  return json.result;
}

async function actualizarFilaDocumento(id, cambios) {
  const url = `${SUPABASE_URL}/rest/v1/crm_documentos?id=eq.${encodeURIComponent(id)}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(cambios),
  });
}

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ ok: false, error: 'No autorizado' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no soportado' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { crm_documento_id } = body;
    if (!crm_documento_id) return res.status(400).json({ ok: false, error: 'Falta crm_documento_id' });

    const fila = await obtenerFilaDocumento(crm_documento_id);
    if (!fila) return res.status(404).json({ ok: false, error: 'No existe ese documento en crm_documentos' });

    // Resuelve el id real de Vtiger (Cuenta u Oportunidad) para relacionar.
    let crmId = null;
    if (fila.entidad_tipo === 'cuenta' && fila.cliente_cartera_id) {
      const numCliente = await obtenerNumClienteDeCuenta(fila.cliente_cartera_id);
      if (numCliente) crmId = await resolverAccountIdCrm(numCliente);
    } else if (fila.entidad_tipo === 'oportunidad' && fila.pipeline_vendedor_id) {
      crmId = await obtenerPotentialIdDeOportunidad(fila.pipeline_vendedor_id);
    }

    const urlFirmada = await crearUrlFirmada(fila.storage_path);
    const sessionName = await vtigerLogin();
    const documento = await crearDocumentoVtiger(sessionName, fila.nombre_archivo, urlFirmada, `Subido desde App VENTAS`);

    let relacionError = null;
    if (crmId) {
      try {
        await relacionarDocumento(sessionName, crmId, documento);
      } catch (e) {
        relacionError = String(e?.message || e);
      }
    } else {
      relacionError = 'No se encontró el registro de Vtiger (Cuenta/Oportunidad) para relacionar — el documento se creó suelto.';
    }

    await actualizarFilaDocumento(crm_documento_id, {
      crm_documento_id: documento.id || documento.documentsid || null,
      crm_sync_estatus: relacionError ? 'error' : 'ok',
      crm_sync_error: relacionError,
    });

    return res.status(200).json({ ok: true, crm_documento_id: documento.id || documento.documentsid || null, relacion_error: relacionError });
  } catch (err) {
    // Best-effort: si algo falla, el archivo ya quedó guardado en Supabase
    // Storage y la fila en crm_documentos — solo no se replicó a Vtiger.
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (body?.crm_documento_id) {
        await actualizarFilaDocumento(body.crm_documento_id, { crm_sync_estatus: 'error', crm_sync_error: String(err?.message || err) });
      }
    } catch (_) {}
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
