// api/prospecto-llamada-avisar.js
//
// Jp, 2026-11-13: cuando telemarketing (Carolina) pasa un prospecto de Respond
// (WhatsApp) a un vendedor, la App asigna y programa la llamada
// (tabla prospecto_llamadas_asignadas) y este endpoint avisa por correo:
//   Para: el vendedor · Copia: quien asignó + Dirección (usuarios rol 'director').
// Best-effort: si falla, la llamada ya quedó guardada en la App.
//
// Entrada (POST JSON): { llamada_id }  — requiere sesión (Bearer token).
// Variables: SUPABASE_URL (o la fija de abajo), SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//            REPORTE_FROM_EMAIL (opcional).

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.REPORTE_FROM_EMAIL || 'Innovaci OS <reportes@innovaci.com.mx>';

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function sesionValida(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SURL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SKEY } });
  return r.ok;
}
async function sbGet(path) {
  const r = await fetch(`${SURL}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbPatch(path, body) {
  await fetch(`${SURL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}
const fechaMx = (f) => { const p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f || ''; };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  let id = '';
  try {
    if (!SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
    if (!RESEND) return res.status(200).json({ ok: false, error: 'Falta RESEND_API_KEY' });
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    id = String(body.llamada_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'Falta llamada_id' });

    const l = (await sbGet(`prospecto_llamadas_asignadas?id=eq.${id}&select=*`))[0];
    if (!l) return res.status(200).json({ ok: false, error: 'No se encontró la llamada' });
    const p = (await sbGet(`prospectos?id=eq.${l.prospecto_id}&select=nombre,apellidos,empresa,telefono,email,interes,origen,evento,notas`))[0] || {};
    const v = (await sbGet(`usuarios?id=eq.${l.vendedor_id}&select=nombre,email`))[0];
    if (!v?.email) return res.status(200).json({ ok: false, error: 'El vendedor no tiene correo en la App' });
    const cc = new Set();
    if (l.asignado_por) { const a = (await sbGet(`usuarios?id=eq.${l.asignado_por}&select=email`))[0]; if (a?.email) cc.add(a.email); }
    (await sbGet(`usuarios?rol=eq.director&select=email`)).forEach((d) => d.email && cc.add(d.email));
    cc.delete(v.email);

    const nombre = [p.nombre, p.apellidos].filter(Boolean).join(' ') || 'Prospecto';
    const cuando = `${fechaMx(l.fecha)}${l.hora ? ' · ' + String(l.hora).slice(0, 5) : ''}`;
    const fila = (k, val) => val ? `<tr><td style="padding:4px 10px 4px 0;color:#888;font-size:12px;">${k}</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${esc(val)}</td></tr>` : '';
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1A2332;">
      <div style="background:#1A2332;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-size:15px;font-weight:700;">📞 Nueva llamada asignada</div>
      <div style="border:1px solid #e5e5e5;border-top:none;padding:16px 18px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 12px;font-size:13px;">Hola ${esc((v.nombre || '').split(' ')[0])}, ${esc(l.asignado_por_nombre || 'Telemarketing')} te pasó un prospecto que pidió llamada:</p>
        <table style="border-collapse:collapse;">
          ${fila('Prospecto', nombre)}${fila('Empresa', p.empresa)}${fila('Teléfono', p.telefono)}${fila('Correo', p.email)}
          ${fila('Interés', p.interes)}${fila('Llamar el', cuando)}${fila('Motivo', l.motivo)}${fila('Origen', l.canal_origen)}
        </table>
        <p style="margin:14px 0 0;font-size:12px;color:#666;">Te llegará otro aviso 5 minutos antes. Al terminar, registra el resultado en Innovaci OS › Prospectos › Llamadas asignadas.</p>
      </div></div>`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [v.email], cc: [...cc], subject: `📞 Llamada asignada: ${nombre} — ${cuando}`, html }),
    });
    const rb = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(rb).slice(0, 300)}`);
    await sbPatch(`prospecto_llamadas_asignadas?id=eq.${id}`, { aviso_asignacion_at: new Date().toISOString(), aviso_asignacion_error: null });
    return res.status(200).json({ ok: true });
  } catch (e) {
    if (id) { try { await sbPatch(`prospecto_llamadas_asignadas?id=eq.${id}`, { aviso_asignacion_error: String(e?.message || e).slice(0, 300) }); } catch (_) {} }
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
