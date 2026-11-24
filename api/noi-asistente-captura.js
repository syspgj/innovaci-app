// api/noi-asistente-captura.js
//
// Jp, 2026-11-24 — Lee una (o varias) capturas del PORTAL DE CLIENTES Siigo/Aspel
// (listado de suscripciones de NOI Asistente) y da de alta / valida las series
// en suscripciones_cartera, para que Ventas pueda solicitar el acceso al taller
// de NOI Asistente sin esperar a que se suba el Excel.
//
// La serie se toma de la PRIMERA LÍNEA de la columna "Información del servicio"
// (p. ej. FUENTE2027, REPICASA), NO del RFC. La vigencia se toma de la columna
// "Vigencia" (fecha fin); "Contrato" es la fecha de inicio.
//
// Reutiliza el patrón de solicitud-leer-captura.js y la misma llave de visión.
// No requiere variables nuevas: ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (ya en Vercel). Opcional: ANTHROPIC_MODEL.
//
// Entrada (POST JSON, requiere sesión Bearer):
//   { imagenBase64, mediaType }                 (una captura)
//   { imagenes:[{base64,mediaType}] }           (varias, en orden)
// Salida: { ok:true, resumen:{nuevas,actualizadas,vigentes,no_vigentes,detalle:[...]}, leidas }

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

// Convierte "18/11/2026", "18-11-2026" o "2026-11-18" a "YYYY-MM-DD"; si no, null.
function aIso(v) {
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

const PROMPT = `Estás leyendo capturas de pantalla del sistema de Siigo/Aspel para extraer SUSCRIPCIONES. La captura puede venir en DOS formas y debes manejar AMBAS:

FORMA A — TABLA de suscripciones (columnas: Sistema, Servicio, RFC, Contacto, Tipo Servicio, Información del servicio, Contrato, Vigencia). Trae DISTINTOS productos (Siigo NOI Asistente, Siigo-NOI, Aspel-COI, Aspel-SAE, Aspel-BANCO, Caja, Producción, Facturé, Siigo Nube, Siigo Fiscal, etc.) — léelos TODOS.
- La columna "Información del servicio" trae varias líneas: la PRIMERA es el NÚMERO DE SERIE (ej. FUENTE2027, NNSNZR141037, CNSNWR188404). El número de serie NO es el RFC (aunque a veces coincidan).

FORMA B — DETALLE de un pedido/movimiento (típico de Siigo Fiscal). NO tiene columnas; es una ficha con "Detalle del movimiento/pedido", "Forma de pago", "Fecha", "Banco", "Monto" y una tabla pequeña con "SERVICIO" y "MONTO". El renglón de SERVICIO dice algo como "1 Siigo Fiscal Empresarial Plan Anual, 1 Usr, Identificador: SAA20160".
- En la FORMA B el NÚMERO DE SERIE es el valor que sigue a "Identificador:" (ej. SAA20160). SIEMPRE que veas un "Identificador:", devuelve un objeto con esa serie — no respondas vacío.
- "servicio" = el nombre del producto (ej. "Siigo Fiscal Empresarial"); "plan" = Anual/Mensual/Semestral del mismo texto; "inicio" = la "Fecha" del pedido; "fin" = null; "rfc"/"contacto" = los del pedido si aparecen.

Extrae CADA renglón/servicio visible (de la forma que sea) y responde SOLO con un arreglo JSON (sin texto adicional, sin markdown), con objetos:
{"serie":"la PRIMERA línea de Información del servicio","rfc":"el RFC de la columna RFC","contacto":"el nombre de la columna Contacto","servicio":"el texto EXACTO de la columna Servicio (p. ej. Siigo NOI Asistente, Siigo-NOI, Aspel-COI)","inicio":"fecha de la columna Contrato en formato DD/MM/YYYY","fin":"fecha de la columna Vigencia en formato DD/MM/YYYY","plan":"Anual, Mensual o Semestral según la línea Plan, o null"}

CASO ESPECIAL — Siigo Fiscal: a veces la captura NO es la tabla, sino el DETALLE de un pedido/movimiento. Ahí el renglón "SERVICIO" dice algo como "1 Siigo Fiscal Empresarial Plan Anual, 1 Usr, Identificador: SAA20160". En ese caso:
- "serie" = el valor que sigue a "Identificador:" (ej. SAA20160).
- "servicio" = el nombre del producto, ej. "Siigo Fiscal Empresarial".
- "plan" = Anual/Mensual/Semestral según ese mismo texto.
- "inicio" = la "Fecha" del movimiento/pedido; "fin" = null (el sistema calcula el vencimiento con el plan).
- "rfc"/"contacto" = los del pedido si aparecen; si no, null.

Reglas:
- "serie" = primera línea de "Información del servicio" (o el Identificador en Siigo Fiscal), en MAYÚSCULAS y sin espacios.
- "servicio" = el texto de la columna "Servicio" tal cual, para CADA renglón (puede cambiar de un renglón a otro).
- "inicio" = columna "Contrato"; "fin" = columna "Vigencia". Respeta día/mes/año tal como se ven.
- No inventes datos: si un campo no se ve, usa null.
- Si no hay renglones legibles, responde [].`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'Falta ANTHROPIC_API_KEY' });
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });

    const body = req.body || {};
    let imagenes = Array.isArray(body.imagenes) ? body.imagenes : [];
    if (!imagenes.length && body.imagenBase64) imagenes = [{ base64: body.imagenBase64, mediaType: body.mediaType }];
    imagenes = imagenes.filter((i) => i && i.base64).slice(0, 8);
    if (!imagenes.length) return res.status(400).json({ ok: false, error: 'Falta la imagen de la captura' });

    const contenido = [];
    imagenes.forEach((img, i) => {
      if (imagenes.length > 1) contenido.push({ type: 'text', text: `Captura ${i + 1} de ${imagenes.length}:` });
      contenido.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/png', data: img.base64 } });
    });
    contenido.push({ type: 'text', text: PROMPT });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO, max_tokens: 4000, messages: [{ role: 'user', content: contenido }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ ok: false, error: j?.error?.message || 'Error al llamar a la lectura' });

    const texto = (j.content || []).map((c) => c.text || '').join('').trim();
    const limpio = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let filas;
    try { filas = JSON.parse(limpio); } catch (e) { return res.status(502).json({ ok: false, error: 'No pude interpretar la lectura de la captura.' }); }
    if (!Array.isArray(filas)) filas = [];

    // Normaliza: deja renglones con serie, de CUALQUIER producto.
    const rows = [];
    for (const f of filas) {
      const serie = String(f?.serie || '').toUpperCase().replace(/\s/g, '');
      if (!serie) continue;
      const plan = /mensual/i.test(String(f?.plan || '')) ? 'mensual'
        : (/semestral/i.test(String(f?.plan || '')) ? 'semestral'
        : (/anual/i.test(String(f?.plan || '')) ? 'anual' : null));
      rows.push({
        serie,
        rfc: String(f?.rfc || '').toUpperCase().replace(/\s/g, ''),
        contacto: String(f?.contacto || '').trim().slice(0, 160),
        servicio: String(f?.servicio || '').trim().slice(0, 80),
        inicio: aIso(f?.inicio),
        fin: aIso(f?.fin),
        plan,
      });
    }

    if (!rows.length) {
      return res.status(200).json({ ok: true, resumen: { nuevas: 0, actualizadas: 0, vigentes: 0, no_vigentes: 0, detalle: [] }, leidas: filas.length, aviso: 'No encontré series legibles en la captura.' });
    }

    // Alta/validación en un solo paso (función en BD, todos los productos).
    const rr = await fetch(`${SUPABASE_URL}/rest/v1/rpc/suscripciones_alta_captura`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_rows: rows }),
    });
    const resumen = await rr.json();
    if (!rr.ok || !resumen || resumen.ok === false) {
      return res.status(502).json({ ok: false, error: (resumen && resumen.error) || 'No se pudo guardar en suscripciones.' });
    }

    return res.status(200).json({ ok: true, resumen, leidas: filas.length, procesadas: rows.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
