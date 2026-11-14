// api/dropbox-carpetas.js
//
// Jp, 2026-11-14 — buscador de carpetas de Dropbox para la póliza de resguardo.
// Cuando la carpeta capturada no existe (o no se sabe cómo se llama), desde la
// app se pueden ver las carpetas reales de Dropbox y elegir la correcta con un
// clic, en lugar de teclear la ruta a ciegas.
//
// POST /api/dropbox-carpetas   body: { "path": "/Espacio familiar" }   ("" = raíz)
//   -> { ok:true, path, carpetas:[{nombre, path}], archivos: <número de archivos en ese nivel> }
//   -> { ok:false, error:'not_found', path }  si la ruta no existe (la app vuelve a la raíz)
//
// Solo LEE (list_folder no recursivo). Exige sesión válida de Supabase
// (Authorization: Bearer <token>). Usa las mismas variables que el cron:
// DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no soportado' });
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'No autorizado' });
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    return res.status(200).json({ ok: false, error: 'Dropbox no está configurado todavía (faltan variables de entorno).' });
  }

  try {
    // Valida que el token sea una sesión real de la app.
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: auth },
    });
    if (!u.ok) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    let path = String((body && body.path) || '').trim();
    if (path === '/') path = '';
    path = path.replace(/\/+$/, '');
    if (path && !path.startsWith('/')) path = '/' + path;

    const token = await dropboxAccessToken();
    const carpetas = [];
    let archivos = 0;
    let url = 'https://api.dropboxapi.com/2/files/list_folder';
    let payload = { path, recursive: false, include_deleted: false, limit: 2000 };
    for (let n = 0; n < 20; n++) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const resumen = j?.error_summary || JSON.stringify(j);
        if (/not_found/i.test(resumen)) return res.status(200).json({ ok: false, error: 'not_found', path });
        return res.status(200).json({ ok: false, error: 'Dropbox: ' + resumen });
      }
      for (const e of j.entries || []) {
        if (e['.tag'] === 'folder') carpetas.push({ nombre: e.name, path: e.path_display });
        else if (e['.tag'] === 'file') archivos++;
      }
      if (!j.has_more) break;
      url = 'https://api.dropboxapi.com/2/files/list_folder/continue';
      payload = { cursor: j.cursor };
    }
    carpetas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    return res.status(200).json({ ok: true, path, carpetas, archivos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
