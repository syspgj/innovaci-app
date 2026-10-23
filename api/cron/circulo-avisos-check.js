// api/cron/circulo-avisos-check.js
//
// Jp, 2026-10-23: Círculo Innovaci no tenía NINGÚN aviso proactivo — a
// diferencia de Academia (que ya tiene api/academia-evaluaciones-check.js +
// cron diario + canal de Telegram "Capacitación INN"), el panel de Círculo
// solo se revisaba si alguien entraba a verlo a mano. Con socios reales ya
// entrando (no solo pruebas), Jp pidió habilitar recordatorios. Reutiliza
// exactamente la misma infraestructura que Academia (mismo bot, mismo canal
// de Telegram, mismo patrón de cron diario) en vez de inventar un mecanismo
// nuevo.
//
// Qué revisa y avisa (un solo mensaje diario, SOLO si hay algo que atender —
// mismo criterio de "no mandar ruido si está todo en orden" que ya usa
// api/cron/cloud-servidores-alertas.js):
//   1. Laboratorios de socios asignados (circulo_beneficios_uso tipo=
//      'laboratorio', estado='asignado') cuya vigencia real (la de la
//      inscripción de Academia, fecha_fin_laboratorio — NUNCA un campo
//      aparte, mismo criterio que ya usa circulo-admin.html) ya venció o
//      vence dentro de 15 días (DIAS_POR_VENCER_LAB, mismo umbral que ya
//      usa el panel).
//   2. Solicitudes de cualquier tipo (laboratorio, sesión académica,
//      acompañante/crédito, evento en vivo) con más de 48 horas sin que
//      nadie les cambie de estado — hoy el panel no marca antigüedad en
//      absoluto, así que una solicitud de hace una semana se veía igual que
//      una de hace 5 minutos.
//
// Es un digest del ESTADO ACTUAL, no una bitácora de "ya avisé esto antes" —
// si un ítem se resuelve, simplemente deja de salir al día siguiente. Más
// simple que llevar una tabla de notificaciones ya mandadas, y suficiente
// para el objetivo (que alguien de Capacitación lo vea sin tener que entrar
// a revisar el panel todos los días).
//
// Variables de entorno requeridas (todas ya existen en Vercel — mismas que
// api/circulo-sesion-avisar-telegram.js y api/academia-evaluaciones-check.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
//   TELEGRAM_CAPACITACION_CHAT_ID
// Opcional (si se quiere proteger contra llamadas manuales): SYNC_SECRET —
// mismo patrón de api/cron/cloud-servidores-alertas.js.
//
// Cómo se usa:
//   1. Coloca este archivo en api/cron/circulo-avisos-check.js dentro del repo.
//   2. Agrega la entrada de cron en vercel.json — recomendado 7:15am hora
//      CDMX (0 13 * * *... Jp ya usa 13:00 UTC para Academia a las 7am, este
//      se agrega a las 7:15 para no pisarlo): "0 13 * * *" con offset, o
//      usar "15 13 * * *".
//   3. Sube el archivo a tu repo como siempre y Vercel despliega solo.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CAPACITACION_CHAT_ID = process.env.TELEGRAM_CAPACITACION_CHAT_ID;

const DIAS_POR_VENCER_LAB = 15; // mismo umbral que circulo-admin.html
const HORAS_SOLICITUD_ATRASADA = 48;

const TIPO_BENEFICIO_LABEL = {
  laboratorio: 'Laboratorio Virtual',
  sesion_academica: 'Sesión académica privada',
  acompanante: 'Acompañante',
  credito_referido: 'Crédito por referido',
  evento_en_vivo: 'Evento en vivo',
};

function hoyMexico() {
  // Mismo criterio ya usado en el resto de los crons del proyecto.
  const ahora = new Date();
  const cdmx = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
  return cdmx.toISOString().slice(0, 10);
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function mandarTelegram(texto) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CAPACITACION_CHAT_ID, text: texto, parse_mode: 'HTML' }),
  });
  if (!res.ok) throw new Error('Telegram sendMessage: ' + (await res.text()).slice(0, 300));
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-sync-secret'];
  if (
    process.env.SYNC_SECRET &&
    secretHeader !== process.env.SYNC_SECRET &&
    authHeader !== `Bearer ${process.env.SYNC_SECRET}`
  ) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' });
    return;
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CAPACITACION_CHAT_ID) {
    res.status(200).json({ ok: false, error: 'Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CAPACITACION_CHAT_ID.' });
    return;
  }

  try {
    const hoy = hoyMexico();
    const hoyDate = new Date(hoy + 'T00:00:00');
    const limiteLab = new Date(hoyDate);
    limiteLab.setDate(limiteLab.getDate() + DIAS_POR_VENCER_LAB);
    const limiteSolicitud = new Date(Date.now() - HORAS_SOLICITUD_ATRASADA * 60 * 60 * 1000);

    // 1) Laboratorios asignados — vigencia real desde Academia.
    const labsAsignados = await sbGet(
      `circulo_beneficios_uso?tipo=eq.laboratorio&estado=eq.asignado&select=id,membresia_id,academia_inscripcion_id,circulo_membresias(nombre,numero_miembro),academia_inscripciones(fecha_fin_laboratorio,academia_generaciones(clave,academia_cursos(nombre)))`
    );
    const labsAtencion = (labsAsignados || [])
      .map((b) => {
        const fin = b.academia_inscripciones?.fecha_fin_laboratorio;
        if (!fin) return null;
        const finDate = new Date(fin + 'T00:00:00');
        if (finDate > limiteLab) return null;
        return { ...b, _fin: finDate, _vencido: finDate < hoyDate };
      })
      .filter(Boolean)
      .sort((a, b) => a._fin - b._fin);

    // 2) Solicitudes pendientes con más de 48h sin cambio de estado.
    const solicitudes = await sbGet(
      `circulo_beneficios_uso?estado=in.(solicitado,en_revision_karen,propuesta,programada,realizada)&select=id,tipo,estado,created_at,circulo_membresias(nombre,numero_miembro)&order=created_at.asc`
    );
    const solicitudesAtrasadas = (solicitudes || []).filter((s) => new Date(s.created_at) <= limiteSolicitud);

    if (!labsAtencion.length && !solicitudesAtrasadas.length) {
      res.status(200).json({ ok: true, sin_novedades: true });
      return;
    }

    let texto = `🔵 <b>Círculo Innovaci — pendientes de hoy</b>\n`;

    if (labsAtencion.length) {
      texto += `\n🧪 <b>Laboratorio Virtual por vencer/vencido (${labsAtencion.length})</b>\n`;
      labsAtencion.forEach((b) => {
        const m = b.circulo_membresias || {};
        const gen = b.academia_inscripciones?.academia_generaciones;
        const curso = gen?.academia_cursos?.nombre || '—';
        const fin = b.academia_inscripciones?.fecha_fin_laboratorio;
        texto += `• ${esc(m.nombre || '—')}${m.numero_miembro ? ` (#${esc(m.numero_miembro)})` : ''} — ${esc(curso)} · ${esc(gen?.clave || '')} — vence ${esc(fin)}${b._vencido ? ' <b>YA VENCIÓ</b>' : ''}\n`;
      });
    }

    if (solicitudesAtrasadas.length) {
      texto += `\n🆕 <b>Solicitudes sin atender hace más de ${HORAS_SOLICITUD_ATRASADA}h (${solicitudesAtrasadas.length})</b>\n`;
      solicitudesAtrasadas.forEach((s) => {
        const m = s.circulo_membresias || {};
        const horas = Math.floor((Date.now() - new Date(s.created_at).getTime()) / (60 * 60 * 1000));
        texto += `• ${esc(m.nombre || '—')}${m.numero_miembro ? ` (#${esc(m.numero_miembro)})` : ''} — ${esc(TIPO_BENEFICIO_LABEL[s.tipo] || s.tipo)} — ${horas}h sin atender\n`;
      });
    }

    texto += `\nRevisa el panel: circulo-admin.html`;

    await mandarTelegram(texto);

    res.status(200).json({ ok: true, labs_atencion: labsAtencion.length, solicitudes_atrasadas: solicitudesAtrasadas.length });
  } catch (err) {
    res.status(200).json({ ok: false, error: String((err && err.message) || err) });
  }
}
