// api/cron/proyeccion-alertas-seguimiento.js
//
// Correo diario a cada vendedor con las actividades de seguimiento de
// Proyección (pipeline_actividades) programadas para HOY — Jp pidió
// explícitamente correo + aviso dentro de la app (claude/analisis-proyeccion-
// -inteligente.md, 2026-10-12). Este archivo es la parte de correo; el aviso
// dentro de la app ya lo cubre la columna "Siguiente paso" en la tabla de
// Proyección (marcada en rojo cuando ya venció).
//
// Reutiliza el mecanismo de correo que YA existe en el proyecto
// (api/reporte-semanal-vendedores.js) — Resend vía API REST directa, sin
// SDK nuevo, mismas variables de entorno (RESEND_API_KEY, opcional
// REPORTE_FROM_EMAIL). No se inventó un mecanismo de correo nuevo.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/cron/proyeccion-alertas-seguimiento.js
//      dentro del repo.
//   2. No requiere variables de entorno nuevas — reutiliza SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET, RESEND_API_KEY y
//      (opcional) REPORTE_FROM_EMAIL, todas ya configuradas en Vercel.
//   3. Agrega la entrada de cron correspondiente en vercel.json (ver
//      vercel.json actualizado entregado junto con este archivo) — corre
//      diario a las 7am hora CDMX, igual que los demás sync diarios.
//   4. Sube los archivos a tu repo como siempre y Vercel despliega solo.
//
// Qué hace:
//   - Busca en pipeline_actividades las actividades NO completadas cuya
//     fecha_programada es HOY (fecha de México, no UTC — el servidor corre
//     en UTC y aquí se ajusta).
//   - Las agrupa por vendedor (pipeline_actividades.usuario_id, o si no
//     está, pipeline_vendedor.usuario_id de la negociación).
//   - A cada vendedor con al menos una actividad de hoy le manda UN correo
//     con la lista completa (hora, tipo, cliente, nota).
//   - Si un vendedor no tiene email registrado en `usuarios`, se omite y se
//     reporta en la respuesta (no truena el resto del batch).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REPORTE_FROM_EMAIL || 'Innovaci OS <reportes@innovaci.com.mx>';
// Jp, 2026-10-14: "necesito que me llegue copia a mi correo" — copia oculta
// (bcc) de cada correo de seguimiento diario que se manda a un vendedor, para
// que Jp vea lo mismo que ellos sin que les aparezca su correo en el mensaje.
const JP_BCC_EMAIL = 'sys.pgj@gmail.com';

const TIPO_LABEL = { llamada: 'Llamada', correo: 'Correo', visita: 'Visita', otro: 'Actividad' };

function hoyMexico() {
  // México (CDMX) está en UTC-6 todo el año desde la reforma de horario de
  // verano — ajuste simple y suficiente para esta alerta diaria (mismo
  // criterio usado ya en otros crons del proyecto).
  const ahora = new Date();
  const cdmx = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
  return cdmx.toISOString().slice(0, 10);
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function enviarCorreo({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], bcc: [JP_BCC_EMAIL], subject, html }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend -> ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

function construirHtml(nombreVendedor, actividades) {
  const filas = actividades
    .map((a) => {
      const hora = a.hora_programada ? a.hora_programada.slice(0, 5) : 'Sin hora';
      return `<div style="padding:10px 0;border-bottom:1px solid #eee;">
        <div style="font-size:13px;font-weight:700;color:#1A2332;">${hora} · ${TIPO_LABEL[a.tipo_actividad] || a.tipo_actividad}</div>
        <div style="font-size:13px;color:#333;margin-top:2px;">${a.cliente || '—'} ${a.producto ? '· ' + a.producto : ''}</div>
        ${a.nota ? `<div style="font-size:12px;color:#666;margin-top:2px;">${a.nota}</div>` : ''}
      </div>`;
    })
    .join('');
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#1A2332;color:#fff;padding:18px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:16px;font-weight:700;">Tus seguimientos de hoy</div>
      <div style="font-size:12px;opacity:0.8;margin-top:2px;">Proyección — Innovaci OS</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:18px 20px;border-radius:0 0 8px 8px;">
      <div style="font-size:13px;color:#333;margin-bottom:10px;">Hola ${nombreVendedor}, tienes ${actividades.length} seguimiento${actividades.length !== 1 ? 's' : ''} programado${actividades.length !== 1 ? 's' : ''} para hoy en Proyección:</div>
      ${filas}
    </div>
  </div>`;
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
  if (!RESEND_KEY) return res.status(500).json({ ok: false, error: 'Falta RESEND_API_KEY' });

  const hoy = hoyMexico();
  try {
    const pendientesHoy = await supabaseGet(
      `pipeline_actividades?completada=eq.false&fecha_programada=eq.${hoy}&select=id,usuario_id,tipo_actividad,fecha_programada,hora_programada,nota,pipeline_vendedor_id`
    );

    if (!pendientesHoy.length) {
      return res.status(200).json({ ok: true, hoy, vendedores_notificados: 0, mensaje: 'Sin actividades programadas para hoy.' });
    }

    // Negociaciones referenciadas, para cliente/producto y para el vendedor
    // dueño cuando la actividad no trae usuario_id directo.
    const pipelineIds = [...new Set(pendientesHoy.map((a) => a.pipeline_vendedor_id))];
    const negociaciones = await supabaseGet(
      `pipeline_vendedor?id=in.(${pipelineIds.join(',')})&select=id,usuario_id,cliente,producto`
    );
    const negMap = {};
    negociaciones.forEach((n) => { negMap[n.id] = n; });

    // Agrupar por vendedor real.
    const porVendedor = {};
    pendientesHoy.forEach((a) => {
      const neg = negMap[a.pipeline_vendedor_id] || {};
      const usuarioId = a.usuario_id || neg.usuario_id;
      if (!usuarioId) return;
      if (!porVendedor[usuarioId]) porVendedor[usuarioId] = [];
      porVendedor[usuarioId].push({ ...a, cliente: neg.cliente, producto: neg.producto });
    });

    const usuarioIds = Object.keys(porVendedor);
    if (!usuarioIds.length) {
      return res.status(200).json({ ok: true, hoy, vendedores_notificados: 0, mensaje: 'Actividades de hoy sin vendedor identificable.' });
    }
    const usuarios = await supabaseGet(
      `usuarios?id=in.(${usuarioIds.join(',')})&select=id,nombre,email`
    );
    const usuarioMap = {};
    usuarios.forEach((u) => { usuarioMap[u.id] = u; });

    let enviados = 0;
    const omitidos = [];
    for (const usuarioId of usuarioIds) {
      const usuario = usuarioMap[usuarioId];
      if (!usuario?.email) { omitidos.push({ usuario_id: usuarioId, razon: 'sin email registrado' }); continue; }
      const actividades = porVendedor[usuarioId].sort((a, b) => (a.hora_programada || '99:99').localeCompare(b.hora_programada || '99:99'));
      try {
        await enviarCorreo({
          to: usuario.email,
          subject: `📋 Tus ${actividades.length} seguimiento${actividades.length !== 1 ? 's' : ''} de hoy — Proyección`,
          html: construirHtml(usuario.nombre || 'equipo', actividades),
        });
        enviados++;
      } catch (e) {
        omitidos.push({ usuario_id: usuarioId, razon: String(e.message || e) });
      }
    }

    return res.status(200).json({ ok: true, hoy, vendedores_notificados: enviados, omitidos });
  } catch (err) {
    console.error('proyeccion-alertas-seguimiento failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
