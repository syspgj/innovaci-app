// api/solicitud-leer-shopify.js
//
// Lee una captura de la lista de pedidos de Shopify (Admin › Pedidos) y regresa
// los pedidos como JSON, para que "Facturación" los compare contra las
// solicitudes de factura cuyo pago aún no está en el estado de cuenta.
// SIEMPRE es una sugerencia: nada se valida sin que Dirección confirme.
//
// Instalación: colocar en  api/solicitud-leer-shopify.js  del repo. No requiere
// variables nuevas (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
//
// Entrada (POST JSON): { imagenBase64, mediaType, hoy:"YYYY-MM-DD" }
// Salida: { ok:true, pedidos:[{pedido,fecha,cliente,total,estado_pago}] }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

async function sesionValida(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
  });
  return r.ok;
}

function prompt(hoy) {
  return `Esta es una captura de la lista de pedidos del administrador de Shopify (en español).
Extrae CADA pedido visible y responde SOLO con un arreglo JSON (sin texto adicional ni markdown), con objetos:
{"pedido":"número de pedido tal como aparece, por ejemplo #1768","fecha":"YYYY-MM-DD" o null,"cliente":"nombre del cliente tal como aparece","total":número sin símbolos ni comas,"estado_pago":"texto del estado del pago, por ejemplo Pagado, Pendiente, Reembolsado"}
Reglas:
- La fecha de hoy es ${hoy}. "Hoy a las…" = ${hoy}; "Ayer a las…" = el día anterior; si aparece un día y mes, completa el año según la fecha de hoy.
- No inventes datos: si algo no se ve con claridad, usa null (o 0 en total).
- Si la imagen no contiene pedidos legibles, responde [].`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    const { imagenBase64, mediaType, hoy } = req.body || {};
    if (!imagenBase64) return res.status(400).json({ ok: false, error: 'Falta la imagen' });
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'Falta ANTHROPIC_API_KEY' });
    const hoyStr = /^\d{4}-\d{2}-\d{2}$/.test(hoy || '') ? hoy : new Date().toISOString().slice(0, 10);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imagenBase64 } },
            { type: 'text', text: prompt(hoyStr) },
          ],
        }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ ok: false, error: j?.error?.message || 'Error al llamar a Claude' });

    const texto = (j.content || []).map((c) => c.text || '').join('').trim();
    const limpio = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let pedidos;
    try { pedidos = JSON.parse(limpio); } catch (e) {
      return res.status(502).json({ ok: false, error: 'No pude interpretar la lectura de la captura' });
    }
    if (!Array.isArray(pedidos)) pedidos = [];
    pedidos = pedidos
      .map((p) => ({
        pedido: String(p.pedido || '').slice(0, 20),
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha || '')) ? p.fecha : null,
        cliente: String(p.cliente || '').slice(0, 200),
        total: Number(p.total),
        estado_pago: String(p.estado_pago || '').slice(0, 40),
      }))
      .filter((p) => p.pedido && Number.isFinite(p.total) && p.total > 0);
    return res.status(200).json({ ok: true, pedidos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
