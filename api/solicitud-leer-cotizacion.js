// api/solicitud-leer-cotizacion.js
//
// Lee el PDF (o imagen) de una cotización de SAE y regresa el folio, el total
// y el concepto, para precargar la "Solicitud de factura". Es una sugerencia:
// el vendedor siempre revisa los campos antes de enviar, y si la lectura
// falla puede capturarlos a mano.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/solicitud-leer-cotizacion.js  del repo.
//   2. No requiere variables nuevas (ANTHROPIC_API_KEY, SUPABASE_URL y
//      SUPABASE_SERVICE_ROLE_KEY ya existen). Opcional: ANTHROPIC_MODEL.
//   3. No lleva entrada en vercel.json.
//
// Entrada (POST JSON): { archivoBase64, mediaType }
// Salida: { ok:true, datos:{ folio, total, cliente, concepto } }

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

const PROMPT = `Este documento es una cotización de un sistema Aspel SAE de un proveedor mexicano de software.
Responde SOLO con un objeto JSON (sin texto adicional ni markdown):
{"folio":"folio de la cotización tal como aparece, por ejemplo C-INN13309, o null","total":número total con IVA sin símbolos ni comas, o null,"subtotal":número del subtotal ANTES de IVA sin símbolos ni comas, o null,"cliente":"nombre del cliente o null","concepto":"descripción breve de TODO lo cotizado (une las partidas con ' + '), o null","partidas":[{"descripcion":"descripción de la partida tal como aparece","cantidad":número o 1,"importe":importe de la partida antes de IVA, o null}]}
"partidas" lleva UNA entrada por cada renglón de producto o servicio de la cotización (puede haber varias en una misma cotización). Si no se distinguen, usa [].
No inventes datos: si algo no se ve con claridad, usa null.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    const { archivoBase64, mediaType } = req.body || {};
    if (!archivoBase64) return res.status(400).json({ ok: false, error: 'Falta el archivo' });
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'Falta ANTHROPIC_API_KEY' });

    const tipo = mediaType || 'application/pdf';
    const bloque = tipo === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: archivoBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: tipo, data: archivoBase64 } };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1500,
        messages: [{ role: 'user', content: [bloque, { type: 'text', text: PROMPT }] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ ok: false, error: j?.error?.message || 'Error al llamar a Claude' });

    const texto = (j.content || []).map((c) => c.text || '').join('').trim();
    const limpio = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let d;
    try {
      d = JSON.parse(limpio);
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'No pude interpretar la lectura de la cotización' });
    }
    const total = Number(d.total);
    return res.status(200).json({
      ok: true,
      datos: {
        folio: d.folio ? String(d.folio).slice(0, 40) : null,
        total: Number.isFinite(total) && total > 0 ? total : null,
        cliente: d.cliente ? String(d.cliente).slice(0, 200) : null,
        concepto: d.concepto ? String(d.concepto).slice(0, 500) : null,
        subtotal: Number.isFinite(Number(d.subtotal)) && Number(d.subtotal) > 0 ? Number(d.subtotal) : null,
        partidas: (Array.isArray(d.partidas) ? d.partidas : []).slice(0, 20).map((x) => ({
          descripcion: String((x && x.descripcion) || '').slice(0, 300),
          cantidad: Number.isFinite(Number(x && x.cantidad)) && Number(x.cantidad) > 0 ? Number(x.cantidad) : 1,
          importe: Number.isFinite(Number(x && x.importe)) ? Number(x.importe) : null,
        })).filter((x) => x.descripcion),
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
