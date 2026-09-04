// Academia: extraer datos de alta de asistente desde una imagen (Jp, 2026-09-04).
//
// Ventas manda las solicitudes de alta por Telegram como una captura de texto
// (nombre, correo, WhatsApp, curso, acceso, etc.) y hasta ahora se capturaban
// primero en Excel antes de pasar a la app. Este endpoint recibe esa imagen
// desde el modal "Agregar asistente" (index.html) y usa Claude (con visión)
// para leerla y devolver los campos ya estructurados, para que el modal los
// precargue — Jp SIEMPRE revisa/edita antes de dar clic en Guardar, esto solo
// ahorra la captura manual.
//
// Requiere una variable de entorno en Vercel: ANTHROPIC_API_KEY (Project
// Settings → Environment Variables). Sin esa key, el endpoint responde con un
// error claro y el modal sigue funcionando igual que siempre (captura manual).
//
// No requiere dependencias (usa fetch nativo de Node en Vercel) ni
// package.json — es una función serverless suelta, mismo patrón "sin build"
// que el resto del repo.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel.' });
    return;
  }

  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch (e) {
    res.status(400).json({ error: 'Cuerpo de la solicitud inválido.' });
    return;
  }

  const { imagenBase64, mediaType } = body || {};
  if (!imagenBase64) {
    res.status(400).json({ error: 'Falta la imagen.' });
    return;
  }

  const tiposValidos = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const tipoFinal = tiposValidos.includes(mediaType) ? mediaType : 'image/png';

  const prompt = `Esta es una captura de una solicitud de alta de asistente para un curso/diplomado de Academia Innovaci (distribuidor Aspel/Siigo), tal como la manda el equipo de Ventas por Telegram.

Extrae ÚNICAMENTE los datos que puedas leer con certeza en la imagen y responde EXCLUSIVAMENTE con un objeto JSON (sin texto alrededor, sin markdown, sin explicación) con estas claves:
{
  "nombre": string o null,           // nombre completo del asistente/alumno (normalmente en la sección "Datos Del Asistente")
  "correo": string o null,
  "telefono": string o null,         // WhatsApp o teléfono, tal como aparece
  "cliente_empresa": string o null,  // el nombre que aparece junto a "CLIENTE:"
  "vendedor": string o null,         // nombre de quien manda la solicitud, normalmente hasta arriba
  "nivel_acceso": "esencial" o "plus" o "premium" o null,  // según lo que diga el texto del curso (ej. "Acceso Esencial")
  "curso_texto": string o null,      // el nombre completo del curso/diplomado tal como aparece
  "bono_texto": string o null        // cualquier línea que empiece con "BONO" o similar, tal cual
}

Si un dato no aparece en la imagen o no estás seguro de haberlo leído bien, usa null en vez de adivinar. No inventes información que no esté en la imagen.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: tipoFinal, data: imagenBase64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      res.status(502).json({ error: 'Error al llamar al servicio de IA: ' + errText.slice(0, 300) });
      return;
    }

    const data = await anthropicRes.json();
    const textoRespuesta = (data.content || []).map((b) => b.text || '').join('').trim();

    let extraido;
    try {
      const match = textoRespuesta.match(/\{[\s\S]*\}/);
      extraido = JSON.parse(match ? match[0] : textoRespuesta);
    } catch (e) {
      res.status(502).json({ error: 'No se pudo interpretar la respuesta de la IA.', raw: textoRespuesta.slice(0, 500) });
      return;
    }

    res.status(200).json({ ok: true, datos: extraido });
  } catch (e) {
    res.status(500).json({ error: 'Error inesperado: ' + (e?.message || e) });
  }
}
