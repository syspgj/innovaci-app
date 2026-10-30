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
  // Jp, 2026-10-30 — la liga externa (tipo 'E') usa una URL firmada de Supabase
  // que CADUCA, así que el documento en el CRM quedaba muerto al rato. Primero
  // se intenta subir el archivo REAL a Vtiger (tipo 'I', multipart, como lo
  // hace la interfaz); si el servidor no lo acepta, se cae al tipo 'E'.
  try {
    const resp = await fetch(urlFirmada);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const mime = resp.headers.get('content-type') || 'application/octet-stream';
      for (const folderid of candidatos) {
        const fd = new FormData();
        fd.append('operation', 'create');
        fd.append('sessionName', sessionName);
        fd.append('elementType', 'Documents');
        fd.append('element', JSON.stringify({ ...base, filelocationtype: 'I', fileurl: '', filesize: buf.byteLength, filetype: mime, folderid }));
        fd.append('filename', new Blob([buf], { type: mime }), nombreArchivo);
        const r = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body: fd });
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch (_) {}
        if (j && j.success) { _folderIdCache = folderid; j.result._modo = 'archivo real (I)'; return j.result; }
        intentos.push(`I/${folderid}: ${j ? JSON.stringify(j.error || j) : `HTTP ${r.status} ${t.slice(0, 80)}`}`);
        if (!/denied for id|folderid|folder/i.test(t)) break;
      }
    }
  } catch (e) { intentos.push('I: ' + String(e?.message || e)); }
  for (const folderid of candidatos) {
    const body = new URLSearchParams({ operation: 'create', sessionName, element: JSON.stringify({ ...base, folderid }), elementType: 'Documents' });
    const json = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body }).then((r) => r.json());
    if (json.success) { _folderIdCache = folderid; return json.result; }
    intentos.push(`${folderid}: ${JSON.stringify(json.error || json)}`);
    // Solo se sigue probando otra carpeta si el rechazo es por el id; cualquier
    // otro error (permiso real del módulo, campo obligatorio) no mejora cambiando de carpeta.
    if (!/denied for id|folderid|folder/i.test(JSON.stringify(json.error || json))) break;
  }
  throw new Error('create Documents falló — intentos: ' + intentos.join(' | '));
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


// Verifica que el Document de verdad quede relacionado al registro padre.
async function verificarRelacionDocumento(sessionName, padreId, docId) {
  try {
    const url = `${VTIGER_BASE_URL}/webservice.php?operation=retrieve_related&sessionName=${encodeURIComponent(sessionName)}&id=${encodeURIComponent(padreId)}&relatedType=Documents&relatedLabel=Documents`;
    const texto = await fetch(url).then((r) => r.text());
    return !!docId && texto.includes(String(docId).split('x').pop()) && /"success"\s*:\s*true/.test(texto);
  } catch (_) { return false; }
}

// Jp, 2026-10-30 (4a vuelta): la prueba mostró que el webservice de Vtiger
// NO adjunta binarios a un ModComments (el comentario salió con filename "0"),
// y que add_related responde success sin dejar la relación. Lo que SÍ funciona
// y es verificable: el Document queda creado en Vtiger (módulo Documentos) y se
// publica en la Oportunidad/Cuenta una respuesta al comentario con el enlace
// directo a ese documento. Sin emojis (llegaban como "????").
async function adjuntarAComentario(sessionName, { padreId, comentarioPadreId, nombre, docId, assignedUserId }) {
  const numId = String(docId || '').split('x').pop();
  // Base fija del CRM (la misma que usa el front); VTIGER_BASE_URL no sirve para enlaces de navegador.
  const enlace = `http://crminn.dynns.com/innova/index.php?module=Documents&view=Detail&record=${numId}`;
  const linea = `Archivo adjunto: ${nombre}\nVer documento en CRM: ${enlace}`;
  const notas = [];
  // 1) Preferido: agregar el enlace AL MISMO comentario de bitácora (así se ve
  //    directo en Comentarios, sin tener que abrir "Responder").
  if (comentarioPadreId) {
    try {
      const g = await fetch(`${VTIGER_BASE_URL}/webservice.php?operation=retrieve&sessionName=${encodeURIComponent(sessionName)}&id=${encodeURIComponent(comentarioPadreId)}`).then((r) => r.json());
      if (g.success && g.result) {
        const el = { ...g.result, commentcontent: `${g.result.commentcontent || ''}\n\n${linea}` };
        const u = await postVtigerRaw({ operation: 'update', sessionName, element: JSON.stringify(el) });
        if (u.json && u.json.success) return { verificado: true, resumen: `comentario ${comentarioPadreId} actualizado con enlace al documento ${docId}` };
        notas.push('update: ' + (u.json ? JSON.stringify(u.json.error || u.json) : `HTTP ${u.status} ${u.texto.slice(0, 100)}`));
      } else notas.push('retrieve: ' + JSON.stringify(g.error || g));
    } catch (e) { notas.push('update falló: ' + String(e?.message || e)); }
  }
  // 2) Respaldo: nueva respuesta con el enlace.
  const element = { commentcontent: linea, related_to: padreId, assigned_user_id: assignedUserId };
  if (comentarioPadreId) element.parent_comments = comentarioPadreId;
  const r = await postVtigerRaw({ operation: 'create', sessionName, elementType: 'ModComments', element: JSON.stringify(element) });
  if (!(r.json && r.json.success)) throw new Error(`create ModComments: ${r.json ? JSON.stringify(r.json.error || r.json) : `HTTP ${r.status} ${r.texto.slice(0, 100)}`}`);
  return { verificado: true, resumen: `respuesta ${r.json.result?.id} con enlace (${notas.join('; ') || 'sin comentario padre'})` };
}


// ─── Jp, 2026-10-30 (camino 2) ─────────────────────────────────────────────
// El botón "Adjuntar archivos" del CRM NO usa el webservice: manda comentario +
// archivo en un solo POST multipart a index.php (module=ModComments,
// action=SaveAjax, campos commentcontent, related_to, parent_comments,
// is_private, filename[] y el token CSRF __vtrftk), con sesión web iniciada.
// Aquí se imita: login web con usuario/contraseña de integración (variables de
// entorno VTIGER_UI_USER y VTIGER_UI_PASSWORD; si no existen, se omite este
// paso y se usa el enlace como respaldo).
const CRM_WEB_BASE = process.env.VTIGER_WEB_BASE_URL || 'http://crminn.dynns.com/innova';

function guardarCookies(jar, res) {
  const lista = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of lista) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    if (i > 0) jar[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  }
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
function extraerToken(html) {
  const m = html.match(/name=["']__vtrftk["'][^>]*value=["']([^"']+)["']/) || html.match(/value=["']([^"']+)["'][^>]*name=["']__vtrftk["']/) || html.match(/csrfMagicToken\s*=\s*["'](sid:[^"']+)["']/);
  return m ? m[1] : null;
}

async function adjuntarComentarioWeb({ relatedNumId, texto, buffer, nombre, mime }) {
  const usuario = process.env.VTIGER_UI_USER || process.env.VTIGER_USER;
  const clave = process.env.VTIGER_UI_PASSWORD;
  if (!clave) throw new Error('falta VTIGER_UI_PASSWORD en Vercel (se omite el adjunto real)');
  const jar = {};
  // 1) página de login -> cookie de sesión + token
  let r = await fetch(`${CRM_WEB_BASE}/index.php`, { redirect: 'follow' });
  guardarCookies(jar, r);
  let token = extraerToken(await r.text());
  if (!token) throw new Error('no se encontró el token CSRF en la página de login');
  // 2) login
  r = await fetch(`${CRM_WEB_BASE}/index.php?module=Users&action=Login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(jar) },
    body: new URLSearchParams({ __vtrftk: token, username: usuario, password: clave }),
  });
  guardarCookies(jar, r);
  const loc = r.headers.get('location') || '';
  if (r.status < 300 || r.status > 399 || /Login|error/i.test(loc)) throw new Error(`login web rechazado (HTTP ${r.status}, location ${loc.slice(0, 80)})`);
  // 3) token fresco ya con sesión
  r = await fetch(`${CRM_WEB_BASE}/index.php?module=Home&view=DashBoard`, { redirect: 'follow', headers: { Cookie: cookieHeader(jar) } });
  guardarCookies(jar, r);
  token = extraerToken(await r.text());
  if (!token) throw new Error('login hecho pero sin token CSRF en la sesión');
  // 4) comentario + archivo (igual que el botón Publicar del CRM)
  const fd = new FormData();
  fd.append('__vtrftk', token);
  fd.append('module', 'ModComments');
  fd.append('action', 'SaveAjax');
  fd.append('commentcontent', texto);
  fd.append('related_to', String(relatedNumId));
  fd.append('parent_comments', '');
  fd.append('is_private', '0');
  fd.append('filename[]', new Blob([buffer], { type: mime }), nombre);
  r = await fetch(`${CRM_WEB_BASE}/index.php`, { method: 'POST', body: fd, headers: { Cookie: cookieHeader(jar), 'X-Requested-With': 'XMLHttpRequest' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (!(j && j.success)) throw new Error(`SaveAjax: HTTP ${r.status} ${t.slice(0, 200)}`);
  return { resumen: `comentario web creado con adjunto real: ${JSON.stringify(j.result || {}).slice(0, 200)}` };
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

    // Jp, 2026-10-30 (3a vuelta): el documento se creaba y la app decía "en CRM"
    // pero en el CRM no se veía nada. Dos causas: (1) un Document ligado por
    // relación NO es lo mismo que un archivo adjunto a un comentario (lo que
    // Jp ve al usar "Adjuntar archivos" en la pestaña Comentarios), y (2) el
    // código daba por buena la relación sin comprobarla. Ahora: se publica una
    // RESPUESTA al comentario con el archivo adjunto real (multipart, igual que
    // el botón de Vtiger), se liga además el Document al registro padre, y solo
    // se marca 'ok' si se COMPRUEBA en Vtiger. Si no, queda 'error' con la traza.
    let padreId = null;
    if (fila.entidad_tipo === 'cuenta' && fila.cliente_cartera_id) {
      const numCliente = await obtenerNumClienteDeCuenta(fila.cliente_cartera_id);
      if (numCliente) padreId = await resolverAccountIdCrm(numCliente);
    } else if (fila.entidad_tipo === 'oportunidad' && fila.pipeline_vendedor_id) {
      padreId = await obtenerPotentialIdDeOportunidad(fila.pipeline_vendedor_id);
    }
    const docId = documento.id || documento.documentsid || null;
    const traza = [];
    let verificado = false;

    // (A) Adjunto real en un comentario (respuesta al comentario de bitácora).
    let adjuntoReal = false;
    if (padreId) {
      try {
        const rf = await fetch(urlFirmada);
        if (!rf.ok) throw new Error('no se pudo bajar el archivo: HTTP ' + rf.status);
        const rw = await adjuntarComentarioWeb({
          relatedNumId: String(padreId).split('x').pop(),
          texto: `Archivo adjunto: ${fila.nombre_archivo}`,
          buffer: await rf.arrayBuffer(),
          nombre: fila.nombre_archivo,
          mime: rf.headers.get('content-type') || 'application/octet-stream',
        });
        adjuntoReal = true; verificado = true;
        traza.push('ADJUNTO REAL: ' + rw.resumen);
      } catch (e) { traza.push('adjunto real FALLÓ: ' + String(e?.message || e)); }
    }
    if (padreId && !adjuntoReal) {
      try {
        const r = await adjuntarAComentario(sessionName, { padreId, comentarioPadreId: crm_comentario_id, nombre: fila.nombre_archivo, docId, assignedUserId });
        traza.push('modo documento: ' + (documento._modo || 'liga externa (E)') + ' || adjunto-comentario: ' + r.resumen);
        if (r.verificado) verificado = true;
      } catch (e) { traza.push('adjunto-comentario FALLÓ: ' + String(e?.message || e)); }
    }
    // (B) Relación del Document al registro padre (pestaña Documentos).
    const objetivos = [...new Set([padreId, crmId].filter(Boolean))];
    for (const objetivo of objetivos) {
      try {
        const rel = await relacionarDocumento(sessionName, objetivo, documento);
        const ok = await verificarRelacionDocumento(sessionName, objetivo, docId);
        traza.push(`relación ${objetivo} vía ${rel.operacion}: ${ok ? 'VERIFICADA' : 'respondió success pero NO aparece en retrieve_related'}`);
        if (ok) { verificado = true; break; }
      } catch (e) { traza.push(`relación ${objetivo}: ${String(e?.message || e)}`); }
    }
    if (!objetivos.length) traza.push('No se encontró el registro padre en Vtiger.');
    const relacionError = verificado ? null : 'NO verificado en Vtiger — ' + traza.join(' || ');

    await actualizarFilaDocumento(crm_documento_id, {
      crm_documento_id: docId,
      crm_comentario_id: crm_comentario_id || null,
      crm_sync_estatus: verificado ? 'ok' : 'error',
      crm_sync_error: verificado ? ('diag: ' + traza.join(' || ')).slice(0, 1500) : relacionError.slice(0, 1500),
    });

    return res.status(200).json({ ok: true, verificado, crm_documento_id: docId, relacion_error: relacionError, traza });
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
