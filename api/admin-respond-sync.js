// api/admin-respond-sync.js
//
// Jp, 2026-11-18 — botón "Sincronizar ahora" de Respond.io: dispara la misma
// revisión que corre sola cada hora (api/cron/respond-sync-contactos.js), sin
// esperar al cron ni mandar el secreto a mano. El secreto lo agrega este
// servidor; nunca llega al navegador.
//
// POST /api/admin-respond-sync              -> continúa el barrido
// POST /api/admin-respond-sync?reiniciar=1  -> empieza el barrido desde cero
// POST /api/admin-respond-sync?simulacion=1 -> solo cuenta lo que haría, sin escribir
//
// Exige una sesión de Supabase válida (Authorization: Bearer <token>).

const SYNC_SECRET = process.env.SYNC_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SYNC_SITE_URL || 'https://os.innovaci.com.mx';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no soportado' });
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'No autorizado' });
  if (!SYNC_SECRET) return res.status(500).json({ ok: false, error: 'Falta SYNC_SECRET en el servidor' });

  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: auth },
    });
    if (!u.ok) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

    const q = new URLSearchParams();
    if (req.query && req.query.reiniciar === '1') q.set('reiniciar', '1');
    if (req.query && req.query.simulacion === '1') q.set('simulacion', '1');
    const cola = q.toString() ? '?' + q.toString() : '';
    const r = await fetch(`${SITE_URL}/api/cron/respond-sync-contactos${cola}`, {
      headers: { 'x-sync-secret': SYNC_SECRET },
    });
    const j = await r.json().catch(() => ({}));
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok && j.ok !== false, status: r.status, ...j });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
