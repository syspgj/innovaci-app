// Academia — Lote 28 (2026-10-04): avisa automáticamente a la instructora
// (academia_firmantes, ligada a la generación como firmante_instructor_id)
// por Telegram cuando se marca el Portal del cliente de un curso empresarial
// como "finalizado" — le pide, en dos mensajes separados, su "Análisis
// general del grupo" y sus "Recomendaciones estratégicas" para el reporte
// que ve la empresa en el portal.
//
// Disparo: index.html llama a este endpoint (best-effort, POST, sin
// bloquear el guardado si falla) justo después de guardar el modal "Portal
// del cliente" cuando el checkbox "Curso finalizado" PASÓ de false a true en
// ese guardado (no cada vez que ya estaba en true) y la generación tiene
// firmante_instructor_id asignado.
//
// Qué hace:
//   1) Lee la generación (clave, cliente_nombre, firmante_instructor_id →
//      nombre del instructor desde academia_firmantes).
//   2) Manda al canal "Capacitación INN" (TELEGRAM_CAPACITACION_CHAT_ID):
//      - un aviso general (menciona a la instructora, pide que responda los
//        dos mensajes siguientes con su análisis y recomendaciones).
//      - un mensaje "📋 ANÁLISIS GENERAL DEL GRUPO" (prompt 1).
//      - un mensaje "📋 RECOMENDACIONES ESTRATÉGICAS" (prompt 2).
//   3) Por cada uno de los 2 mensajes de prompt, guarda una fila en
//      academia_portal_telegram_prompts con el message_id que regresó
//      Telegram, para que telegram-webhook.js pueda emparejar la RESPUESTA
//      (reply) de la instructora con esta generación y el tipo correcto.
//
// Variables de entorno requeridas (ya existen en Vercel, mismas que
// api/academia-evaluaciones-check.js y api/telegram-webhook.js):
//   SUPABASE_SERVICE_ROLE_KEY
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CAPACITACION_CHAT_ID

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

// Manda un mensaje de Telegram y regresa el message_id asignado (lo
// necesitamos para poder emparejar la respuesta/reply más adelante).
async function mandarTelegram(botToken, chatId, texto) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'Markdown' }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Telegram sendMessage: ' + t.slice(0, 300));
  }
  const data = await res.json();
  return data && data.result && data.result.message_id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const capacitacionChatId = process.env.TELEGRAM_CAPACITACION_CHAT_ID;

  if (!skey) {
    res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' });
    return;
  }
  if (!botToken || !capacitacionChatId) {
    res.status(200).json({ ok: false, error: 'Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CAPACITACION_CHAT_ID.' });
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

    const generacionId = body.generacion_id;
    if (!generacionId) {
      res.status(400).json({ ok: false, error: 'Falta generacion_id.' });
      return;
    }

    const generaciones = await sb(
      `academia_generaciones?id=eq.${generacionId}&select=id,clave,cliente_nombre,firmante_instructor_id`,
      'GET',
      skey
    );
    const gen = (generaciones || [])[0];
    if (!gen) {
      res.status(200).json({ ok: false, error: 'No se encontró la generación.' });
      return;
    }
    if (!gen.firmante_instructor_id) {
      res.status(200).json({ ok: false, error: 'La generación no tiene instructor(a) asignada.' });
      return;
    }

    const firmantes = await sb(
      `academia_firmantes?id=eq.${gen.firmante_instructor_id}&select=id,nombre,telegram_usuario`,
      'GET',
      skey
    );
    const instructora = (firmantes || [])[0];
    const nombreInstructora = instructora && instructora.nombre ? instructora.nombre : 'instructora';
    // telegram_usuario (Lote 28, 2026-10-04): si la firmante tiene su @usuario
    // de Telegram capturado (pantalla Academia → 🖋️ Firmantes), se antepone
    // al nombre en el aviso general para que Telegram la mencione/notifique
    // de verdad; si no lo tiene, se cae exactamente en el comportamiento
    // previo (solo el nombre, sin mención).
    const telegramUsuario = instructora && instructora.telegram_usuario ? instructora.telegram_usuario.trim() : '';
    const mencionInstructora = telegramUsuario
      ? `${telegramUsuario} — *${nombreInstructora}*`
      : `*${nombreInstructora}*`;
    const referencia = `${gen.clave || ''}${gen.cliente_nombre ? ' · ' + gen.cliente_nombre : ''}`.trim() || 'el curso';

    // 1) Aviso general.
    await mandarTelegram(
      botToken,
      capacitacionChatId,
      `🎓 *Curso finalizado — se necesita tu reporte*\n\n${mencionInstructora}, el curso *${referencia}* se marcó como finalizado.\nPor favor responde (reply) a los DOS mensajes siguientes con tu *Análisis general del grupo* y tus *Recomendaciones estratégicas* — se van a usar en el reporte que ve el cliente.`
    );

    // 2) y 3) Mensajes de prompt — cada uno se guarda en
    // academia_portal_telegram_prompts con su message_id, para emparejar la
    // respuesta cuando llegue.
    const analisisMsgId = await mandarTelegram(
      botToken,
      capacitacionChatId,
      `📋 *ANÁLISIS GENERAL DEL GRUPO* — responde este mensaje con tu análisis para *${referencia}*`
    );
    if (analisisMsgId) {
      await sb('academia_portal_telegram_prompts', 'POST', skey, {
        generacion_id: generacionId,
        tipo: 'analisis',
        telegram_message_id: analisisMsgId,
      });
    }

    const recomendacionesMsgId = await mandarTelegram(
      botToken,
      capacitacionChatId,
      `📋 *RECOMENDACIONES ESTRATÉGICAS* — responde este mensaje con tus recomendaciones para *${referencia}*`
    );
    if (recomendacionesMsgId) {
      await sb('academia_portal_telegram_prompts', 'POST', skey, {
        generacion_id: generacionId,
        tipo: 'recomendaciones',
        telegram_message_id: recomendacionesMsgId,
      });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    // Best-effort desde la app (ver academiaGuardarPortalEmpresa en
    // index.html, .catch(()=>{})) — igual respondemos 200 con el detalle
    // del error por si se revisa el log de la función en Vercel.
    res.status(200).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
}
