// Glosario y Más — Q&A conversacional sobre manuales/instructivos de Innovaci
// (Fase 1, pedido por Jp 201026). Busca las secciones/términos más
// relevantes por texto completo (RPC glosario_buscar en Supabase) y le pide
// a Claude que responda SOLO con base en esas secciones, citando de dónde
// sale cada dato. Registra cada pregunta/respuesta en glosario_preguntas
// para poder detectar huecos en los manuales más adelante.
//
// Variables de entorno requeridas (nuevas, agregar en Vercel):
//   SUPABASE_SERVICE_ROLE_KEY (ya existe)
//   ANTHROPIC_API_KEY (nueva — pedir a Jp que la dé de alta)

const SURL = 'https://ydwouspzneacxfixlmmv.supabase.co';
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';

async function sb(path, method, skey, body) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, {
    method: method || 'GET',
    headers: {
      apikey: skey,
      authorization: `Bearer ${skey}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase ${method || 'GET'} ${path}: ${res.status} ${t.slice(0, 300)}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido.' });
    return;
  }

  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!skey) {
    res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' });
    return;
  }
  if (!anthropicKey) {
    res.status(200).json({ ok: false, error: 'Falta ANTHROPIC_API_KEY en las variables de entorno de Vercel. Pídesela a Jp — sin ella el buscador conversacional no puede redactar respuestas.' });
    return;
  }

  try {
    let body;
    try {
      body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (e) {
      res.status(400).json({ ok: false, error: 'Cuerpo inválido.' });
      return;
    }

    const pregunta = (body.pregunta || '').trim();
    const usuarioId = body.usuario_id || null;
    if (!pregunta) {
      res.status(400).json({ ok: false, error: 'Falta la pregunta.' });
      return;
    }

    // 1) Buscar las secciones/términos más relevantes (RPC glosario_buscar).
    const resultados = await sb('rpc/glosario_buscar', 'POST', skey, { q: pregunta, limite: 6 });

    if (!resultados || !resultados.length) {
      const respuesta = 'No encontré nada relacionado con esa pregunta en los manuales cargados todavía. Puede que el tema no esté documentado aún, o que valga la pena reformular la pregunta con otras palabras.';
      await sb('glosario_preguntas', 'POST', skey, {
        pregunta, respuesta, secciones_citadas: [], usuario_id: usuarioId,
      }).catch(() => {});
      res.status(200).json({ ok: true, respuesta, fuentes: [] });
      return;
    }

    // 2) Armar el contexto para Claude — solo lo que arrojó la búsqueda,
    // nunca el manual completo, para mantener la respuesta anclada a fuentes
    // verificables y citables.
    const contexto = resultados.map((r, i) => {
      const encabezado = r.origen === 'termino'
        ? `[Fuente ${i + 1} · Glosario de términos] ${r.titulo}`
        : `[Fuente ${i + 1} · ${r.documento_titulo}${r.numero_seccion ? ` · Sección ${r.numero_seccion}` : ''}] ${r.titulo}`;
      return `${encabezado}\n${r.contenido}`;
    }).join('\n\n---\n\n');

    const systemPrompt = `Eres el asistente de conocimiento interno de Grupo Innovaci (Innovaci OS). Respondes preguntas del personal (Ventas, Capacitación, Mesa de Control, Administración, Dirección) basándote ÚNICAMENTE en los fragmentos de manuales/glosario que se te dan como contexto — nunca inventes reglas, precios o plazos que no aparezcan ahí.

Reglas:
- Si la respuesta está en el contexto, respóndela de forma clara y directa, en español, citando entre paréntesis de qué fuente sale (ej. "(Sección 6, Regla de usuarios para suscripciones vinculadas)").
- Si el contexto no alcanza para responder con certeza, dilo explícitamente en vez de adivinar, y sugiere a quién preguntar según el manual si esa información aparece (ej. la tabla de "Cómo se resuelven las dudas").
- Sé breve y operativo — la persona que pregunta está trabajando, no necesita un ensayo.`;

    const userPrompt = `Pregunta del personal: ${pregunta}\n\nFragmentos disponibles:\n\n${contexto}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      throw new Error('Anthropic API: ' + t.slice(0, 300));
    }
    const claudeData = await claudeRes.json();
    const respuesta = (claudeData.content || []).map(b => b.text || '').join('').trim() || 'No se pudo generar una respuesta.';

    const fuentes = resultados.map(r => ({
      origen: r.origen,
      seccion_id: r.seccion_id,
      documento_id: r.documento_id,
      documento_titulo: r.documento_titulo,
      numero_seccion: r.numero_seccion,
      titulo: r.titulo,
    }));

    // 3) Log de auditoría — best-effort, no debe tumbar la respuesta si falla.
    await sb('glosario_preguntas', 'POST', skey, {
      pregunta, respuesta, secciones_citadas: fuentes, usuario_id: usuarioId,
    }).catch(() => {});

    res.status(200).json({ ok: true, respuesta, fuentes });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message || 'Error desconocido.' });
  }
}
