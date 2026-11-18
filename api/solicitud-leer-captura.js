// api/solicitud-leer-captura.js
//
// Lee una o varias capturas de pantalla de los movimientos (ingresos) de la
// app del banco y regresa los movimientos como JSON, para que la pantalla
// "Facturación" de Dirección los compare contra las solicitudes de factura
// pendientes de validar pago.
//
// SIEMPRE es una sugerencia: la app nunca da por validado un pago sola;
// Jp confirma cada uno con un clic.
//
// Jp, 2026-11-18 — dos correcciones pedidas por experiencia de uso:
//  1) La fecha de un movimiento es SIEMPRE el encabezado que está ARRIBA de
//     él. Cuando un día traía pocos movimientos y enseguida empezaba el día
//     anterior, la lectura a veces les ponía la fecha de abajo. Ahora el
//     prompt lo dice sin lugar a dudas y además pide el encabezado usado.
//  2) Se pueden mandar VARIAS capturas de un mismo recorrido (cuando el día
//     tiene más movimientos de los que caben en una pantalla). Van en orden:
//     la segunda captura continúa donde terminó la primera, así que si no
//     empieza con encabezado, hereda la última fecha vista. Y si ni así hay
//     fecha (la captura va a medio día), se usa `fecha`, capturada a mano.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/solicitud-leer-captura.js  del repo.
//   2. No requiere variables nuevas: reutiliza ANTHROPIC_API_KEY,
//      SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ya configuradas en Vercel).
//      Opcional: ANTHROPIC_MODEL para cambiar el modelo.
//   3. No lleva entrada en vercel.json (no es un cron).
//
// Entrada (POST JSON):
//   { imagenBase64, mediaType }                 (una sola captura; compatible)
//   { imagenes:[{base64,mediaType}], fecha? }   (varias, en orden de arriba a abajo)
// Salida: { ok:true, movimientos:[{fecha,hora,monto,descripcion,banco_origen}], aviso? }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

async function sesionValida(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
  });
  return r.ok;
}

function construirPrompt(nImagenes, fechaBase) {
  return `Estas son ${nImagenes === 1 ? 'una captura' : nImagenes + ' capturas'} de pantalla de la app de un banco mexicano, sección de ingresos/movimientos recibidos.
${nImagenes > 1 ? `Las capturas son el MISMO listado, desplazado hacia abajo: la captura 2 continúa donde terminó la 1, la 3 donde terminó la 2, y así. Puede haber movimientos repetidos entre una captura y la siguiente (el traslape del scroll): inclúyelos UNA SOLA VEZ.\n` : ''}Extrae CADA movimiento visible y responde SOLO con un arreglo JSON (sin texto adicional, sin markdown), con objetos:
{"fecha":"YYYY-MM-DD","encabezado":"el texto del encabezado de fecha que le corresponde, o null si lo heredó","hora":"HH:MM" o null,"monto":número positivo sin símbolos ni comas,"descripcion":"texto del movimiento tal como aparece","banco_origen":"banco emisor si aparece en la descripción (por ejemplo SANTANDER, BANORTE, CITI MEXICO, BANJERCITO) o null"}

REGLA DE LA FECHA (la más importante, no te equivoques en esto):
- Los encabezados de fecha (por ejemplo "18 de noviembre de 2026") se leen de arriba hacia abajo.
- Un encabezado aplica a los movimientos que están DEBAJO de él, nunca a los que están arriba.
- Deja de aplicar en cuanto aparece OTRO encabezado más abajo; a partir de ahí manda el nuevo.
- Por lo tanto, si ves "18 de noviembre de 2026", tres movimientos, y luego "17 de noviembre de 2026", esos tres movimientos son del 18, NO del 17.
- Si una captura empieza sin encabezado (va a medio listado), esos movimientos pertenecen al último encabezado visto en la captura anterior.${fechaBase ? `\n- Si aun así no hay forma de saber la fecha de un movimiento, usa ${fechaBase}.` : ''}

Otras reglas:
- Si no aparece la hora, usa null. No inventes datos.
- Incluye solo ingresos/abonos; ignora gastos o cargos.
- Si no hay movimientos legibles, responde [].`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'Falta ANTHROPIC_API_KEY' });

    const body = req.body || {};
    // Compatibilidad: una sola imagen (como se mandaba antes) o varias.
    let imagenes = Array.isArray(body.imagenes) ? body.imagenes : [];
    if (!imagenes.length && body.imagenBase64) imagenes = [{ base64: body.imagenBase64, mediaType: body.mediaType }];
    imagenes = imagenes.filter((i) => i && i.base64).slice(0, 6);
    if (!imagenes.length) return res.status(400).json({ ok: false, error: 'Falta la imagen' });

    const fechaBase = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha || '')) ? String(body.fecha) : null;

    const contenido = [];
    imagenes.forEach((img, i) => {
      if (imagenes.length > 1) contenido.push({ type: 'text', text: `Captura ${i + 1} de ${imagenes.length}:` });
      contenido.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/png', data: img.base64 } });
    });
    contenido.push({ type: 'text', text: construirPrompt(imagenes.length, fechaBase) });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4000,
        messages: [{ role: 'user', content: contenido }],
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

    let sinFecha = 0;
    movimientos = movimientos
      .map((m) => {
        let fecha = String(m.fecha || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
          // Sin fecha legible: se usa la que capturó el usuario, si la dio.
          if (fechaBase) fecha = fechaBase; else sinFecha++;
        }
        return {
          fecha,
          hora: m.hora ? String(m.hora).slice(0, 5) : null,
          monto: Number(m.monto),
          descripcion: String(m.descripcion || '').slice(0, 200),
          banco_origen: m.banco_origen ? String(m.banco_origen).slice(0, 60) : null,
        };
      })
      .filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.fecha) && Number.isFinite(m.monto) && m.monto > 0);

    // Quita repetidos del traslape entre capturas (mismo día, monto, hora y descripción).
    const vistos = new Set();
    movimientos = movimientos.filter((m) => {
      const k = `${m.fecha}|${m.monto.toFixed(2)}|${m.hora || ''}|${String(m.descripcion).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });

    const aviso = sinFecha
      ? `${sinFecha} movimiento(s) se descartaron porque la captura no traía la fecha. Captúrala en el recuadro de fecha y vuelve a subirla.`
      : null;

    return res.status(200).json({ ok: true, movimientos, imagenes: imagenes.length, aviso });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
