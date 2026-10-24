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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;

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
  let body = { path, recursive: false, include_deleted: false };
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
  if (
    process.env.SYNC_SECRET &&
    secretHeader !== process.env.SYNC_SECRET &&
    authHeader !== `Bearer ${process.env.SYNC_SECRET}`
  ) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    return res.status(200).json({ ok: true, omitido: 'Dropbox no está configurado todavía (faltan variables de entorno).' });
  }

  const hoy = hoyMexico();

  try {
    const polizas = await sbGet(
      `clientes_polizas?estatus=neq.CERRADA&resguardo_dropbox_folder=not.is.null&select=id,cliente_nombre,fecha_inicio,resguardo_periodicidad_dias_override,resguardo_dropbox_folder,servidor_cloud_id,polizas_catalogo!inner(nombre,categoria,resguardo_periodicidad_dias)&polizas_catalogo.categoria=eq.RESGUARDO`
    );
    if (!polizas.length) {
      return res.status(200).json({ ok: true, hoy, mensaje: 'Sin pólizas de resguardo con carpeta de Dropbox capturada.' });
    }

    const servidorIds = [...new Set(polizas.map((p) => p.servidor_cloud_id).filter(Boolean))];
    let servidorMap = {};
    if (servidorIds.length) {
      const servidores = await sbGet(
        `clientes_servidores_cloud?id=in.(${servidorIds.join(',')})&select=id,productos_servidores(specs)`
      );
      servidores.forEach((s) => { servidorMap[s.id] = s; });
    }

    const polizaIds = polizas.map((p) => p.id);
    const evidencias = await sbGet(
      `resguardo_evidencias?cliente_poliza_id=in.(${polizaIds.join(',')})&select=cliente_poliza_id,periodo_fecha`
    );
    const periodosYaCubiertos = new Set(evidencias.map((e) => `${e.cliente_poliza_id}|${e.periodo_fecha}`));

    let accessToken = null;
    let registrosCreados = 0;
    let errores = [];

    for (const p of polizas) {
      const periodicidadDias = p.resguardo_periodicidad_dias_override || p.polizas_catalogo?.resguardo_periodicidad_dias
        || (p.servidor_cloud_id && servidorMap[p.servidor_cloud_id]?.productos_servidores?.specs
          ? parsearPeriodicidadBackupSpecs(servidorMap[p.servidor_cloud_id].productos_servidores.specs)
          : null);
      if (!periodicidadDias || !p.fecha_inicio) continue;

      const periodoActual = calcularPeriodoActual(p.fecha_inicio, periodicidadDias, hoy);
      if (periodosYaCubiertos.has(`${p.id}|${periodoActual}`)) continue; // ya tiene evidencia de este periodo (manual o Dropbox) — no hace falta consultar Dropbox

      try {
        if (!accessToken) accessToken = await dropboxAccessToken();
        const archivos = await dropboxListarArchivos(accessToken, p.resguardo_dropbox_folder);
        if (!archivos.length) continue;

        const masReciente = archivos.reduce((a, b) => (a.server_modified > b.server_modified ? a : b));
        const fechaArchivo = masReciente.server_modified.slice(0, 10); // server_modified es ISO UTC
        if (fechaArchivo >= periodoActual) {
          await sbPost('resguardo_evidencias', {
            cliente_poliza_id: p.id,
            periodo_fecha: periodoActual,
            fecha_subida: masReciente.server_modified,
            origen: 'dropbox',
            dropbox_path: masReciente.path_display,
            nota: `Detectado automático en Dropbox (${p.resguardo_dropbox_folder}) — archivo "${masReciente.name}" del ${fechaArchivo}.`,
          });
          registrosCreados++;
        }
      } catch (e) {
        errores.push({ poliza_id: p.id, cliente: p.cliente_nombre, carpeta: p.resguardo_dropbox_folder, error: e.message });
      }
    }

    res.status(200).json({
      ok: true,
      hoy,
      polizas_revisadas: polizas.length,
      registros_creados: registrosCreados,
      errores,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Error desconocido.' });
  }
}
