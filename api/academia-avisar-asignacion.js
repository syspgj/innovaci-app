// api/academia-avisar-asignacion.js
//
// Avisa por Telegram al grupo de Capacitación cuando Facturación asigna a un
// alumno a una generación (ya con pago validado y factura en proceso). Es la
// segunda notificación: la primera es el aviso emergente dentro de la app
// (Jp, 2026-11-07). Best-effort: si falla, la inscripción ya quedó hecha.
//
// Variables de entorno en Vercel (ya existen todas):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
//   TELEGRAM_CAPACITACION_CHAT_ID  → el grupo de Capacitación
// Opcional: TELEGRAM_ASIGNACIONES_CHAT_ID → si quieres que las asignaciones
//   lleguen a otro grupo distinto al de Capacitación.
// El bot debe ser miembro/administrador del grupo. Sin entrada en vercel.json.
//
// Entrada (POST JSON, con sesión Bearer): { solicitud_id, inscripcion_ids?: [uuid] }
// Salida: { ok:true } | { ok:false, error }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ASIGNACIONES_CHAT_ID || process.env.TELEGRAM_CAPACITACION_CHAT_ID;
const UUID = /^[0-9a-f-]{36}$/i;

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
const fecha = (f) => {
  if (!f) return 'abierta 24/7';
  try { return new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return f; }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!SUPABASE_URL || !SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' });
    if (!BOT || !CHAT) return res.status(200).json({ ok: false, error: 'Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CAPACITACION_CHAT_ID' });
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const sid = String(body.solicitud_id || '');
    if (!UUID.test(sid)) return res.status(400).json({ ok: false, error: 'Falta solicitud_id' });
    const ids = (Array.isArray(body.inscripcion_ids) ? body.inscripcion_ids : []).filter((x) => UUID.test(String(x)));

    const s = (await sbGet(`solicitudes_factura?id=eq.${sid}&select=cliente_nombre,concepto,vendedor_nombre,atendio_nombre,factura_serie,factura_folio,shopify_pedido,tipo`))[0];
    if (!s) return res.status(200).json({ ok: false, error: 'No se encontró la solicitud' });

    const filtro = ids.length ? `id=in.(${ids.join(',')})` : `origen_solicitud_id=eq.${sid}`;
    const ins = await sbGet(`academia_inscripciones?${filtro}&select=folio,nivel_acceso,participante:participante_id(nombre,mail,telefono),generacion:generacion_id(clave,fecha_inicio,curso:curso_id(nombre))`);
    if (!ins.length) return res.status(200).json({ ok: false, error: 'No hay inscripciones que avisar' });

    const L = [];
    L.push(`🎓 NUEVO ASISTENTE ASIGNADO — ya pasó por Facturación`);
    L.push('');
    L.push(`Cliente: ${s.cliente_nombre || '—'}`);
    L.push(`Concepto: ${s.concepto || '—'}`);
    if (s.shopify_pedido) L.push(`Pedido Shopify: ${s.shopify_pedido}`);
    L.push(`Vendedor: ${s.vendedor_nombre || '—'}${s.atendio_nombre && s.atendio_nombre !== s.vendedor_nombre ? ` (atendió: ${s.atendio_nombre})` : ''}`);
    if (s.factura_folio) L.push(`Factura: ${s.factura_serie || ''}${s.factura_folio}`);
    L.push('');
    for (const i of ins) {
      const p = i.participante || {};
      const g = i.generacion || {};
      L.push(`👤 ${p.nombre || '—'}${p.mail ? ' · ' + p.mail : ''}${p.telefono ? ' · ' + p.telefono : ''}`);
      L.push(`   ${g.curso?.nombre || '—'} (${g.clave || '—'}) · ${fecha(g.fecha_inicio)}`);
      L.push(`   Acceso: ${i.nivel_acceso || '—'}${i.folio ? ' · Folio ' + i.folio : ''}`);
    }
    L.push('');
    L.push('Falta: registro de accesos y grupo de WhatsApp. Ábrelo en Academia → Resumen.');

    const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: L.join('\n') }),
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'Telegram: ' + (await r.text()).slice(0, 300) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
