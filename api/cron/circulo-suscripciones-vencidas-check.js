// api/cron/circulo-suscripciones-vencidas-check.js
//
// Jp, 2026-10-30 — pidió un chequeo continuo: en cuanto una suscripción
// Aspel ligada a un socio de Círculo Innovaci deje de estar vigente (no se
// detectó su renovación) o deje de aparecer como pagada (con los reportes
// de comisiones/suscripciones que Jp sube en Suscripciones), debe avisar
// — tanto en el panel de administrador de Círculo (circulo-admin.html,
// construido aparte, lee lo mismo en vivo) como por Telegram, para que
// Ventas/Capacitación lo valide y, si de verdad ya no sigue vigente,
// suspenda manualmente los accesos del socio. Verbatim: "que se mande una
// alerta... diga esta tal suscripción no se renovó, hay que suspender
// servicios y mandar una aclaración a ventas... en Telegram... favor de
// validar y en caso necesario suspender los accesos."
//
// Importante: este cron NO suspende nada solo — solo avisa. La decisión de
// suspender sigue siendo manual (circulo-admin.html, editar el socio).
//
// Qué revisa (una sola vez al día, un solo mensaje — mismo criterio de "no
// mandar ruido si está todo en orden" que ya usa
// api/cron/circulo-avisos-check.js):
//   Para cada socio activo de Círculo Innovaci dado de alta por vinculación
//   de suscripción Aspel (circulo_membresias.origen='vinculacion_aspel',
//   estado != 'cancelada', numserie_aspel no nulo), busca esa serie en
//   suscripciones_cartera y marca "en riesgo" si:
//     - no se encuentra la serie en Cartera (raro, pero posible si se borró)
//     - alerta_posible_perdida = true (puede haberse ido con otro distribuidor)
//     - fecha_proxima_renovacion ya pasó (no se detectó su renovación)
//     - estado no es 'reclamada' ni 'renovada' (no hay pago registrado)
//   Mismo criterio exacto que ya usa circulo-admin.html al validar una
//   serie nueva (validarSerie()) y al sugerirla (sugerirSuscripcionEmpresa())
//   — ver claude/circulo-tope-suscripcion-291026.md.
//
// Variables de entorno requeridas (todas ya existen en Vercel — mismas que
// api/cron/circulo-avisos-check.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
//   TELEGRAM_CAPACITACION_CHAT_ID
// Opcional: SYNC_SECRET (protección contra llamadas manuales).
//
// ⚠️ Supuesto sin confirmar con Jp: se manda al mismo canal de Telegram
// "Capacitación INN" que ya usa el resto de avisos de Círculo. Si Jp
// prefiere un canal distinto (más orientado a Ventas/Dirección), es un
// cambio de una sola línea (otra variable de entorno con el chat_id).
//
// Cómo se usa:
//   1. Coloca este archivo en api/cron/circulo-suscripciones-vencidas-check.js
//      dentro del repo.
//   2. Agrega la entrada de cron en vercel.json — recomendado 7:20am hora
//      CDMX, justo después del aviso general de Círculo (13:15 UTC):
//      "20 13 * * *" (13:20 UTC).
//   3. Sube el archivo y vercel.json a tu repo como siempre.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CAPACITACION_CHAT_ID = process.env.TELEGRAM_CAPACITACION_CHAT_ID;

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

// Mismo criterio exacto que circulo-admin.html (validarSerie / sugerirSuscripcionEmpresa).
function motivoRiesgo(sus, hoyISO) {
  if (!sus) return 'no se encuentra esta serie en Cartera (suscripciones_cartera)';
  if (sus.alerta_posible_perdida) return 'con alerta de posible pérdida a otro distribuidor';
  if (!sus.fecha_proxima_renovacion || sus.fecha_proxima_renovacion < hoyISO) return 'vencida — no se detectó su renovación';
  if (!['reclamada', 'renovada'].includes(sus.estado)) return `sin pago registrado (estado: ${sus.estado || 'sin dato'})`;
  return null; // en orden
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-sync-secret'];
  const autorizadoPorHeader =
    authHeader === `Bearer ${process.env.SYNC_SECRET}` ||
    (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);
  if (
    process.env.SYNC_SECRET &&
    secretHeader !== process.env.SYNC_SECRET &&
    !autorizadoPorHeader
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
    const hoyISO = new Date().toISOString().slice(0, 10);

    const socios = await sbGet(
      `circulo_membresias?origen=eq.vinculacion_aspel&estado=neq.cancelada&numserie_aspel=not.is.null&select=id,nombre,empresa,especialidad,plan,numserie_aspel`
    );
    if (!socios.length) {
      res.status(200).json({ ok: true, sin_novedades: true });
      return;
    }

    const series = [...new Set(socios.map((s) => s.numserie_aspel))];
    const filtroSeries = series.map((s) => `"${s}"`).join(',');
    const suscripciones = await sbGet(
      `suscripciones_cartera?numserie=in.(${filtroSeries})&select=numserie,estado,fecha_proxima_renovacion,alerta_posible_perdida`
    );
    const susPorSerie = {};
    suscripciones.forEach((s) => { susPorSerie[s.numserie] = s; });

    const enRiesgo = socios
      .map((socio) => {
        const motivo = motivoRiesgo(susPorSerie[socio.numserie_aspel], hoyISO);
        return motivo ? { ...socio, motivo } : null;
      })
      .filter(Boolean);

    if (!enRiesgo.length) {
      res.status(200).json({ ok: true, sin_novedades: true, revisados: socios.length });
      return;
    }

    let texto = `🔴 <b>Círculo Innovaci — suscripciones sin renovar (${enRiesgo.length})</b>\n`;
    texto += `Favor de validar con el cliente/Suscripciones y, si ya no sigue vigente, suspender los accesos en circulo-admin.html.\n`;
    enRiesgo.forEach((s) => {
      texto += `\n• <b>${esc(s.nombre)}</b>${s.empresa ? ` (${esc(s.empresa)})` : ''} — Círculo ${esc(s.especialidad)} ${s.plan === 'socio_pro' ? 'Pro' : ''} — serie <code>${esc(s.numserie_aspel)}</code>\n  ⚠ ${esc(s.motivo)}`;
    });

    await mandarTelegram(texto);

    res.status(200).json({ ok: true, revisados: socios.length, en_riesgo: enRiesgo.length, detalle: enRiesgo });
  } catch (err) {
    res.status(200).json({ ok: false, error: String((err && err.message) || err) });
  }
}
