// Mesa de Control — "Nivel 2" de la integración con Telegram (Jp, 2026-09-28).
//
// Nivel 1 (api/mesa-control-extraer-solicitud.js, ya en producción) requiere
// que alguien copie/pegue una captura de pantalla del canal de Telegram en
// el modal "Nueva solicitud de servicio". Nivel 2 elimina ese paso manual:
// este endpoint se registra como webhook del bot de Telegram, así que cada
// vez que llega un mensaje nuevo al canal de asignaciones, Telegram lo manda
// aquí en tiempo real. El endpoint:
//   1) Verifica que la llamada viene de Telegram (header secret_token).
//   2) Extrae los datos de la solicitud con la misma IA/prompt que Nivel 1
//      (texto plano si el mensaje es texto, o visión si es una foto/captura).
//   3) Guarda el resultado en mesa_control_telegram_solicitudes como
//      "pendiente" — NO crea el ticket solo. Jp/Mesa de Control revisan y
//      confirman desde un panel en index.html antes de que se cree el
//      ticket real en servicios_ejecutados, igual que en Nivel 1.
//
// Nada de esto reemplaza la revisión humana: solo evita la copia manual de
// la captura. Si la IA no logra interpretar el mensaje, igual se guarda como
// pendiente (con error_extraccion) para que se complete a mano desde el panel.
//
// Variables de entorno requeridas en Vercel (Project Settings → Environment
// Variables):
//   TELEGRAM_BOT_TOKEN            — token del bot (de @BotFather)
//   TELEGRAM_WEBHOOK_SECRET       — cadena secreta inventada por nosotros;
//                                    se manda al registrar el webhook y
//                                    Telegram la reenvía en cada llamada
//                                    (header X-Telegram-Bot-Api-Secret-Token)
//   ANTHROPIC_API_KEY             — ya existe en el proyecto
//   SUPABASE_SERVICE_ROLE_KEY     — ya existe en el proyecto
//
// Cómo se activa (pendiente de que Jp cree el bot y me pase el token):
//   1) Hablar con @BotFather en Telegram → /newbot → obtener el token.
//   2) Agregar el bot al canal de asignaciones como ADMINISTRADOR (un bot
//      normal no recibe mensajes de un canal, solo como admin).
//   3) Configurar TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET en Vercel.
//   4) Registrar el webhook UNA sola vez (desde una terminal, o yo lo hago
//      si me pasan el token):
//        curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<dominio-vercel>/api/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
//   5) A partir de ahí, cada mensaje nuevo del canal llega aquí solo.

const SURL = 'https://ydwouspzneacxfixlmmv.supabase.co';

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

const PROMPT_BASE = `Esta es una solicitud de servicio de Mesa de Control de Grupo Innovaci (distribuidor Aspel/Siigo), tal como llega al canal de Telegram del equipo de Ventas/Soporte (formato típico: CLIENTE / CONTACTO / TEL / SOLICITUD / COMENTARIOS / NOTA / TIPO / CRM, aunque puede variar).

Extrae ÚNICAMENTE los datos que puedas leer con certeza y responde EXCLUSIVAMENTE con un objeto JSON (sin texto alrededor, sin markdown, sin explicación) con estas claves:
{
  "cliente": string o null,
  "solicitado_por": string o null,
  "contacto_nombre": string o null,
  "contacto_telefono": string o null,
  "contacto_correo": string o null,
  "descripcion": string o null,
  "nota": string o null,
  "tipo_sugerido": "SOPORTE_POLIZA" o "EVENTO" o "CURSO_EMPRESARIAL" o null,
  "fecha_sugerida": string o null
}

Si un dato no aparece o no estás seguro, usa null. No inventes información.`;

async function extraerConIA(apiKey, contenido) {
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
      messages: [{ role: 'user', content: contenido }],
    }),
  });
  if (!anthropicRes.ok) {
    const t = await anthropicRes.text();
    throw new Error('IA: ' + t.slice(0, 300));
  }
  const data = await anthropicRes.json();
  const texto = (data.content || []).map((b) => b.text || '').join('').trim();
  const match = texto.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : texto);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (webhookSecret && headerSecret !== webhookSecret) {
    res.status(401).json({ error: 'Token de webhook inválido.' });
    return;
  }

  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Siempre respondemos 200 a Telegram al final (aunque algo falle adentro),
  // para que no reintente el mismo update indefinidamente.
  try {
    let body;
    try {
      body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (e) {
      res.status(200).json({ ok: true });
      return;
    }

    const msg = body.channel_post || body.message || body.edited_channel_post;
    if (!msg) {
      // Update que no nos interesa (ej. confirmación de otro tipo).
      res.status(200).json({ ok: true });
      return;
    }

    const chatId = msg.chat && msg.chat.id;
    const chatTitulo = msg.chat && (msg.chat.title || msg.chat.username || null);
    const messageId = msg.message_id;
    const texto = msg.text || msg.caption || null;
    const fotos = msg.photo || null; // array de tamaños, la última es la más grande

    let tipoMensaje = 'texto';
    let fotoFileId = null;
    let datosExtraidos = null;
    let errorExtraccion = null;

    if (!skey) {
      errorExtraccion = 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.';
    } else if (fotos && fotos.length) {
      tipoMensaje = 'foto';
      fotoFileId = fotos[fotos.length - 1].file_id;
      try {
        if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY.');
        if (!botToken) throw new Error('Falta TELEGRAM_BOT_TOKEN.');
        // Descargar la foto vía la Bot API para poder pasarla a la IA.
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fotoFileId}`);
        const fileInfo = await fileInfoRes.json();
        const filePath = fileInfo && fileInfo.result && fileInfo.result.file_path;
        if (!filePath) throw new Error('No se pudo obtener la foto de Telegram.');
        const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
        const buf = Buffer.from(await fileRes.arrayBuffer());
        const b64 = buf.toString('base64');
        const ext = (filePath.split('.').pop() || 'png').toLowerCase();
        const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
        datosExtraidos = await extraerConIA(apiKey, [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: PROMPT_BASE + (texto ? `\n\nTexto del mensaje/caption adicional: ${texto}` : '') },
        ]);
      } catch (e) {
        errorExtraccion = 'Error al procesar la foto: ' + (e && e.message ? e.message : e);
      }
    } else if (texto) {
      try {
        if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY.');
        datosExtraidos = await extraerConIA(apiKey, [{ type: 'text', text: PROMPT_BASE + `\n\nMensaje:\n${texto}` }]);
      } catch (e) {
        errorExtraccion = 'Error al interpretar el texto: ' + (e && e.message ? e.message : e);
      }
    } else {
      errorExtraccion = 'Mensaje sin texto ni foto (no se guardó).';
      res.status(200).json({ ok: true });
      return;
    }

    if (skey && chatId) {
      try {
        await sb('mesa_control_telegram_solicitudes', 'POST', skey, {
          telegram_update_id: body.update_id || null,
          telegram_message_id: messageId,
          telegram_chat_id: chatId,
          telegram_chat_titulo: chatTitulo,
          tipo_mensaje: tipoMensaje,
          texto_original: texto,
          foto_file_id: fotoFileId,
          datos_extraidos: datosExtraidos,
          error_extraccion: errorExtraccion,
          estado: 'pendiente',
        });
      } catch (e) {
        // Si ya existe (mismo chat+mensaje, ej. Telegram reintentando el
        // mismo update), lo ignoramos silenciosamente.
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    // Nunca dejamos que Telegram vea un 500 por un error nuestro — lo
    // registramos y respondemos 200 para que no reintente en bucle.
    res.status(200).json({ ok: true, warning: 'Error interno: ' + (e && e.message ? e.message : e) });
  }
}
