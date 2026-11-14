// api/odoo-probar.js
//
// Prueba de conexión a Odoo (Academia) — SOLO LECTURA, no modifica nada.
// Jp, 2026-11-14: antes de construir la asignación automática de cursos,
// confirma que las variables de Vercel funcionan y qué ve la API.
//
// Entrada: GET/POST con sesión (Bearer token) de un usuario de la App.
// Variables Vercel: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY,
//                   SUPABASE_SERVICE_ROLE_KEY (para validar la sesión).
// Respuesta: { ok, version, uid, cursos_total, cursos_muestra[] } — nunca devuelve la clave.

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sesionValida(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SURL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SKEY } });
  return r.ok;
}

async function rpc(url, service, method, args) {
  const r = await fetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error((j.error.data && j.error.data.message) || j.error.message || 'Error de Odoo');
  return j.result;
}

export default async function handler(req, res) {
  try {
    if (!SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });

    const URL_ = String(process.env.ODOO_URL || '').trim().replace(/\/+$/, '');
    const DB = String(process.env.ODOO_DB || '').trim();
    const LOGIN = String(process.env.ODOO_LOGIN || '').trim();
    const KEY = String(process.env.ODOO_API_KEY || '').trim();
    const faltan = [['ODOO_URL', URL_], ['ODOO_DB', DB], ['ODOO_LOGIN', LOGIN], ['ODOO_API_KEY', KEY]].filter((x) => !x[1]).map((x) => x[0]);
    if (faltan.length) return res.status(200).json({ ok: false, error: 'Faltan variables en Vercel: ' + faltan.join(', ') });

    const ver = await rpc(URL_, 'common', 'version', []);
    const uid = await rpc(URL_, 'common', 'authenticate', [DB, LOGIN, KEY, {}]);
    if (!uid) return res.status(200).json({ ok: false, version: ver && ver.server_version, error: 'Odoo rechazó el login/clave (revisa ODOO_LOGIN y ODOO_API_KEY)' });

    const call = (model, m, a, kw) => rpc(URL_, 'object', 'execute_kw', [DB, uid, KEY, model, m, a, kw || {}]);
    const total = await call('slide.channel', 'search_count', [[]]);
    const muestra = await call('slide.channel', 'search_read', [[]], { fields: ['name', 'enroll', 'total_slides'], limit: 5, order: 'id desc' });
    let permisoInscribir = null;
    try { permisoInscribir = await call('slide.channel.partner', 'check_access_rights', ['create', false]); } catch (e) { permisoInscribir = 'no verificable'; }

    return res.status(200).json({
      ok: true, version: ver && ver.server_version, uid,
      cursos_total: total, cursos_muestra: muestra,
      puede_inscribir_alumnos: permisoInscribir,
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
