// Mesa de Control: extraer datos de una solicitud de servicio desde una
// imagen (Jp, 2026-09-04 / Lote 12, 2026-09-14) — "Nivel 1" de la
// integración con Telegram: las solicitudes llegan hoy por Telegram y se
// copian a mano al abrir un ticket nuevo. Este endpoint recibe la captura
// desde el modal "Nueva solicitud de servicio" (index.html) y usa Claude
// (con visión) para leerla y devolver los campos ya estructurados, para
// precargar el formulario — Jp SIEMPRE revisa/edita antes de dar clic en
// Guardar, esto solo ahorra la captura manual. Mismo patrón exacto que
// api/academia-extraer-asistente.js (Academia, ya en producción).
//
// Requiere la misma variable de entorno ya configurada en Vercel:
// ANTHROPIC_API_KEY (Project Settings → Environment Variables). Sin esa
// key, el endpoint responde con un error claro y el modal sigue
// funcionando igual que siempre (captura manual).
//
// No requiere dependencias (usa fetch nativo de Node en Vercel) ni
// package.json — es una función serverless suelta, mismo patrón "sin
// build" que el resto del repo.

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

  const prompt = `Esta es una captura de una solicitud de servicio de Mesa de Control de Grupo Innovaci (distribuidor Aspel/Siigo), tal como la manda el equipo de Ventas/Soporte por Telegram (ej. "@MESA me ayudas con lo siguiente..." o un mensaje similar pidiendo soporte, un evento o una capacitación para un cliente).

Extrae ÚNICAMENTE los datos que puedas leer con certeza en la imagen y responde EXCLUSIVAMENTE con un objeto JSON (sin texto alrededor, sin markdown, sin explicación) con estas claves:
{
  "cliente": string o null,          // nombre de la empresa/cliente para quien es el servicio (busca después de "CLIENTE:" o similar)
  "solicitado_por": string o null,   // quién manda la solicitud (vendedor, asesor, o el nombre de contacto si el cliente pide directo)
  "descripcion": string o null,      // qué necesita el cliente, tal cual está escrito (resume si es muy largo, pero sin inventar)
  "tipo_sugerido": "SOPORTE_POLIZA" o "EVENTO" o "CURSO_EMPRESARIAL" o null,  // SOPORTE_POLIZA si es un problema/duda de soporte técnico cotidiano, EVENTO si es un servicio puntual fuera de póliza, CURSO_EMPRESARIAL si piden capacitación — null si no es claro
  "fecha_sugerida": string o null    // fecha en formato YYYY-MM-DD si la solicitud menciona una fecha específica para el servicio, si no null
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
