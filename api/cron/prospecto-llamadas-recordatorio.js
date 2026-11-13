// api/cron/prospecto-llamadas-recordatorio.js
//
// Corre cada 5 minutos (vercel.json). Revisa las llamadas asignadas a vendedores
// (prospecto_llamadas_asignadas) que están pendientes y que empiezan en los
// próximos ~5 minutos, y manda UN correo recordatorio al vendedor
// (copia oculta a Dirección vía JP_BCC). Marca recordatorio_at para no repetir.
// Hora de México: UTC-6 fija (sin horario de verano desde 2022).
//
// Variables: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET (o SYNC_SECRET),
//            REPORTE_FROM_EMAIL (opcional).

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.REPORTE_FROM_EMAIL || 'Innovaci OS <reportes@innovaci.com.mx>';
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function sbGet(path) {
  const r = await fetch(`${SURL}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

export default async function handler(req, res) {
  const claves = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (claves.length) {
    const auth = req.headers['authorization'] || '';
    if (!claves.some((k) => auth === `Bearer ${k}`)) return res.status(401).json({ ok: false, error: 'no autorizado' });
  }
  try {
    if (!SKEY || !RESEND) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY o RESEND_API_KEY' });
    const ahoraMx = new Date(Date.now() - 6 * 3600 * 1000);          // reloj de México
    const hoy = ahoraMx.toISOString().slice(0, 10);
    const minAhora = ahoraMx.getUTCHours() * 60 + ahoraMx.getUTCMinutes();
    const pend = await sbGet(`prospecto_llamadas_asignadas?estado=eq.pendiente&recordatorio_at=is.null&fecha=eq.${hoy}&hora=not.is.null&select=*`);
    let enviados = 0;
    for (const l of pend) {
      const [h, m] = String(l.hora).split(':').map(Number);
      const falta = h * 60 + m - minAhora;                           // minutos que faltan
      if (falta > 7 || falta < -10) continue;                        // ventana: de 7 min antes a 10 min después
      const v = (await sbGet(`usuarios?id=eq.${l.vendedor_id}&select=nombre,email`))[0];
      const p = (await sbGet(`prospectos?id=eq.${l.prospecto_id}&select=nombre,apellidos,empresa,telefono,interes`))[0] || {};
      if (!v?.email) continue;
      const nombre = [p.nombre, p.apellidos].filter(Boolean).join(' ') || 'Prospecto';
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1A2332;">
        <div style="background:#E84040;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-size:15px;font-weight:700;">⏰ Llamada en ${falta > 0 ? falta + ' min' : 'este momento'}</div>
        <div style="border:1px solid #e5e5e5;border-top:none;padding:14px 16px;border-radius:0 0 8px 8px;font-size:13px;">
          <b>${esc(nombre)}</b>${p.empresa ? ' · ' + esc(p.empresa) : ''}<br>
          Teléfono: <b>${esc(p.telefono || '—')}</b> · ${esc(String(l.hora).slice(0, 5))}<br>
          ${l.motivo ? 'Motivo: ' + esc(l.motivo) + '<br>' : ''}${p.interes ? 'Interés: ' + esc(p.interes) + '<br>' : ''}
        </div></div>`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [v.email], subject: `⏰ Llamada ${falta > 0 ? 'en ' + falta + ' min' : 'ahora'}: ${nombre}`, html }),
      });
      if (r.ok) {
        await fetch(`${SURL}/rest/v1/prospecto_llamadas_asignadas?id=eq.${l.id}`, {
          method: 'PATCH',
          headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ recordatorio_at: new Date().toISOString() }),
        });
        enviados++;
      }
    }
    return res.status(200).json({ ok: true, revisadas: pend.length, enviados });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
