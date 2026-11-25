// api/odoo-acceso-alumno.js
//
// Jp, 2026-11-23 — Da ACCESO al alumno en Odoo sin que él se registre solo.
// Hoy la app lo crea como CONTACTO (res.partner) e inscribe al curso, pero sin
// cuenta de acceso; por eso el alumno "nunca creó la cuenta" y no puede entrar,
// y si se registra solo genera duplicados. Este endpoint:
//   1. Toma al alumno (participante) y su contacto de Odoo (lo crea si falta).
//   2. Genera una liga de "define tu contraseña" ligada a ESE contacto
//      (signup_prepare) — al completarla, Odoo le crea su usuario de portal
//      ligado al contacto existente, así que NO dispara el bloqueo de correo
//      duplicado.
//   3. Le manda esa liga por NUESTRO correo (Resend), no por el de Odoo (que
//      no está entregando).
//
// Entrada (POST JSON): { inscripcion_id }  — requiere sesión (Bearer token).
// Variables: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY, SUPABASE_URL,
//            SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ACADEMIA_BIENVENIDA_FROM,
//            CAPACITACION_EMAIL, ACADEMIA_PUBLICA_URL.
// NUNCA devuelve ni imprime la clave de Odoo.

export const config = { maxDuration: 60 };

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.ACADEMIA_BIENVENIDA_FROM || 'Academia Innovaci <academia@os.innovaci.com.mx>';
const CAPA = process.env.CAPACITACION_EMAIL || 'capacitacion@innovaci.com.mx';
const ACADEMIA_URL = String(process.env.ACADEMIA_PUBLICA_URL || 'https://academia-innovaci.com').replace(/\/+$/, '');

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const H = () => ({ apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' });
const limpio = (v) => (v === false || v === null || v === undefined || v === '' ? null : String(v).trim());
const uuidRe = /^[0-9a-f-]{36}$/i;

async function usuarioDeSesion(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${SURL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SKEY } });
  return r.ok ? r.json() : null;
}
async function sbGet(path) {
  const r = await fetch(`${SURL}/rest/v1/${path}`, { headers: H() });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbPatch(path, body) {
  await fetch(`${SURL}/rest/v1/${path}`, { method: 'PATCH', headers: { ...H(), Prefer: 'return=minimal' }, body: JSON.stringify(body) }).catch(() => {});
}
async function rpc(url, service, method, args) {
  const r = await fetch(`${url}/jsonrpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error((j.error.data && j.error.data.message) || j.error.message || 'Error de Odoo');
  return j.result;
}

function armarAccesoHtml({ nombre, curso, link }) {
  const primero = esc((nombre || '').trim().split(/\s+/)[0] || '');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
    <div style="background:#0d2b45;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Academia Innovaci</div>
      <div style="font-size:21px;font-weight:700;margin-top:4px;">🔑 Activa tu acceso</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px;">
      <p style="font-size:14px;line-height:1.55;margin:0 0 12px;">Hola${primero ? ' ' + primero : ''}, tu lugar en nuestra Academia en línea ya está listo${curso ? ' — <b>' + esc(curso) + '</b>' : ''}.</p>
      <p style="font-size:14px;line-height:1.55;margin:0 0 16px;">Para entrar solo tienes que <b>crear tu contraseña</b>. No necesitas registrarte: tu cuenta ya existe, solo defínela con el botón de abajo y usa <b>este mismo correo</b> para iniciar sesión.</p>
      <div style="text-align:center;margin:4px 0 20px;"><a href="${esc(link)}" style="display:inline-block;background:#0f8b8d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Crear mi contraseña y entrar</a></div>
      <p style="font-size:12px;color:#6b7280;margin:0 0 4px;">Si el botón no abre, copia y pega esta liga en tu navegador:</p>
      <p style="font-size:12px;color:#0f8b8d;word-break:break-all;margin:0 0 14px;">${esc(link)}</p>
      <p style="font-size:13px;color:#374151;margin:8px 0 0;">¿Alguna duda? Responde a este correo y con gusto te ayudamos.</p>
      <p style="font-size:13px;color:#374151;margin:14px 0 0;">Un abrazo,<br><b>Academia Innovaci</b></p>
    </div></div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
    if (!RESEND) return res.status(200).json({ ok: false, error: 'Falta RESEND_API_KEY' });
    const u = await usuarioDeSesion(req);
    if (!u) return res.status(401).json({ ok: false, error: 'Sesión no válida' });

    const URL_ = String(process.env.ODOO_URL || '').trim().replace(/\/+$/, '');
    const DB = String(process.env.ODOO_DB || '').trim();
    const LOGIN = String(process.env.ODOO_LOGIN || '').trim();
    const KEY = String(process.env.ODOO_API_KEY || '').trim();
    if (!URL_ || !DB || !LOGIN || !KEY) return res.status(200).json({ ok: false, error: 'Odoo no está configurado en Vercel.' });

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const id = String(body.inscripcion_id || '');
    if (!uuidRe.test(id)) return res.status(400).json({ ok: false, error: 'Falta inscripcion_id' });

    const insc = (await sbGet(`academia_inscripciones?id=eq.${id}&select=id,atencion,odoo_partner_id,participante:participante_id(nombre,mail,telefono),generacion:generacion_id(curso:curso_id(nombre))`))[0];
    if (!insc) return res.status(200).json({ ok: false, error: 'No se encontró la inscripción' });
    const nombre = (insc.participante && insc.participante.nombre) || '';
    const email = limpio(insc.participante && insc.participante.mail);
    const tel = limpio(insc.participante && insc.participante.telefono);
    const curso = insc.generacion && insc.generacion.curso && insc.generacion.curso.nombre;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(200).json({ ok: false, error: 'El alumno no tiene un correo válido en la App' });

    // Odoo
    const uid = await rpc(URL_, 'common', 'authenticate', [DB, LOGIN, KEY, {}]);
    if (!uid) return res.status(200).json({ ok: false, error: 'Odoo rechazó el login/clave.' });
    const call = (model, m, a, kw) => rpc(URL_, 'object', 'execute_kw', [DB, uid, KEY, model, m, a, kw || {}]);

    // 1) Contacto (partner): usa el guardado, o busca por correo, o lo crea.
    let pid = insc.odoo_partner_id ? Number(insc.odoo_partner_id) : null;
    if (!pid) {
      const found = await call('res.partner', 'search_read', [[['email', '=ilike', email]]], { fields: ['id'], limit: 1 });
      pid = found && found.length ? found[0].id : null;
      if (!pid) pid = await call('res.partner', 'create', [{ name: nombre || email, email, ...(tel ? { phone: tel } : {}) }]);
    }

    // 2) ¿Ya tiene usuario de acceso? (solo informativo para el mensaje)
    let yaTeniaUsuario = false;
    try {
      const us = await call('res.users', 'search_read', [[['login', '=ilike', email]]], { fields: ['id'], limit: 1 });
      yaTeniaUsuario = !!(us && us.length);
    } catch (e) {}

    // 3) Liga para definir contraseña, ligada a ESE contacto (no crea contacto nuevo).
    try { await call('res.partner', 'signup_prepare', [[pid]]); }
    catch (e) { return res.status(200).json({ ok: false, error: 'No se pudo preparar el acceso en Odoo: ' + (e.message || e) }); }
    // Odoo 19 ya no deja LEER 'signup_token' por RPC ("Invalid field 'signup_token' on res.partner").
    // Se intenta primero con 'signup_url' (la liga completa, que ya trae el token); si ese campo
    // tampoco está, se cae a 'signup_token'; y si nada, solo el nombre — sin tronar el endpoint.
    let info = {};
    for (const fields of [['signup_url', 'name'], ['signup_token', 'name'], ['name']]) {
      try { info = (await call('res.partner', 'read', [[pid], fields]))[0] || {}; break; } catch (e) { /* prueba el siguiente set de campos */ }
    }
    let link = info.signup_url || (info.signup_token ? `${ACADEMIA_URL}/web/signup?token=${encodeURIComponent(info.signup_token)}` : null);
    if (!link) return res.status(200).json({ ok: false, error: 'Odoo no generó la liga de acceso (revisa que el registro por invitación esté habilitado en la Academia).' });

    // 4) Correo por Resend (no por Odoo). Copia SIEMPRE a Capacitación y a quien
    // lo envía (sin duplicar al alumno), para que quede constancia del acceso.
    const lower = (s) => String(s || '').trim().toLowerCase();
    const cc = [...new Set([CAPA, u.email].map(lower).filter((x) => x && x !== lower(email)))];
    const html = armarAccesoHtml({ nombre, curso, link });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], cc, reply_to: CAPA, subject: '🔑 Activa tu acceso a Academia Innovaci', html }),
    });
    const rb = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(200).json({ ok: false, error: 'Resend: ' + (rb.message || r.status) });

    // 5) Marca la inscripción
    const ahora = new Date().toISOString();
    await sbPatch(`academia_inscripciones?id=eq.${id}`, {
      odoo_partner_id: pid,
      atencion: { ...(insc.atencion || {}), acceso_enviado_at: ahora, acceso_enviado_por: String(u.email || '') },
    });

    return res.status(200).json({ ok: true, enviado_a: email, copia_a: cc, ya_tenia_usuario: yaTeniaUsuario, partner_id: pid });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
