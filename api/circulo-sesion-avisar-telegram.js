// Círculo Innovaci — avisa a Karen por Telegram cuando el admin confirma que
// las dudas de una solicitud de Sesión académica privada ya están bien
// especificadas (pedido por Jp, 191026, ronda de control fino del flujo de
// sesiones). Mismo patrón que api/academia-portal-avisar-instructora.js:
// manda al canal "Capacitación INN" (TELEGRAM_CAPACITACION_CHAT_ID),
// arrobando a Karen por su @usuario real (academia_firmantes.telegram_usuario,
// "Karen Hernández" → @innovaci_karen).
//
// A diferencia del Lote 28, aquí NO se guarda message_id ni se intenta
// emparejar automáticamente la respuesta de Karen — ella responde en
// Telegram y el admin lee la respuesta a simple vista y la captura a mano
// en circulo-admin.html ("Capturar fecha propuesta por Karen"). Si este
// endpoint falla (Telegram caído, variables faltantes, etc.), el admin de
// todos modos puede avisarle a Karen por otro medio — circulo-admin.html
// avanza el estado de la solicitud aunque este envío falle (best-effort).
//
// Variables de entorno requeridas (ya existen en Vercel, mismas que
// api/academia-portal-avisar-instructora.js):
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

async function mandarTelegram(botToken, chatId, texto) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Telegram sendMessage: ' + t.slice(0, 300));
  }
  const data = await res.json();
  return data && data.result && data.result.message_id;
}

const ESPECIALIDAD_LABEL = { NOI: 'NOI', COI: 'COI', SAE: 'SAE' };
const PLAN_LABEL = { socio: 'Socio', socio_pro: 'Socio Pro' };

// Escapa los 3 caracteres especiales de parse_mode:'HTML' de Telegram.
// Necesario porque el nombre/detalle vienen de datos reales (nombre del
// socio, su texto de dudas) y no deben poder romper el parseo del mensaje —
// a diferencia de Markdown legacy, aquí basta escapar &, < y > (nada de
// *, _, [ ] como en Markdown, que es justo lo que tronaba con
// "@innovaci_karen").
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fechaLarga(fechaIso) {
  if (!fechaIso) return '—';
  try {
    return new Date(fechaIso).toLocaleString('es-MX', {
      day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch (e) {
    return fechaIso;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido.' });
    return;
  }

  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const capacitacionChatId = process.env.TELEGRAM_CAPACITACION_CHAT_ID;

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

    const { nombre, numero_miembro, especialidad, plan, detalle, solicitado_en } = body;
    if (!nombre || !detalle) {
      res.status(400).json({ ok: false, error: 'Falta nombre o detalle de la solicitud.' });
      return;
    }

    // Karen es la única instructora de Sesión académica privada hoy — se
    // busca su @usuario real en academia_firmantes en vez de hardcodearlo,
    // por si algún día cambia de cuenta de Telegram o se agrega otra
    // instructora. Si no se encuentra, el mensaje sale sin @mención (igual
    // que el patrón ya usado en academia-portal-avisar-instructora.js).
    let mencionKaren = '<b>Karen</b>';
    if (skey) {
      try {
        const firmantes = await sb(`academia_firmantes?nombre=ilike.*karen*&select=nombre,telegram_usuario&limit=1`, 'GET', skey);
        const karen = (firmantes || [])[0];
        if (karen) {
          mencionKaren = karen.telegram_usuario
            ? `${esc(karen.telegram_usuario.trim())} — <b>${esc(karen.nombre)}</b>`
            : `<b>${esc(karen.nombre || 'Karen')}</b>`;
        }
      } catch (e) {
        // si falla la consulta, se sigue con la mención genérica — no debe
        // tumbar el aviso completo.
      }
    }

    const especialidadLbl = ESPECIALIDAD_LABEL[especialidad] || especialidad || '—';
    const planLbl = PLAN_LABEL[plan] || plan || '—';
    const socioRef = `${esc(nombre)}${numero_miembro ? ` (#${esc(numero_miembro)})` : ''}`;

    const texto =
      `📚 <b>Nueva solicitud de sesión académica privada — Círculo Innovaci</b>\n\n` +
      `Socio: <b>${socioRef}</b>\n` +
      `Plan: ${esc(especialidadLbl)} · ${esc(planLbl)}\n` +
      `Solicitado: ${esc(fechaLarga(solicitado_en))}\n\n` +
      `Curso y dudas:\n${esc(detalle)}\n\n` +
      `${mencionKaren} ¿qué día y hora puedes atenderla? Responde aquí con la fecha y hora propuestas.`;

    await mandarTelegram(botToken, capacitacionChatId, texto);

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message || 'Error desconocido.' });
  }
}
