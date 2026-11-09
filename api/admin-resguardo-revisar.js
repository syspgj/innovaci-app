// api/admin-resguardo-revisar.js
//
// Jp, 2026-11-09 — botón "🔄 Revisar Dropbox ahora" en el detalle de una póliza
// de resguardo (y en la lista): dispara la misma revisión que corre sola una vez
// al día (api/cron/dropbox-resguardo-check.js), sin esperar al cron ni tener que
// mandar el secreto a mano. El secreto lo agrega este servidor; nunca llega al
// navegador.
//
// POST /api/admin-resguardo-revisar            -> revisa todas las pólizas de resguardo
// POST /api/admin-resguardo-revisar?poliza_id= -> revisa solo esa póliza
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
    // Valida que el token sea una sesión real de la app.
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: auth },
    });
    if (!u.ok) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

    const polizaId = req.query && req.query.poliza_id ? String(req.query.poliza_id) : '';
    const url = `${SITE_URL}/api/cron/dropbox-resguardo-check${polizaId ? '?poliza_id=' + encodeURIComponent(polizaId) : ''}`;
    const r = await fetch(url, { headers: { 'x-sync-secret': SYNC_SECRET } });
    const j = await r.json().catch(() => ({}));
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok && j.ok !== false, status: r.status, ...j });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
