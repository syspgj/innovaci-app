// api/cron/drive-resguardo-check.js
//
// Jp, 2026-11-17 — validación automática de los respaldos de resguardo que se guardan en Google Drive (varias cuentas).
// Igual que Dropbox (api/cron/dropbox-resguardo-check.js) pero con VARIAS carpetas por póliza (tabla resguardo_origenes):
// una póliza como OPEROMAC respalda dos tareas (Publico_full y DAC_full) y las dos deben tener archivo del periodo.
//
// Cómo accede a Drive: una cuenta de servicio de Google (solo lectura). Cada cuenta de Drive comparte la carpeta con el
// correo de la cuenta de servicio (permiso de Lector). La llave JSON vive en la variable de Vercel GOOGLE_DRIVE_SA_JSON.
//
// Regla: el periodo vigente queda cubierto cuando TODAS las carpetas de Drive de la póliza tienen un archivo con fecha de
// modificación dentro del periodo, Y (si la póliza también tiene carpeta de Dropbox) esa también. Entonces se registra la
// evidencia (origen 'drive') y se comenta en el proyecto del CRM. Si falta alguna, no se registra nada y el aviso diario
// de resguardo (resguardo-evidencia-check) sigue marcando la póliza como pendiente.
//
// ?poliza_id=<uuid> revisa solo esa póliza (botón "Revisar Drive ahora"). Corre a las 12:45 UTC, después de Dropbox (12:30)
// y antes de resguardo-evidencia-check (13:00).
//
// Variables: GOOGLE_DRIVE_SA_JSON (nueva) + las ya existentes SUPABASE_*, SYNC_SECRET/CRON_SECRET, VTIGER_*.

import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VTIGER_BASE_URL = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;

function hoyMexico() {
  // Mismo criterio ya usado en el resto de los crons del proyecto.
  const ahora = new Date();
  const cdmx = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
  return cdmx.toISOString().slice(0, 10);
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path} -> ${res.status}: ${await res.text()}`);
}

function fechaMexico(iso) {
  return new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function sbPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Supabase POST ${path} -> ${res.status}: ${JSON.stringify(j)}`);
  return Array.isArray(j) ? j[0] : j;
}

function parsearPeriodicidadBackupSpecs(specs) {
  if (!specs) return null;
  const arr = Array.isArray(specs) ? specs : [specs];
  const linea = arr.find((s) => /backup/i.test(s));
  if (!linea) return null;
  if (/quincenal/i.test(linea)) return 15;
  if (/semanal/i.test(linea)) return 7;
  if (/mensual/i.test(linea)) return 30;
  const porDias = linea.match(/cada\s*(\d+)\s*d[ií]as/i);
  if (porDias) return parseInt(porDias[1], 10);
  if (/diari/i.test(linea)) return 1;
  return null;
}

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

async function vtigerLoginConReintento() {
  let ultimo;
  for (let n = 0; n < 3; n++) {
    try { return await vtigerLogin(); } catch (e) { ultimo = e; await new Promise((r) => setTimeout(r, 2500 + n * 2500)); }
  }
  throw ultimo;
}

async function comentarEnProyectoCrm(numeroProyectoCrm, comentario) {
  try {
    const numero = String(numeroProyectoCrm).replace(/^POL/i, '').replace(/^PROJ/i, '');
    const rows = await sbGet(`proyectos_crm?crm_project_no=eq.${encodeURIComponent('PROJ' + numero)}&select=crm_projectid`);
    const crmid = rows?.[0]?.crm_projectid;
    if (!crmid) return null;
    const sessionName = await vtigerLoginConReintento();
    const record = { commentcontent: comentario, related_to: crmid };
    const body = new URLSearchParams({ operation: 'create', sessionName, element: JSON.stringify(record), elementType: 'ModComments' });
    const json = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body }).then((r) => r.json());
    return json.success ? (json.result?.id || true) : null;
  } catch (e) {
    console.error('comentarEnProyectoCrm falló', e);
    return null;
  }
}

function calcularPeriodoActual(fechaInicioStr, periodicidadDias, hoyStr) {
  const inicio = new Date(fechaInicioStr + 'T00:00:00');
  const hoy = new Date(hoyStr + 'T00:00:00');
  const diffDias = Math.floor((hoy - inicio) / 86400000);
  if (diffDias < 0 || !periodicidadDias) return fechaInicioStr;
  const periodosTranscurridos = Math.floor(diffDias / periodicidadDias);
  const periodoFecha = new Date(inicio.getTime() + periodosTranscurridos * periodicidadDias * 86400000);
  return periodoFecha.toISOString().slice(0, 10);
}


function leerCredencial() {
  const raw = process.env.GOOGLE_DRIVE_SA_JSON;
  if (!raw) return null;
  let j;
  try { j = JSON.parse(raw); } catch (_) { try { j = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (e) { throw new Error('GOOGLE_DRIVE_SA_JSON no es un JSON válido'); } }
  if (!j.client_email || !j.private_key) throw new Error('GOOGLE_DRIVE_SA_JSON no trae client_email/private_key');
  j.private_key = String(j.private_key).replace(/\\n/g, '\n');
  return j;
}

const b64u = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function driveToken(cred) {
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64u(JSON.stringify({ iss: cred.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3300 }));
  const firma = crypto.createSign('RSA-SHA256').update(cab + '.' + cuerpo).sign(cred.private_key);
  const jwt = cab + '.' + cuerpo + '.' + b64u(firma);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Google oauth2/token falló: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}

// Todos los archivos (no carpetas) dentro de la carpeta, entrando a subcarpetas (hasta 3 niveles).
async function driveListarArchivos(token, carpetaId, nivel = 0) {
  const out = [];
  let pageToken = '';
  for (;;) {
    const q = `'${carpetaId}' in parents and trashed=false`;
    const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      q, fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)', pageSize: '1000',
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? { pageToken } : {}),
    });
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (!r.ok) {
      const code = j?.error?.code || r.status;
      if (code === 404) throw new Error('not_found: la carpeta no existe o no está compartida con la cuenta de servicio');
      throw new Error(`Drive list (${carpetaId}) falló: ${j?.error?.message || code}`);
    }
    for (const f of j.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        if (nivel < 3) out.push(...(await driveListarArchivos(token, f.id, nivel + 1)));
      } else out.push(f);
    }
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-sync-secret'];
  const claves = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (claves.length && !claves.includes(secretHeader) && !claves.some((c) => authHeader === `Bearer ${c}`)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  let cred;
  try { cred = leerCredencial(); } catch (e) { return res.status(200).json({ ok: false, error: e.message }); }
  if (!cred) return res.status(200).json({ ok: true, omitido: 'Google Drive no está configurado todavía (falta GOOGLE_DRIVE_SA_JSON).' });

  const hoy = hoyMexico();
  try {
    const soloId = req.query && req.query.poliza_id ? `&cliente_poliza_id=eq.${encodeURIComponent(req.query.poliza_id)}` : '';
    const origenes = await sbGet(`resguardo_origenes?activo=eq.true${soloId}&select=*`);
    if (!origenes.length) return res.status(200).json({ ok: true, hoy, mensaje: 'Sin carpetas de Drive capturadas.' });

    const polizaIds = [...new Set(origenes.map((o) => o.cliente_poliza_id))];
    const polizas = await sbGet(
      `clientes_polizas?id=in.(${polizaIds.join(',')})&estatus=neq.CERRADA&select=id,cliente_nombre,fecha_inicio,resguardo_periodicidad_dias_override,resguardo_dropbox_folder,dropbox_ultimo_archivo,dropbox_ultimo_archivo_fecha,dropbox_revision_error,servidor_cloud_id,numero_proyecto_crm,polizas_catalogo(nombre,categoria,resguardo_periodicidad_dias)`
    );
    const servidorIds = [...new Set(polizas.map((p) => p.servidor_cloud_id).filter(Boolean))];
    const servidorMap = {};
    if (servidorIds.length) {
      (await sbGet(`clientes_servidores_cloud?id=in.(${servidorIds.join(',')})&select=id,productos_servidores(specs)`)).forEach((s) => { servidorMap[s.id] = s; });
    }
    const evidencias = await sbGet(`resguardo_evidencias?cliente_poliza_id=in.(${polizaIds.join(',')})&select=cliente_poliza_id,periodo_fecha`);
    const cubiertos = new Set(evidencias.map((e) => `${e.cliente_poliza_id}|${e.periodo_fecha}`));

    const token = await driveToken(cred);
    const detalle = [];
    const errores = [];
    let registros = 0;

    for (const p of polizas) {
      const periodicidad = p.resguardo_periodicidad_dias_override || p.polizas_catalogo?.resguardo_periodicidad_dias
        || (p.servidor_cloud_id && servidorMap[p.servidor_cloud_id]?.productos_servidores?.specs ? parsearPeriodicidadBackupSpecs(servidorMap[p.servidor_cloud_id].productos_servidores.specs) : null);
      const susOrigenes = origenes.filter((o) => o.cliente_poliza_id === p.id);
      if (!periodicidad || !p.fecha_inicio) { detalle.push({ cliente: p.cliente_nombre, resultado: 'sin periodicidad definida' }); continue; }
      const periodo = calcularPeriodoActual(p.fecha_inicio, periodicidad, hoy);

      const estados = [];
      for (const o of susOrigenes) {
        try {
          const archivos = await driveListarArchivos(token, o.carpeta_id);
          const ult = archivos.length ? archivos.reduce((a, b) => (a.modifiedTime > b.modifiedTime ? a : b)) : null;
          await sbPatch(`resguardo_origenes?id=eq.${o.id}`, {
            revision_at: new Date().toISOString(), ultimo_archivo: ult ? ult.name : null,
            ultimo_archivo_fecha: ult ? ult.modifiedTime : null, archivos_total: archivos.length, error: null,
          });
          const fecha = ult ? fechaMexico(ult.modifiedTime) : null;
          estados.push({ etiqueta: o.etiqueta || o.carpeta_id, ok: !!(fecha && fecha >= periodo), fecha, archivo: ult?.name || null });
        } catch (e) {
          errores.push({ poliza_id: p.id, cliente: p.cliente_nombre, carpeta: o.etiqueta || o.carpeta_id, error: e.message });
          estados.push({ etiqueta: o.etiqueta || o.carpeta_id, ok: false, error: e.message });
          try { await sbPatch(`resguardo_origenes?id=eq.${o.id}`, { revision_at: new Date().toISOString(), error: String(e.message).slice(0, 400) }); } catch (_) {}
        }
      }
      // Si además tiene carpeta de Dropbox, esa también debe estar al corriente (la revisa el cron de Dropbox, que corre antes).
      let dropboxOk = true;
      if (p.resguardo_dropbox_folder) {
        const fd = p.dropbox_ultimo_archivo_fecha ? fechaMexico(p.dropbox_ultimo_archivo_fecha) : null;
        dropboxOk = !!(fd && fd >= periodo && !p.dropbox_revision_error);
        estados.push({ etiqueta: 'Dropbox: ' + p.resguardo_dropbox_folder, ok: dropboxOk, fecha: fd });
      }
      const todoOk = estados.length > 0 && estados.every((e) => e.ok);
      if (!todoOk) { detalle.push({ cliente: p.cliente_nombre, resultado: 'faltan carpetas con respaldo del periodo', periodo, estados }); continue; }
      if (cubiertos.has(`${p.id}|${periodo}`)) { detalle.push({ cliente: p.cliente_nombre, resultado: 'periodo ya cubierto', estados }); continue; }

      const resumen = estados.map((e) => `${e.etiqueta} (${e.fecha})`).join('; ');
      try {
        let crmId = null;
        if (p.numero_proyecto_crm) crmId = await comentarEnProyectoCrm(p.numero_proyecto_crm, `✅ Evidencia de resguardo detectada automáticamente — todas las tareas de respaldo tienen archivo del periodo: ${resumen}.`);
        const masReciente = estados.map((e) => e.fecha).filter(Boolean).sort().slice(-1)[0];
        await sbPost('resguardo_evidencias', {
          cliente_poliza_id: p.id, periodo_fecha: periodo, fecha_subida: new Date().toISOString(), origen: 'drive',
          crm_comentario_id: crmId ? String(crmId) : null,
          nota: `Detectado automático — todas las carpetas con respaldo del periodo: ${resumen}.`,
        });
        registros++;
        detalle.push({ cliente: p.cliente_nombre, resultado: 'evidencia registrada', fecha: masReciente, estados });
      } catch (e) {
        errores.push({ poliza_id: p.id, cliente: p.cliente_nombre, error: e.message });
      }
    }
    res.status(200).json({ ok: true, hoy, polizas_revisadas: polizas.length, registros_creados: registros, errores, detalle });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Error desconocido.' });
  }
}
