// api/crm-documento.js
//
// Jp, 2026-10-13/14 — feature de documentos adjuntos ("que estos documentos
// queden integrados en la aplicación, pero que se repliquen en CRM").
//
// *** Corrección 2026-10-14, tras la primera prueba en vivo de Jp: ***
//   a) El create de Documents fallaba con "ACCESS_DENIED / Permission to
//      perform the operation is denied for id" — causa: faltaba el campo
//      assigned_user_id (Vtiger lo exige para casi cualquier create, igual
//      que ya se sabía por crm-crear-oportunidad.js). Corregido abajo,
//      mismo patrón: usuarios.crm_user_id del vendedor, o el usuario
//      "Analisis" (19x27) de respaldo si no está ligado.
//   b) Jp aclaró que el documento NO debe colgar de forma general de la
//      Cuenta/Oportunidad — debe quedar ligado al comentario ESPECÍFICO de
//      la bitácora con el que se sube (así se ve en el CRM: cada comentario
//      trae su propio archivo, como en la captura que mandó de la
//      Oportunidad de Jordi Enrique Ramos Rivera). Por eso este endpoint
//      ahora acepta un `crm_comentario_id` (el id de ModComments que ya se
//      creó al sincronizar esa actividad — ver api/crm-comentarios.js y
//      api/crm-agregar-comentario.js, los dos ya regresan ese id) y, si
//      viene, relaciona el Document a ESE comentario en vez de a la
//      Cuenta/Oportunidad completa.
//
// Flujo (ver index.html, función compartida subirDocumentoAdjunto):
//   1) El navegador sube el archivo directo a Supabase Storage (bucket
//      "crm-documentos") y guarda una fila en crm_documentos con
//      crm_sync_estatus='pendiente'.
//   2) Se sincroniza primero el comentario de la actividad al CRM (ya
//      existente) y se obtiene su id.
//   3) El navegador llama a este endpoint con el id de la fila de
//      crm_documentos Y el id del comentario. Este endpoint genera una URL
//      firmada de larga duración hacia el archivo en Storage, crea un
//      registro en el módulo "Documents" de Vtiger como "External URL"
//      apuntando a esa URL, y lo relaciona al comentario (o, si no hay
//      comentario, de respaldo a la Cuenta/Oportunidad — compatibilidad).
//
// POST { crm_documento_id (uuid de la fila en crm_documentos), crm_comentario_id?, vendedor_usuario_id? }
//   -> genera la URL firmada, crea el Document en Vtiger, lo relaciona,
//      actualiza crm_documentos.crm_sync_estatus/crm_documento_id/crm_comentario_id/crm_sync_error.
//
// Variables de entorno: las mismas que api/crm-comentarios.js —
// VTIGER_BASE_URL, VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

const VTIGER_USUARIO_RESPALDO = '19x27'; // Analisis — mismo respaldo que los demás endpoints de Fase 3/4.

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

async function resolverAssignedUserId(vendedorUsuarioId) {
  if (!vendedorUsuarioId) return VTIGER_USUARIO_RESPALDO;
  const url = `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(vendedorUsuarioId)}&select=crm_user_id`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) return VTIGER_USUARIO_RESPALDO;
  const rows = await res.json().catch(() => []);
  return rows?.[0]?.crm_user_id || VTIGER_USUARIO_RESPALDO;
}

// Jp, 2026-10-21: "no funciona" — la réplica a Vtiger sigue fallando con
// ACCESS_DENIED incluso con un vendedor real y válido como assigned_user_id
// (Dulce Solano, 19x5), igual antes y después del fix de 2026-10-14 (ver
// crm_documentos.crm_sync_error en Supabase, mismo error exacto en todos los
// intentos). Eso descarta que sea un tema de datos/assigned_user_id — apunta
// a que (a) el usuario de integración de Vtiger (VTIGER_USER) no tiene
// permiso de Crear en el módulo Documents en su Rol/Perfil, o (b) el
// folderid 'T2' (adivinado, ver nota original) no es válido en esta
// instalación. Esta función consulta el "describe" del módulo Documents para
// adjuntar al error justo qué carpetas existen de verdad — así, si vuelve a
// fallar, el mensaje que ve Jp en la app ya trae la pista concreta en vez de
// tener que pedir que se revise Supabase a mano.
// Jp, 2026-10-28: confirmó que "Analisis" ya tiene Rol Administrador en
// Vtiger — un Administrador se salta cualquier chequeo de permiso por
// módulo, así que el describe() sin "folderid" visible probablemente NO es
// un tema de permisos como se pensó el 21/oct. La otra posibilidad real:
// que el módulo Folder esté genuinamente vacío en esta instalación (nunca
// se creó ninguna carpeta desde la UI de Vtiger) y por eso 'T2' (adivinado)
// no exista — Documents siempre exige un folderid válido. Esta función
// ahora, además del describe, consulta directo el módulo Folder vía
// query() (funciona aunque describe() no muestre el picklist) para traer
// las carpetas reales que sí existen, con su id — así el próximo error que
// vea Jp ya trae el dato concreto para decidir si hay que crear una carpeta
// en Vtiger o solo corregir el folderid fijo de este código.
async function listarCarpetasVtiger(sessionName) {
  try {
    const query = `select * from DocumentFolders;`;
    const url = `${VTIGER_BASE_URL}/webservice.php?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(query)}`;
    const json = await fetch(url).then((r) => r.json());
    if (!json.success) return `query a Folder falló: ${JSON.stringify(json.error || json)}`;
    const carpetas = (json.result || []).map((f) => ({ id: f.folderid || f.id, name: f.foldername }));
    return carpetas.length
      ? `Carpetas reales encontradas en Vtiger (módulo Folder): ${JSON.stringify(carpetas)}`
      : 'El módulo Folder de Vtiger está vacío — no existe ninguna carpeta todavía (por eso el folderid fijo \'T2\' que usa este código probablemente no es válido). Hay que crear al menos una carpeta en Vtiger (Documents → Nueva carpeta) y después ajustar el folderid aquí.';
  } catch (e) {
    return `No se pudo consultar el módulo Folder: ${String(e?.message || e)}`;
  }
}

async function diagnosticarPermisosDocuments(sessionName) {
  try {
    const url = `${VTIGER_BASE_URL}/webservice.php?operation=describe&sessionName=${encodeURIComponent(sessionName)}&elementType=Documents`;
    const json = await fetch(url).then((r) => r.json());
    const carpetasReales = await listarCarpetasVtiger(sessionName);
    if (!json.success) return `No se pudo consultar describe(Documents): ${JSON.stringify(json.error || json)}. ${carpetasReales}`;
    const campoFolder = (json.result?.fields || []).find((f) => f.name === 'folderid');
    const carpetasDescribe = campoFolder?.picklistValues || campoFolder?.referenceTo || null;
    const partesDescribe = carpetasDescribe
      ? `Carpetas/valores disponibles para "folderid" según describe(): ${JSON.stringify(carpetasDescribe).slice(0, 500)}`
      : 'describe(Documents) no trae opciones de carpeta visibles.';
    return `${partesDescribe} — ${carpetasReales}`;
  } catch (e) {
    return `No se pudo diagnosticar (describe falló): ${String(e?.message || e)}`;
  }
}

// Jp, 2026-10-30 — CAUSA REAL del ACCESS_DENIED (confirmada con el error en
// pantalla: "Permission to perform the operation is denied for id" en el
// create, y "denied for name : Folder" en el query): en el webservice de
// Vtiger "Folder" NO es un módulo consultable — el módulo de carpetas de
// Documents se llama "DocumentFolders", y su id de webservice NO es un número
// suelto ni algo como 'T2' sino "<id del tipo>x<id>" (típicamente "22x1" para
// la carpeta "Default"). Un folderid con formato inválido hace que Vtiger
// responda justo "denied for id", y eso se confundió con un tema de permisos.
// Como no se puede asumir el id del tipo en esta instalación, se prueban en
// orden: (1) las carpetas reales que devuelva query a DocumentFolders, (2)
// candidatos comunes "22x1".."22x4"; se usa el primero con el que el create
// funcione y se cachea para el resto de la invocación.
let _folderIdCache = null;
async function candidatosFolderId(sessionName) {
  const candidatos = [];
  try {
    const query = `select * from DocumentFolders;`;
    const url = `${VTIGER_BASE_URL}/webservice.php?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(query)}`;
    const json = await fetch(url).then((r) => r.json());
    if (json.success && Array.isArray(json.result)) {
      // Prefiere "Default"/"Documents" si existen.
      const orden = [...json.result].sort((a, b) => (/default|documents?$/i.test(b.foldername || '') ? 1 : 0) - (/default|documents?$/i.test(a.foldername || '') ? 1 : 0));
      orden.forEach((f) => { if (f.id) candidatos.push(String(f.id)); });
    }
  } catch (_) { /* se sigue con los candidatos fijos */ }
  ['22x1', '22x2', '22x3', '22x4'].forEach((c) => { if (!candidatos.includes(c)) candidatos.push(c); });
  return candidatos;
}

async function crearDocumentoVtiger(sessionName, nombreArchivo, urlFirmada, notas, assignedUserId) {
  const ext = (nombreArchivo.split('.').pop() || '').toLowerCase();
  const base = {
    // Jp, 2026-10-30 — con la carpeta 22x1 ya aceptada, el siguiente error fue
    // MANDATORY_FIELDS_MISSING "notes_title does not have a value": en Documents
    // el título es "notes_title" (no "notes"), y la descripción es "notecontent".
    notes_title: nombreArchivo,
    notecontent: notas || '',
    filename: nombreArchivo,
    filetype: ext || 'bin',
    filelocationtype: 'E', // E = External URL (no se sube el binario a Vtiger, solo se liga)
    fileurl: urlFirmada,
    filestatus: 1,
    assigned_user_id: assignedUserId,
  };
  const candidatos = _folderIdCache ? [_folderIdCache] : await candidatosFolderId(sessionName);
  const intentos = [];
  for (const folderid of candidatos) {
    const body = new URLSearchParams({ operation: 'create', sessionName, element: JSON.stringify({ ...base, folderid }), elementType: 'Documents' });
    const json = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body }).then((r) => r.json());
    if (json.success) { _folderIdCache = folderid; return json.result; }
    intentos.push(`${folderid}: ${JSON.stringify(json.error || json)}`);
    // Solo se sigue probando otra carpeta si el rechazo es por el id; cualquier
    // otro error (permiso real del módulo, campo obligatorio) no mejora cambiando de carpeta.
    if (!/denied for id|folderid|folder/i.test(JSON.stringify(json.error || json))) break;
  }
  throw new Error('create Documents falló — carpetas probadas: ' + intentos.join(' | '));
}

// Jp, 2026-10-30 — con el create de Documents ya funcionando (se crea el
// documento en Vtiger: 15x184251), el siguiente paso fallaba en silencio:
// "addRelatedRecord" NO es una operación de webservice que exista en Vtiger
// (responde cuerpo vacío -> "Unexpected end of JSON input"), así que el
// documento quedaba suelto en el módulo Documents sin ligarse a nada. Vtiger
// 7 expone la relación como operación "add_related" (sourceRecordId = el
// registro padre, relatedRecordId = el documento, relationIdLabel =
// "Documents"). Como el nombre exacto varía entre versiones, se prueban las
// variantes en orden y se lee la respuesta como texto (nunca .json() directo,
// para que un cuerpo vacío no truene).
async function postVtigerRaw(params) {
  const res = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body: new URLSearchParams(params) });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch (_) { /* respuesta no JSON */ }
  return { status: res.status, texto, json };
}

async function relacionarDocumento(sessionName, crmId, documentoId) {
  const docId = documentoId.id || documentoId.documentsid || documentoId;
  const variantes = [
    { operation: 'add_related', sessionName, sourceRecordId: crmId, relatedRecordId: docId, relationIdLabel: 'Documents' },
    { operation: 'add_related', sessionName, sourceRecordId: crmId, relatedRecordId: docId, relationIdLabel: 'Documentos' },
    { operation: 'addRelated', sessionName, sourceRecordId: crmId, relatedRecordId: docId, relationIdLabel: 'Documents' },
    { operation: 'addRelatedRecord', sessionName, id: crmId, relatedId: docId },
  ];
  const intentos = [];
  for (const v of variantes) {
    try {
      const r = await postVtigerRaw(v);
      if (r.json && r.json.success) return { ok: true, operacion: v.operation, relationIdLabel: v.relationIdLabel };
      intentos.push(`${v.operation}${v.relationIdLabel ? '/' + v.relationIdLabel : ''}: ${r.json ? JSON.stringify(r.json.error || r.json) : `HTTP ${r.status}, cuerpo ${r.texto ? r.texto.slice(0, 120) : 'vacío'}`}`);
    } catch (e) {
      intentos.push(`${v.operation}: ${String(e?.message || e)}`);
    }
  }
  throw new Error('no se pudo relacionar el documento — ' + intentos.join(' | '));
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
    const { crm_documento_id, crm_comentario_id, vendedor_usuario_id } = body;
    if (!crm_documento_id) return res.status(400).json({ ok: false, error: 'Falta crm_documento_id' });

    const fila = await obtenerFilaDocumento(crm_documento_id);
    if (!fila) return res.status(404).json({ ok: false, error: 'No existe ese documento en crm_documentos' });

    // Jp, 2026-10-14: prioridad — si viene el id del comentario de bitácora
    // con el que se subió el archivo, el documento se relaciona a ESE
    // comentario (como en el CRM real). Si no viene (caso de respaldo, o
    // llamadas viejas), se cae al comportamiento anterior: relacionar de
    // forma general a la Cuenta/Oportunidad.
    let crmId = crm_comentario_id || null;
    let relacionadoAComentario = !!crm_comentario_id;
    if (!crmId) {
      if (fila.entidad_tipo === 'cuenta' && fila.cliente_cartera_id) {
        const numCliente = await obtenerNumClienteDeCuenta(fila.cliente_cartera_id);
        if (numCliente) crmId = await resolverAccountIdCrm(numCliente);
      } else if (fila.entidad_tipo === 'oportunidad' && fila.pipeline_vendedor_id) {
        crmId = await obtenerPotentialIdDeOportunidad(fila.pipeline_vendedor_id);
      }
    }

    const assignedUserId = await resolverAssignedUserId(vendedor_usuario_id || fila.subido_por);
    const urlFirmada = await crearUrlFirmada(fila.storage_path);
    const sessionName = await vtigerLogin();
    let documento;
    try {
      documento = await crearDocumentoVtiger(sessionName, fila.nombre_archivo, urlFirmada, `Subido desde App VENTAS`, assignedUserId);
    } catch (eCrear) {
      const diagnostico = await diagnosticarPermisosDocuments(sessionName);
      throw new Error(`${eCrear?.message || eCrear} — ${diagnostico}`);
    }

    // Se intenta ligar primero al comentario de bitácora (si viene) y, si Vtiger
    // no admite documentos en ModComments, al registro padre (Oportunidad o
    // Cuenta) — así el documento al menos queda visible en la pestaña
    // Documentos de la Oportunidad/Cuenta en vez de suelto.
    let padreId = null;
    if (fila.entidad_tipo === 'cuenta' && fila.cliente_cartera_id) {
      const numCliente = await obtenerNumClienteDeCuenta(fila.cliente_cartera_id);
      if (numCliente) padreId = await resolverAccountIdCrm(numCliente);
    } else if (fila.entidad_tipo === 'oportunidad' && fila.pipeline_vendedor_id) {
      padreId = await obtenerPotentialIdDeOportunidad(fila.pipeline_vendedor_id);
    }
    let relacionError = null;
    const objetivos = [...new Set([crmId, padreId].filter(Boolean))];
    if (objetivos.length) {
      const fallos = [];
      let ligado = false;
      for (const objetivo of objetivos) {
        try {
          await relacionarDocumento(sessionName, objetivo, documento);
          ligado = true;
          break;
        } catch (e) {
          fallos.push(`${objetivo}: ${String(e?.message || e)}`);
        }
      }
      if (!ligado) relacionError = fallos.join(' || ');
    } else {
      relacionError = 'No se encontró el registro de Vtiger (Cuenta/Oportunidad) para relacionar — el documento se creó suelto.';
    }

    await actualizarFilaDocumento(crm_documento_id, {
      crm_documento_id: documento.id || documento.documentsid || null,
      crm_comentario_id: crm_comentario_id || null,
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
