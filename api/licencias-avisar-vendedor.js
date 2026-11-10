// api/licencias-avisar-vendedor.js
//
// Avisa por correo al vendedor que ya llegó la clave de licencia (pre-registro de Aspel)
// de su venta (Jp, 2026-11-10). Se llama desde la app cuando, al validar un pago de
// timbres, se asigna un paquete a la solicitud (o cuando Dirección lo asigna a
// mano). Best-effort: si falla, la asignación ya quedó hecha y el vendedor la
// ve igual en la app.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/licencias-avisar-vendedor.js  del repo.
//   2. No requiere variables nuevas: usa SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//      y RESEND_API_KEY (ya existen). Opcional: TIMBRES_FROM_EMAIL.
//   3. No lleva entrada en vercel.json (no es un cron).
//
// Entrada (POST JSON): { solicitud_id }  — requiere sesión (Bearer token).
// Salida: { ok:true } | { ok:false, error }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.TIMBRES_FROM_EMAIL || process.env.REPORTE_FROM_EMAIL || 'Innovaci OS <reportes@innovaci.com.mx>';
// Mismo patrón que el resto de correos automáticos: copia oculta a Jp.
const BCC_EMAILS = ['joss@innovaci.com.mx'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n) => Number(n || 0).toLocaleString('es-MX');

async function sesionValida(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
  });
  return r.ok;
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

function construirHtml({ nombre, cliente, concepto, claves }) {
  const primer = (nombre || '').trim().split(' ')[0] || '';
  const fmtF = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const filas = claves
    .map((p) => `<tr><td style="padding:8px 12px;font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:#0D2240;letter-spacing:.04em;">${esc(p.clave)}</td><td style="padding:8px 12px;font-size:12px;color:#5b6b7a;">Activar antes del <strong>${fmtF(p.fecha_max_activacion)}</strong>${p.orden_venta ? ' · OV.' + esc(p.orden_venta) : ''}</td></tr>`)
    .join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#f4f6f8;padding:24px 0;">
    <div style="background:#0D2240;border-radius:14px 14px 0 0;padding:28px;text-align:center;">
      <div style="font-size:30px;">🔑</div>
      <div style="font-size:20px;font-weight:800;color:#fff;margin-top:6px;">Clave de licencia para tu venta</div>
    </div>
    <div style="background:#fff;padding:26px 28px;">
      <div style="font-size:14px;color:#1A2332;line-height:1.6;margin-bottom:16px;">Hola${primer ? ' ' + esc(primer) : ''}, ya llegó la clave de pre-registro de <strong>${esc(cliente)}</strong>.</div>
      <div style="font-size:12px;color:#8BA0B8;margin-bottom:6px;">${esc(concepto)}</div>
      <div style="background:#eefaf9;border:1px dashed #00A99D;border-radius:10px;margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:#00A99D;text-transform:uppercase;letter-spacing:.05em;padding:12px 12px 0;">Clave${claves.length > 1 ? 's' : ''} de licencia</div>
        <table style="width:100%;border-collapse:collapse;">${filas}</table>
      </div>
      <div style="font-size:12.5px;color:#5b6b7a;line-height:1.6;">Entrega la clave al cliente y recuérdale la fecha máxima de activación. También la encuentras en la app, en <strong>Solicitar factura › Mis solicitudes</strong>, con botón para copiarla. La factura la emite Administración.</div>
    </div>
    <div style="text-align:center;padding:16px 20px;"><div style="font-size:11px;color:#8BA0B8;">Grupo Innovaci · Distribuidor autorizado Aspel/Siigo (D18944)</div></div>
  </div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' });
    if (!RESEND_KEY) return res.status(200).json({ ok: false, error: 'Falta RESEND_API_KEY' });
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const id = String(body.solicitud_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'Falta solicitud_id' });

    const sol = (await sbGet(`solicitudes_factura?id=eq.${id}&select=id,vendedor_id,cliente_nombre,concepto,licencia_estado`))[0];
    if (!sol) return res.status(200).json({ ok: false, error: 'No se encontró la solicitud' });
    if (sol.licencia_estado !== 'asignadas') return res.status(200).json({ ok: false, error: 'La solicitud no tiene licencia asignada' });
    const claves = await sbGet(`licencias_claves?solicitud_id=eq.${id}&select=clave,fecha_max_activacion,orden_venta&order=asignado_at.asc`);
    if (!claves.length) return res.status(200).json({ ok: false, error: 'No hay claves ligadas a la solicitud' });
    const vend = (await sbGet(`usuarios?id=eq.${sol.vendedor_id}&select=nombre,email`))[0];
    if (!vend?.email) return res.status(200).json({ ok: false, error: 'El vendedor no tiene correo registrado' });

    const html = construirHtml({ nombre: vend.nombre, cliente: sol.cliente_nombre, concepto: sol.concepto, claves });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [vend.email], bcc: BCC_EMAILS, subject: `🔑 Clave de licencia — ${sol.cliente_nombre}`, html }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(200).json({ ok: false, error: `Resend ${r.status}: ${JSON.stringify(j)}` });

    await fetch(`${SUPABASE_URL}/rest/v1/solicitudes_factura?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ licencia_correo_at: new Date().toISOString() }),
    }).catch(() => {});
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
