// api/odoo-cursos.js
//
// Lista los cursos de eLearning de Odoo (slide.channel) para ligarlos a una
// generación de Academia. SOLO LECTURA. Nunca devuelve la clave.
//
// GET/POST con sesión (Bearer token). Parámetro opcional q (texto a buscar).
// Respuesta: { ok, cursos:[{id,name}] }
// Variables Vercel: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY, SUPABASE_SERVICE_ROLE_KEY.

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
    if (!URL_ || !DB || !LOGIN || !KEY) return res.status(200).json({ ok: false, error: 'Odoo no está configurado en Vercel.' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    const q = String((body && body.q) || (req.query && req.query.q) || '').trim().slice(0, 100);

    const uid = await rpc(URL_, 'common', 'authenticate', [DB, LOGIN, KEY, {}]);
    if (!uid) return res.status(200).json({ ok: false, error: 'Odoo rechazó el login/clave. Usa "Probar conexión Odoo" en Academia.' });

    const dominio = q ? [['name', 'ilike', q]] : [];
    const cursos = await rpc(URL_, 'object', 'execute_kw', [DB, uid, KEY, 'slide.channel', 'search_read', [dominio], { fields: ['id', 'name'], order: 'name', limit: 300 }]);
    return res.status(200).json({ ok: true, cursos: (cursos || []).map((c) => ({ id: c.id, name: c.name })) });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
