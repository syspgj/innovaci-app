// api/cron/academia-nuevos-asistentes.js
//
// Correo diario (7:00 AM CDMX) a Capacitación con los asistentes que entraron a
// una generación desde Facturación (academia_inscripciones.origen='facturacion')
// y que todavía no se marcan como atendidos (atendido_at is null): registro,
// accesos y grupo de WhatsApp. Si no hay pendientes, no manda nada.
//
// Env: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET (opcional),
//      CAPACITACION_EMAIL (opcional, default capacitacion@innovaci.com.mx),
//      ACADEMIA_FROM_EMAIL (opcional, default 'Innovaci OS <reportes@innovaci.com.mx>')
// Prueba a mano: GET /api/cron/academia-nuevos-asistentes?dryRun=1

const SURL = 'https://ydwouspzneacxfixlmmv.supabase.co';
const JP_BCC_EMAIL = 'joss@innovaci.com.mx';
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers['authorization'] || '';
      if (auth !== `Bearer ${cronSecret}` && req.query?.secret !== cronSecret) return res.status(401).json({ ok: false, error: 'No autorizado' });
    }
    const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!skey || !resendKey) return res.status(200).json({ ok: false, error: 'Faltan SUPABASE_SERVICE_ROLE_KEY o RESEND_API_KEY' });
    const dryRun = req.query?.dryRun === '1';

    const q = 'academia_inscripciones?origen=eq.facturacion&atendido_at=is.null&order=created_at.asc&limit=500'
      + '&select=id,nivel_acceso,folio,created_at,vendedor_nombre_original,participante:participante_id(nombre,mail,telefono),generacion:generacion_id(clave,curso:curso_id(nombre))';
    const r = await fetch(`${SURL}/rest/v1/${q}`, { headers: { apikey: skey, Authorization: `Bearer ${skey}` } });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'Supabase ' + r.status + ': ' + (await r.text()).slice(0, 300) });
    const rows = await r.json();
    if (!rows.length) return res.status(200).json({ ok: true, pendientes: 0, enviado: false });

    const hoy = Date.now();
    const filas = rows.map((x) => {
      const p = x.participante || {}, g = x.generacion || {};
      const dias = Math.floor((hoy - new Date(x.created_at).getTime()) / 86400000);
      const atraso = dias >= 2 ? `<span style="color:#c0392b;font-weight:700;">hace ${dias} días</span>` : dias === 1 ? 'ayer' : 'hoy';
      return `<tr>
        <td style="padding:8px;border-top:1px solid #e5e7eb;"><b>${esc(p.nombre)}</b><br><span style="color:#6b7280;font-size:12px;">${esc(p.mail || 'sin correo')}<br>${esc(p.telefono || 'sin teléfono')}</span></td>
        <td style="padding:8px;border-top:1px solid #e5e7eb;">${esc(g.curso?.nombre || '')}<br><span style="color:#6b7280;font-size:12px;">${esc(g.clave || '')} · ${esc(x.nivel_acceso || '')}${x.folio ? ' · ' + esc(x.folio) : ''}</span></td>
        <td style="padding:8px;border-top:1px solid #e5e7eb;font-size:12px;">${atraso}${x.vendedor_nombre_original ? '<br><span style="color:#6b7280;">vende: ' + esc(x.vendedor_nombre_original) + '</span>' : ''}</td>
      </tr>`;
    }).join('');
    const n = rows.length;
    const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">
      <h2 style="color:#0d2b45;margin-bottom:4px;">🆕 ${n} asistente${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} por atender</h2>
      <p style="margin-top:0;color:#4b5563;">Llegaron desde Facturación y ya están en su generación. Falta: <b>registro, accesos y agregarlos al grupo de WhatsApp</b>. Márcalos como atendidos en Academia → Resumen.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f3f4f6;text-align:left;"><th style="padding:8px;">Asistente</th><th style="padding:8px;">Curso / generación</th><th style="padding:8px;">Alta</th></tr></thead><tbody>${filas}</tbody></table>
      <p style="margin-top:16px;"><a href="https://os.innovaci.com.mx" style="background:#0f8b8d;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:bold;">Abrir Innovaci OS</a></p>
    </div>`;
    const subject = `🆕 ${n} asistente${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} por atender en Academia`;
    if (dryRun) return res.status(200).json({ ok: true, pendientes: n, enviado: false, dryRun: true, subject });

    const to = process.env.CAPACITACION_EMAIL || 'capacitacion@innovaci.com.mx';
    const from = process.env.ACADEMIA_FROM_EMAIL || 'Innovaci OS <reportes@innovaci.com.mx>';
    const er = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], bcc: [JP_BCC_EMAIL], subject, html }),
    });
    const body = await er.json().catch(() => ({}));
    if (!er.ok) return res.status(200).json({ ok: false, error: 'Resend ' + er.status + ': ' + JSON.stringify(body) });
    return res.status(200).json({ ok: true, pendientes: n, enviado: true });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}
