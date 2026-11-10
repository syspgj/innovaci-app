// api/circulo-solicitud-avisar.js
//
// Jp, 2026-11-09 — nuevo proceso de alta en Círculo Innovaci: Ventas solicita el alta desde la
// ficha de la cuenta (serie validada por el sistema) y la solicitud pasa directo a Capacitación;
// si la suscripción aún no aparece en los reportes, primero la autoriza Dirección. Este endpoint
// avisa por Telegram al canal "Diplomados y Cursos Coordinación" cuando una solicitud queda
// PENDIENTE DE CAPACITACIÓN (la otra notificación es el aviso emergente dentro de la app).
// Best-effort: si falla, la solicitud ya quedó guardada.
//
// Variables de entorno (ya existen): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
//   TELEGRAM_ASIGNACIONES_CHAT_ID (canal Diplomados y Cursos) o, si no existe,
//   TELEGRAM_CAPACITACION_CHAT_ID.
// Entrada (POST JSON, sesión Bearer): { solicitud_id, reenviar?: boolean }
// Sin 'reenviar' no repite el aviso (circulo_altas_solicitud.telegram_avisado_at).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ASIGNACIONES_CHAT_ID || process.env.TELEGRAM_CAPACITACION_CHAT_ID;
const UUID = /^[0-9a-f-]{36}$/i;
const esc = (t) => String(t == null ? '' : t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function sesionValida(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SKEY } });
  return r.ok;
}
async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${path} -> ${r.status}: ${await r.text()}`);
  return opts.method === 'PATCH' ? null : r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!SUPABASE_URL || !SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' });
    if (!BOT || !CHAT) return res.status(200).json({ ok: false, error: 'Falta TELEGRAM_BOT_TOKEN o el chat de Telegram (TELEGRAM_ASIGNACIONES_CHAT_ID / TELEGRAM_CAPACITACION_CHAT_ID)' });
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const id = String(body.solicitud_id || '');
    if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'Falta solicitud_id' });

    const s = (await sb(`circulo_altas_solicitud?id=eq.${id}&select=*`))[0];
    if (!s) return res.status(200).json({ ok: false, error: 'No se encontró la solicitud' });
    if (s.estado !== 'pendiente_capacitacion') return res.status(200).json({ ok: true, omitido: true, motivo: 'La solicitud no está pendiente de Capacitación' });
    if (s.telegram_avisado_at && body.reenviar !== true) return res.status(200).json({ ok: true, yaEnviado: true });

    const L = [];
    L.push('🌐 <b>NUEVA SOLICITUD DE ALTA — CÍRCULO INNOVACI</b>');
    L.push('');
    L.push(`Empresa: ${esc(s.empresa || '—')}`);
    L.push(`Socio: ${esc(s.nombre)} · ${esc(s.email)}${s.telefono ? ' · ' + esc(s.telefono) : ''}`);
    L.push(`Especialidad: ${esc(s.especialidad)} · Plan Socio`);
    L.push(`Serie Aspel: <code>${esc(s.numserie || '—')}</code>`);
    L.push(s.via === 'direccion'
      ? `✅ Autorizada por Dirección (la suscripción aún no aparece en los reportes)${s.autorizado_por_nombre ? ': ' + esc(s.autorizado_por_nombre) : ''}`
      : '✅ Suscripción vigente y pagada, validada por el sistema');
    L.push(`Solicitó: ${esc(s.solicitado_por_nombre || '—')}`);
    if (s.notas) L.push(`Nota: ${esc(s.notas)}`);
    L.push('');
    L.push('Revalida y da de alta en Círculo Admin → "Solicitudes de alta".');

    const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: L.join('\n'), parse_mode: 'HTML' }),
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'Telegram: ' + (await r.text()).slice(0, 300) });
    const ahora = new Date().toISOString();
    try { await sb(`circulo_altas_solicitud?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ telegram_avisado_at: ahora }) }); } catch (e) { /* el aviso ya salió */ }
    return res.status(200).json({ ok: true, enviado_at: ahora });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
