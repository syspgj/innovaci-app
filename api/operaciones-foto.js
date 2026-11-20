// api/operaciones-foto.js — Proxy para mostrar una foto de Telegram (evidencia
// del reporte del asesor) dentro de la app. Requiere sesión (token de Supabase).
// Uso desde el navegador: <img src="/api/operaciones-foto?file_id=...&token=<access_token>">
const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = process.env.TELEGRAM_BOT_TOKEN;

async function sesionValida(req) {
  const a = req.headers.authorization || '';
  const t = a.startsWith('Bearer ') ? a.slice(7) : ((req.query && req.query.token) || '');
  if (!t) return false;
  try { const r = await fetch(`${SURL}/auth/v1/user`, { headers: { Authorization: `Bearer ${t}`, apikey: SKEY } }); return r.ok; } catch (e) { return false; }
}

export default async function handler(req, res) {
  try {
    if (!BOT) return res.status(500).send('Falta TELEGRAM_BOT_TOKEN');
    if (!(await sesionValida(req))) return res.status(401).send('No autorizado');
    const fileId = (req.query && req.query.file_id) || '';
    if (!fileId || !/^[\w-]+$/.test(String(fileId))) return res.status(400).send('file_id inválido');
    const fi = await (await fetch(`https://api.telegram.org/bot${BOT}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
    const fp = fi && fi.result && fi.result.file_path;
    if (!fp) return res.status(404).send('No encontrada');
    const fr = await fetch(`https://api.telegram.org/file/bot${BOT}/${fp}`);
    if (!fr.ok) return res.status(502).send('No se pudo bajar');
    const buf = Buffer.from(await fr.arrayBuffer());
    const ext = (fp.split('.').pop() || 'jpg').toLowerCase();
    res.setHeader('Content-Type', ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send('Error');
  }
}
