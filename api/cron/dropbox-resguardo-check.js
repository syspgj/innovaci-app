// api/cron/dropbox-resguardo-check.js
//
// Jp, 2026-10-24 — complemento al sistema de alertas de evidencia de
// resguardo (Lote 18, claude/mesa-control-operaciones.md): valida de forma
// automática, contra la cuenta de Dropbox donde se guardan los respaldos de
// los clientes, si ya se subió el archivo del periodo vigente — sin que
// Mesa de Control tenga que subirlo manualmente a la app.
//
// Jp confirmó: (1) Dropbox personal/Plus, no Business; (2) complementa la
// carga manual, no la sustituye — si Mesa de Control sube el archivo a mano
// en la app, sigue funcionando igual; (3) una carpeta por cliente, pero el
// nombre de la carpeta es un "nombre corto" informal que no coincide con
// razón social/ACC####/POL####, así que el mapeo carpeta↔póliza es manual
// (campo clientes_polizas.resguardo_dropbox_folder, lo llena quien capture
// la póliza); (4) el criterio para considerar cumplido el periodo es que
// exista CUALQUIER archivo con fecha de modificación dentro de la ventana
// del periodo vigente — no se exige un patrón de nombre.
//
// Qué hace, una vez al día (antes de api/cron/resguardo-evidencia-check.js,
// para que si Dropbox ya tiene el archivo no se genere una incidencia de
// soporte de balde):
//   1. Toma las pólizas de categoría RESGUARDO, activas, que ya tienen
//      resguardo_dropbox_folder capturado.
//   2. Para las que NO tienen todavía un registro en resguardo_evidencias
//      para su periodo vigente, consulta esa carpeta en Dropbox
//      (files/list_folder) y busca el archivo más reciente.
//   3. Si su fecha de modificación cae dentro del periodo vigente, inserta
//      el registro en resguardo_evidencias con origen='dropbox' y
//      dropbox_path=<ruta del archivo> — exactamente como si Mesa de
//      Control lo hubiera subido a mano, así resguardo-evidencia-check.js
//      ya lo ve resuelto.
//
// Variables de entorno nuevas (ya configuradas en Vercel, 2026-10-24):
//   DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN
// Reutiliza las ya existentes: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SYNC_SECRET.
//
// Cómo se usa:
//   1. Coloca este archivo en api/cron/dropbox-resguardo-check.js.
//   2. Agrega la entrada en vercel.json ANTES de la hora de
//      resguardo-evidencia-check (que corre a las 14:20 UTC) — por ejemplo
//      "10 14 * * *".
//   3. Sube el archivo a tu repo como siempre y Vercel despliega solo.

import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;

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

// Fecha (YYYY-MM-DD) en hora de México de un timestamp ISO UTC.
function fechaMexico(iso) {
  return new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ── Fecha tomada del NOMBRE del archivo (Jp, 2026-11-18) ──────────────────
// RADIACION Y DOSIMETRIA: su servidor tiene la pila del BIOS dañada y pierde
// la hora; aunque un sincronizador se la corrige cada 15 minutos, los
// respaldos se suben con fecha de modificación por default (enero de 2016).
// La fecha REAL viene en el nombre del archivo
// (HOMEFOLDERS_NAS_20261113_Inc_v1.pbd -> 13-nov-2026), así que esa manda
// cuando el nombre la trae; si no, se usa la fecha de modificación como antes.
function fechaDesdeNombreArchivo(nombre) {
  const m = String(nombre || '').match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (!m) return null;
  const [, a, mes, dia] = m;
  const mm = parseInt(mes, 10), dd = parseInt(dia, 10), aa = parseInt(a, 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || aa < 2015) return null;
  const iso = `${a}-${mes}-${dia}`;
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null; // p.ej. 20261345
  if (d.getTime() > Date.now() + 2 * 86400000) return null; // fecha futura: no es de fiar
  return d.toISOString();
}
// Fecha efectiva de un archivo: la del nombre si la trae, si no la de modificación.
function fechaEfectivaArchivo(nombre, fechaModificacion) {
  return fechaDesdeNombreArchivo(nombre) || fechaModificacion || null;
}

// ── Constancia en el servidor cloud (Jp, 2026-11-18) ─────────────────────
// "cada que se valide el resguardo, sea manual o automático, se tiene que
// lanzar un comentario hacia el servidor como evidencia de que se está
// resguardando": además del comentario en el proyecto del CRM de la póliza,
// se deja una entrada en la bitácora del servidor cloud del cliente y, si ese
// servidor tiene su propio proyecto en el CRM, también se comenta ahí.
async function constanciaEnServidor({ servidor, polizaId, periodo, origen, texto, archivo, crmComentarioId }) {
  if (!servidor) return null;
  let crmServidorId = null;
  if (servidor.numero_proyecto_crm) {
    crmServidorId = await comentarEnProyectoCrm(servidor.numero_proyecto_crm, texto);
  }
  try {
    await sbPost('servidores_bitacora', {
      servidor_cloud_id: servidor.id,
      cliente_poliza_id: polizaId,
      tipo: 'resguardo_validado',
      periodo_fecha: periodo,
      origen,
      texto,
      archivo: archivo || null,
      crm_comentario_id: crmComentarioId ? String(crmComentarioId) : null,
      crm_comentario_servidor_id: crmServidorId ? String(crmServidorId) : null,
    });
  } catch (e) {
    // El índice único evita constancias repetidas del mismo periodo; si choca
    // o falla, no se detiene la revisión (la evidencia ya quedó registrada).
    console.error('servidores_bitacora', e.message || e);
  }
  return crmServidorId;
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

// Duplicado a propósito de api/cron/resguardo-evidencia-check.js — mismo
// criterio que comentarEnProyectoCrm() en ese archivo: este cron corre
// server-to-server y necesita su propia copia de la lógica de periodos.
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

// Vtiger invalida el "challenge" de un usuario cuando otro proceso pide uno nuevo al mismo tiempo. Los crons de
// sincronización con el CRM corren a las :05, :07 y :10 (14, 17, 19, 21 y 1 h UTC), justo cuando corría este cron, y por
// eso el login fallaba a veces con INVALID_USER_CREDENTIALS (visto en los logs de Vercel el 2026-11-14 14:10).
// 2026-11-14: se reintenta hasta 3 veces con espera, y el cron se movió a una hora sin choques.
async function vtigerLoginConReintento() {
  let ultimo;
  for (let n = 0; n < 3; n++) {
    try { return await vtigerLogin(); } catch (e) { ultimo = e; await new Promise((r) => setTimeout(r, 2500 + n * 2500)); }
  }
  throw ultimo;
}

// Comenta en el Proyecto CRM espejado de la póliza — Jp, 2026-10-26: "cada
// subida de evidencia, ya sea que lo hagamos automáticamente porque
// detectamos en el Dropbox algo, o porque subieron los de mesa de control
// manualmente evidencia del resguardo, se debe de colocar en CRM el
// comentario en el proyecto". Mismo patrón duplicado que
// api/cron/resguardo-evidencia-check.js (comentarEnProyectoCrm) — este cron
// corre server-to-server sin sesión de usuario.
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

async function dropboxAccessToken() {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: DROPBOX_REFRESH_TOKEN,
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('Dropbox oauth2/token falló: ' + JSON.stringify(j));
  return j.access_token;
}

// Devuelve todos los archivos (no carpetas) de una carpeta de Dropbox,
// paginando con /continue si hace falta (mismo cuidado de paginación que
// el resto del proyecto aplica siempre a Supabase/PostgREST — aquí es la
// paginación nativa de la API de Dropbox).
async function dropboxListarArchivos(accessToken, path) {
  let entradas = [];
  // recursive:true — los respaldos reales viven en subcarpetas (ej. ARES/ARES_backup_DAC/…_Full_v1.pbd), 2026-11-09.
  let body = { path, recursive: true, include_deleted: false };
  let url = 'https://api.dropboxapi.com/2/files/list_folder';
  for (;;) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) {
      const err = j?.error_summary || JSON.stringify(j);
      throw new Error(`Dropbox list_folder (${path}) falló: ${err}`);
    }
    entradas.push(...(j.entries || []));
    if (!j.has_more) break;
    url = 'https://api.dropboxapi.com/2/files/list_folder/continue';
    body = { cursor: j.cursor };
  }
  return entradas.filter((e) => e['.tag'] === 'file');
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-sync-secret'];
  // Vercel Cron manda "Authorization: Bearer <CRON_SECRET>" en cada corrida programada
  // (2026-11-09: sin aceptar CRON_SECRET el cron diario era rechazado con 401 y nunca corría).
  // Las llamadas manuales siguen usando SYNC_SECRET.
  const claves = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (
    claves.length &&
    !claves.includes(secretHeader) &&
    !claves.some((c) => authHeader === `Bearer ${c}`)
  ) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    return res.status(200).json({ ok: true, omitido: 'Dropbox no está configurado todavía (faltan variables de entorno).' });
  }

  const hoy = hoyMexico();

  try {
    // 2026-11-09: ?poliza_id=<uuid> revisa solo esa póliza (botón "Revisar Dropbox ahora" del detalle).
    const soloId = req.query && req.query.poliza_id ? `&id=eq.${encodeURIComponent(req.query.poliza_id)}` : '';
    // Jp, 2026-11-18 — RAMTAV CONTADORES: "ellos tienen 3 tareas... todos están en
    // Dropbox, entonces se necesitan 3 carpetas". Igual que Drive, una póliza puede
    // tener varias carpetas de Dropbox (tabla resguardo_origenes, proveedor='dropbox');
    // se siguen aceptando las pólizas con la carpeta única de siempre
    // (clientes_polizas.resguardo_dropbox_folder). El periodo se da por cumplido
    // cuando TODAS tienen archivo del periodo.
    let origenesDropbox = [];
    try { origenesDropbox = await sbGet(`resguardo_origenes?activo=eq.true&proveedor=eq.dropbox&select=*`); } catch (_) { /* tabla aún no creada */ }
    const idsConCarpetasDropbox = [...new Set(origenesDropbox.map((o) => o.cliente_poliza_id))].join(',')
      || '00000000-0000-0000-0000-000000000000';
    const polizas = await sbGet(
      `clientes_polizas?estatus=neq.CERRADA&or=(resguardo_dropbox_folder.not.is.null,id.in.(${idsConCarpetasDropbox}))${soloId}&select=id,cliente_nombre,fecha_inicio,resguardo_periodicidad_dias_override,resguardo_dropbox_folder,servidor_cloud_id,numero_proyecto_crm,polizas_catalogo!inner(nombre,categoria,resguardo_periodicidad_dias)&polizas_catalogo.categoria=eq.RESGUARDO`
    );
    if (!polizas.length) {
      return res.status(200).json({ ok: true, hoy, mensaje: 'Sin pólizas de resguardo con carpeta de Dropbox capturada.' });
    }

    const servidorIds = [...new Set(polizas.map((p) => p.servidor_cloud_id).filter(Boolean))];
    let servidorMap = {};
    if (servidorIds.length) {
      const servidores = await sbGet(
        `clientes_servidores_cloud?id=in.(${servidorIds.join(',')})&select=id,nombre_servidor,numero_proyecto_crm,productos_servidores(specs)`
      );
      servidores.forEach((s) => { servidorMap[s.id] = s; });
    }

    const polizaIds = polizas.map((p) => p.id);
    const evidencias = await sbGet(
      `resguardo_evidencias?cliente_poliza_id=in.(${polizaIds.join(',')})&select=cliente_poliza_id,periodo_fecha`
    );
    const periodosYaCubiertos = new Set(evidencias.map((e) => `${e.cliente_poliza_id}|${e.periodo_fecha}`));
    // 2026-11-17: si la póliza además tiene carpetas de Google Drive (resguardo_origenes), el periodo lo cierra
    // api/cron/drive-resguardo-check.js cuando TODAS las carpetas (Dropbox + Drive) tienen archivo del periodo.
    let conOrigenes = new Set();
    try {
      conOrigenes = new Set(
        (await sbGet(`resguardo_origenes?activo=eq.true&proveedor=eq.drive&select=cliente_poliza_id`)).map((o) => o.cliente_poliza_id)
      );
    } catch (_) { /* tabla aún no creada */ }

    let accessToken = null;
    let registrosCreados = 0;
    let errores = [];

    const detalle = [];
    for (const p of polizas) {
      const periodicidadDias = p.resguardo_periodicidad_dias_override || p.polizas_catalogo?.resguardo_periodicidad_dias
        || (p.servidor_cloud_id && servidorMap[p.servidor_cloud_id]?.productos_servidores?.specs
          ? parsearPeriodicidadBackupSpecs(servidorMap[p.servidor_cloud_id].productos_servidores.specs)
          : null);
      if (!periodicidadDias || !p.fecha_inicio) {
        detalle.push({ cliente: p.cliente_nombre, resultado: 'sin periodicidad definida' });
        continue;
      }

      const periodoActual = calcularPeriodoActual(p.fecha_inicio, periodicidadDias, hoy);
      const yaCubierto = periodosYaCubiertos.has(`${p.id}|${periodoActual}`);

      try {
        if (!accessToken) accessToken = await dropboxAccessToken();
        // Todas las carpetas de Dropbox de esta póliza: la "clásica" (una sola, en
        // clientes_polizas) más las que estén capturadas en resguardo_origenes.
        const carpetas = [];
        if (p.resguardo_dropbox_folder) carpetas.push({ legacy: true, path: p.resguardo_dropbox_folder, etiqueta: p.resguardo_dropbox_folder });
        for (const o of origenesDropbox.filter((x) => x.cliente_poliza_id === p.id)) {
          carpetas.push({ origen: o, path: o.carpeta_id, etiqueta: o.etiqueta || o.carpeta_id });
        }
        if (!carpetas.length) { detalle.push({ cliente: p.cliente_nombre, resultado: 'sin carpetas de Dropbox' }); continue; }

        // Se consulta Dropbox siempre (aunque el periodo ya esté cubierto) para dejar
        // registrado cuál es el último archivo real de cada carpeta.
        const estados = [];
        for (const c of carpetas) {
          try {
            const archivos = (await dropboxListarArchivos(accessToken, c.path))
              .map((f) => ({ ...f, fechaEfectiva: fechaEfectivaArchivo(f.name, f.server_modified) }));
            const ult = archivos.length ? archivos.reduce((a, b) => (a.fechaEfectiva > b.fechaEfectiva ? a : b)) : null;
            if (c.legacy) {
              await sbPatch(`clientes_polizas?id=eq.${p.id}`, {
                dropbox_revision_at: new Date().toISOString(),
                dropbox_ultimo_archivo: ult ? ult.path_display : null,
                dropbox_ultimo_archivo_fecha: ult ? ult.fechaEfectiva : null,
                dropbox_archivos_total: archivos.length,
                dropbox_revision_error: null,
              });
            } else {
              await sbPatch(`resguardo_origenes?id=eq.${c.origen.id}`, {
                revision_at: new Date().toISOString(),
                ultimo_archivo: ult ? ult.name : null,
                ultimo_archivo_fecha: ult ? ult.fechaEfectiva : null,
                archivos_total: archivos.length,
                error: null,
              });
            }
            const fecha = ult ? fechaMexico(ult.fechaEfectiva) : null;
            estados.push({ etiqueta: c.etiqueta, ok: !!(fecha && fecha >= periodoActual), fecha, archivo: ult ? ult.name : null, path: ult ? ult.path_display : null });
          } catch (e) {
            errores.push({ poliza_id: p.id, cliente: p.cliente_nombre, carpeta: c.path, error: e.message });
            estados.push({ etiqueta: c.etiqueta, ok: false, error: e.message });
            try {
              if (c.legacy) await sbPatch(`clientes_polizas?id=eq.${p.id}`, { dropbox_revision_at: new Date().toISOString(), dropbox_revision_error: String(e.message).slice(0, 400) });
              else await sbPatch(`resguardo_origenes?id=eq.${c.origen.id}`, { revision_at: new Date().toISOString(), error: String(e.message).slice(0, 400) });
            } catch (_) { /* no bloquea el resto */ }
          }
        }

        const resumen = estados.map((e) => `${e.etiqueta} (${e.fecha || (e.error ? 'error' : 'vacía')})`).join('; ');
        if (yaCubierto) { detalle.push({ cliente: p.cliente_nombre, resultado: 'periodo ya cubierto', estados }); continue; }
        if (!estados.every((e) => e.ok)) {
          detalle.push({ cliente: p.cliente_nombre, resultado: carpetas.length > 1 ? 'faltan carpetas con respaldo del periodo' : 'sin archivo del periodo', periodo: periodoActual, estados });
          continue;
        }
        if (conOrigenes.has(p.id)) {
          detalle.push({ cliente: p.cliente_nombre, resultado: 'Dropbox al corriente; falta validar las carpetas de Drive', estados });
          continue;
        }

        const textoEvidencia = carpetas.length > 1
          ? `Detectado automático en Dropbox — las ${carpetas.length} tareas de respaldo tienen archivo del periodo: ${resumen}.`
          : `Detectado automático en Dropbox (${carpetas[0].etiqueta}) — archivo "${estados[0].archivo}" del ${estados[0].fecha}.`;
        let crmComentarioId = null;
        if (p.numero_proyecto_crm) crmComentarioId = await comentarEnProyectoCrm(p.numero_proyecto_crm, `✅ Evidencia de resguardo — ${textoEvidencia}`);
        const fechaMasReciente = estados.map((e) => e.fecha).filter(Boolean).sort().slice(-1)[0] || null;
        await sbPost('resguardo_evidencias', {
          cliente_poliza_id: p.id,
          periodo_fecha: periodoActual,
          fecha_subida: new Date().toISOString(),
          origen: 'dropbox',
          dropbox_path: estados.map((e) => e.path).filter(Boolean).join(' · ').slice(0, 400) || null,
          crm_comentario_id: crmComentarioId ? String(crmComentarioId) : null,
          nota: textoEvidencia,
        });
        await constanciaEnServidor({
          servidor: p.servidor_cloud_id ? servidorMap[p.servidor_cloud_id] : null,
          polizaId: p.id, periodo: periodoActual, origen: 'dropbox',
          texto: `✅ Resguardo validado (Dropbox) — ${p.cliente_nombre}, periodo ${periodoActual}. ${resumen}.`,
          archivo: estados.map((e) => e.archivo).filter(Boolean).join(' · ').slice(0, 300) || null,
          crmComentarioId: crmComentarioId,
        });
        registrosCreados++;
        detalle.push({ cliente: p.cliente_nombre, resultado: 'evidencia registrada', fecha: fechaMasReciente, estados });
      } catch (e) {
        errores.push({ poliza_id: p.id, cliente: p.cliente_nombre, carpeta: p.resguardo_dropbox_folder, error: e.message });
        detalle.push({ cliente: p.cliente_nombre, resultado: 'error', error: e.message });
        try {
          await sbPatch(`clientes_polizas?id=eq.${p.id}`, { dropbox_revision_at: new Date().toISOString(), dropbox_revision_error: String(e.message).slice(0, 400) });
        } catch (_) { /* no bloquea el resto */ }
      }
    }

    res.status(200).json({
      ok: true,
      hoy,
      polizas_revisadas: polizas.length,
      registros_creados: registrosCreados,
      errores,
      detalle,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Error desconocido.' });
  }
}
