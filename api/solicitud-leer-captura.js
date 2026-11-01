// api/solicitud-leer-captura.js
//
// Lee una captura de pantalla de los movimientos (ingresos) de la app del
// banco y regresa los movimientos como JSON, para que la pantalla
// "Facturación" de Dirección los compare contra las solicitudes de factura
// pendientes de validar pago.
//
// SIEMPRE es una sugerencia: la app nunca da por validado un pago sola;
// Jp confirma cada uno con un clic.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/solicitud-leer-captura.js  del repo.
//   2. No requiere variables nuevas: reutiliza ANTHROPIC_API_KEY,
//      SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ya configuradas en Vercel).
//      Opcional: ANTHROPIC_MODEL para cambiar el modelo.
//   3. No lleva entrada en vercel.json (no es un cron).
//
// Entrada (POST JSON): { imagenBase64, mediaType }
// Salida: { ok:true, movimientos:[{fecha,hora,monto,descripcion,banco_origen}] }

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

const PROMPT = `Esta es una captura de pantalla de la app de un banco mexicano, sección de ingresos/movimientos recibidos.
Extrae CADA movimiento visible y responde SOLO con un arreglo JSON (sin texto adicional, sin markdown), con objetos:
{"fecha":"YYYY-MM-DD","hora":"HH:MM" o null,"monto":número positivo sin símbolos ni comas,"descripcion":"texto del movimiento tal como aparece","banco_origen":"banco emisor si aparece en la descripción (por ejemplo SANTANDER, BANORTE, CITI MEXICO, BANJERCITO) o null"}
Reglas:
- Las fechas aparecen como encabezados de grupo (por ejemplo "15 de octubre de 2026"); aplica esa fecha a los movimientos de abajo hasta el siguiente encabezado.
- Si no aparece la hora, usa null. No inventes datos.
- Incluye solo ingresos/abonos; ignora gastos o cargos.
- Si la imagen no contiene movimientos legibles, responde [].`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    const { imagenBase64, mediaType } = req.body || {};
    if (!imagenBase64) return res.status(400).json({ ok: false, error: 'Falta la imagen' });
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'Falta ANTHROPIC_API_KEY' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imagenBase64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ ok: false, error: j?.error?.message || 'Error al llamar a Claude' });

    const texto = (j.content || []).map((c) => c.text || '').join('').trim();
    const limpio = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let movimientos;
    try {
      movimientos = JSON.parse(limpio);
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'No pude interpretar la respuesta de la lectura' });
    }
    if (!Array.isArray(movimientos)) movimientos = [];
    movimientos = movimientos
      .map((m) => ({
        fecha: String(m.fecha || '').slice(0, 10),
        hora: m.hora ? String(m.hora).slice(0, 5) : null,
        monto: Number(m.monto),
        descripcion: String(m.descripcion || '').slice(0, 200),
        banco_origen: m.banco_origen ? String(m.banco_origen).slice(0, 60) : null,
      }))
      .filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.fecha) && Number.isFinite(m.monto) && m.monto > 0);

    return res.status(200).json({ ok: true, movimientos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
