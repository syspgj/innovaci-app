// api/facturacion-avisar-telegram.js
//
// Avisa al canal de Telegram "INN - Facturación - Validación de pagos" cada
// vez que un vendedor envía una solicitud de factura desde la app (Jp,
// 2026-11-06). Best-effort: si falla, la solicitud ya quedó guardada.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/facturacion-avisar-telegram.js  del repo.
//   2. Variables de entorno en Vercel (ya existen las dos primeras):
//        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN
//      Nueva:
//        TELEGRAM_FACTURACION_CHAT_ID  → id del canal (empieza con -100…)
//   3. El bot (el mismo de Capacitación) debe ser ADMINISTRADOR del canal con
//      permiso para publicar mensajes.
//   4. No lleva entrada en vercel.json (no es un cron).
//
// Entrada (POST JSON): { solicitud_id }  — requiere sesión (Bearer token).
// Salida: { ok:true } | { ok:false, error }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_FACTURACION_CHAT_ID;

const mxn = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

async function sesionValida(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SKEY } });
  return r.ok;
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!SUPABASE_URL || !SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' });
    if (!BOT) return res.status(200).json({ ok: false, error: 'Falta TELEGRAM_BOT_TOKEN' });
    if (!CHAT) return res.status(200).json({ ok: false, error: 'Falta TELEGRAM_FACTURACION_CHAT_ID' });
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const id = String(body.solicitud_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'Falta solicitud_id' });

    const s = (await sbGet(`solicitudes_factura?id=eq.${id}&select=*`))[0];
    if (!s) return res.status(200).json({ ok: false, error: 'No se encontró la solicitud' });

    const conPago = s.tipo === 'con_pago';
    const L = [];
    L.push(conPago ? '🧾 NUEVA SOLICITUD DE FACTURA — pago por validar' : '🧾 NUEVA SOLICITUD DE FACTURA — liberar pago');
    L.push('');
    L.push(`Vendedor: ${s.vendedor_nombre || '—'}`);
    L.push(`Cliente: ${s.cliente_nombre || '—'}${s.num_cliente ? ' (#' + s.num_cliente + ')' : ''}`);
    if (s.cotizacion_sae) L.push(`Cotización: ${s.cotizacion_sae}`);
    if (s.concepto) L.push(`Concepto: ${s.concepto}`);
    L.push(`Total a facturar: ${mxn(s.monto_total)}`);
    if (s.forma_pago || s.metodo_pago) L.push(`Pago: ${[s.metodo_pago, s.forma_pago].filter(Boolean).join(' / ')}`);
    if (conPago && s.pago_monto) L.push(`Depósito: ${mxn(s.pago_monto)} el ${s.pago_fecha || '—'}${s.pago_hora ? ' ' + String(s.pago_hora).slice(0, 5) : ''}`);
    if (!conPago && s.fecha_pago_esperada) L.push(`Pagará el: ${s.fecha_pago_esperada}`);
    if (s.notas) L.push(`Notas: ${String(s.notas).slice(0, 300)}`);
    if (s.crm_link) L.push(`CRM: ${s.crm_link}`);
    L.push('');
    L.push('Revisar en Innovaci OS › Solicitudes de factura.');

    const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: L.join('\n'), disable_web_page_preview: true }),
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'Telegram: ' + (await r.text()).slice(0, 300) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
