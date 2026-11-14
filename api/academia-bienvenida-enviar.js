// api/academia-bienvenida-enviar.js
//
// Correo de bienvenida de Academia Innovaci (Jp, 2026-11-14).
// Capacitación pulsa "✉ Enviar bienvenida" en Academia › Resumen › Nuevos asistentes
// y el asistente recibe: pasos para crear su usuario, qué sigue según su nivel
// (Plus/Premium = laboratorio virtual) y enlaces de apoyo.
//   De: Academia Innovaci · Copia: capacitacion@innovaci.com.mx · Responder a: Capacitación
// Registra el envío en academia_notificaciones_envios (tipo 'bienvenida') y en
// academia_inscripciones.atencion.bienvenida_at.
//
// Entrada (POST JSON): { inscripcion_id }  — requiere sesión (Bearer token).
// Variables: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ACADEMIA_BIENVENIDA_FROM (opcional),
//            CAPACITACION_EMAIL (opcional), ACADEMIA_PUBLICA_URL (opcional, enlace de registro).

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.ACADEMIA_BIENVENIDA_FROM || 'Academia Innovaci <academia@innovaci.com.mx>';
const CAPA = process.env.CAPACITACION_EMAIL || 'capacitacion@innovaci.com.mx';
// Dirección pública de la Academia que ve el asistente. Hoy: academia-innovaci.com;
// cuando se migre al subdominio, basta cambiar ACADEMIA_PUBLICA_URL en Vercel (sin tocar código).
const ACADEMIA_URL = String(process.env.ACADEMIA_PUBLICA_URL || 'https://academia-innovaci.com').replace(/\/+$/, '');

// Enlaces de tutoriales/manuales: Jp los pasará después. Formato: { titulo, url }.
const TUTORIALES = [];

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const H = () => ({ apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' });

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

const GUIA_LAB = 'https://drive.google.com/file/d/1eye_tCH0W7RRrr9SJNQTTXypOwEQf6tk/view';
const GUIA_ZOOM = 'https://drive.google.com/file/d/1E5JKRbg-ZkQYC-GAT4VK66G2I10MIm3_/view';
const urlOk = (u) => /^https?:\/\/\S+$/i.test(String(u || '').trim());

// Reglas (Jp, 2026-11-14):
//  · Zoom (clases en vivo): solo si la modalidad es en_vivo.
//  · Laboratorio virtual (escritorio remoto): solo nivel plus/premium (esencial no lo incluye).
//  · Grupo de WhatsApp: solo en_vivo (los 24/7 no tienen grupo); con el enlace si la generación lo tiene.
//  · Empresariales: mismo esquema con introducción propia (menciona a la empresa).
function armarHtml({ nombre, curso, nivel, modalidad, tipo, empresa, waUrl, zoomUrl }) {
  const primero = esc((nombre || '').trim().split(/\s+/)[0] || '');
  const enVivo = modalidad === 'en_vivo';
  const conLab = nivel && nivel !== 'esencial';
  const empresarial = tipo === 'empresarial';
  const boton = (href, txt) => `<a href="${esc(href)}" style="display:inline-block;margin-top:6px;background:#0f8b8d;color:#fff;padding:7px 14px;border-radius:6px;text-decoration:none;font-weight:700;font-size:12px;">${txt}</a>`;
  const pasos = [];
  pasos.push(['Crea tu usuario en la Academia', `Ingresa a <a href="${esc(ACADEMIA_URL)}/web/signup" style="color:#0f8b8d;">${esc(ACADEMIA_URL.replace('https://', ''))}</a> y crea tu usuario con el correo con el que te registramos. Si ya tienes uno, omite este paso. Guarda muy bien tu correo y tu contraseña.<br>En cuanto termines, respóndenos este correo para asignarte tu curso. Si prefieres esperar, en cuanto detectemos tu alta te lo asignaremos en unos minutos.`]);
  if (enVivo) pasos.push(['Tus clases en vivo por Zoom', `Tus sesiones se imparten en vivo por Zoom. Te enviaremos el enlace de cada sesión por correo o WhatsApp. Antes de tu primera clase, revisa esta guía para conectarte sin problemas (recuerda entrar con tu nombre completo para registrar tu asistencia).<br>${boton(GUIA_ZOOM, 'Guía de acceso a Zoom')}${urlOk(zoomUrl) ? ' ' + boton(zoomUrl, 'Enlace de la sesión') : ''}`]);
  if (conLab) pasos.push(['Acceso al laboratorio virtual', `Tu curso incluye laboratorio virtual para practicar. En breve te haremos llegar tus datos de acceso por este medio y por WhatsApp. Mientras tanto, conoce cómo conectarte al escritorio remoto:<br>${boton(GUIA_LAB, 'Guía del escritorio remoto')}`]);
  if (enVivo) pasos.push(['Grupo de WhatsApp de tu curso', urlOk(waUrl) ? `Únete al grupo de tu curso para avisos, enlaces y dudas:<br>${boton(waUrl, 'Unirme al grupo de WhatsApp')}` : 'Te agregaremos al grupo de WhatsApp de tu curso para avisos y dudas.']);
  const fila = (n, t, c) => `<tr><td style="vertical-align:top;padding:0 12px 16px 0;"><div style="width:28px;height:28px;border-radius:50%;background:#0f8b8d;color:#fff;font-weight:700;font-size:14px;line-height:28px;text-align:center;">${n}</div></td><td style="padding:0 0 16px;"><div style="font-weight:700;font-size:14px;color:#0d2b45;margin-bottom:3px;">${t}</div><div style="font-size:13px;color:#374151;line-height:1.5;">${c}</div></td></tr>`;
  const intro = empresarial
    ? `Nos da mucho gusto darte la bienvenida${empresa ? `: <b>${esc(empresa)}</b> ha contratado este curso de capacitación para ti y tu equipo` : ': tu empresa ha contratado este curso de capacitación para ti'}. Gracias por confiar en Grupo Innovaci.`
    : 'Nos da mucho gusto que hayas dado este paso. Gracias por confiar en nosotros para tu capacitación; te felicitamos por la decisión.';
  const tut = TUTORIALES.length
    ? `<p style="font-size:13px;color:#374151;margin:6px 0 4px;">Mientras tanto, estos recursos te ayudarán a ir avanzando:</p><ul style="font-size:13px;color:#374151;margin:0 0 14px;padding-left:18px;">${TUTORIALES.map((t) => `<li><a href="${esc(t.url)}" style="color:#0f8b8d;">${esc(t.titulo)}</a></li>`).join('')}</ul>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
    <div style="background:#0d2b45;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Academia Innovaci</div>
      <div style="font-size:21px;font-weight:700;margin-top:4px;">¡Bienvenido${primero ? ', ' + primero : ''}!</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px;">
      <p style="font-size:14px;line-height:1.55;margin:0 0 12px;">${intro}</p>
      ${curso ? `<p style="font-size:14px;margin:0 0 16px;"><b>Tu curso:</b> ${esc(curso)}</p>` : ''}
      <p style="font-size:14px;font-weight:700;color:#0d2b45;margin:0 0 12px;">Estos son los siguientes pasos para disfrutar tu curso:</p>
      <table style="border-collapse:collapse;width:100%;">${pasos.map((x, k) => fila(k + 1, x[0], x[1])).join('')}</table>
      ${tut}
      <p style="font-size:13px;color:#374151;margin:8px 0 0;">Cualquier duda, responde a este correo y con gusto te ayudamos.</p>
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
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const id = String(body.inscripcion_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'Falta inscripcion_id' });

    const insc = (await sbGet(`academia_inscripciones?id=eq.${id}&select=id,nivel_acceso,atencion,participante:participante_id(nombre,mail),generacion:generacion_id(cliente_nombre,whatsapp_grupo_url,zoom_url,curso:curso_id(nombre,modalidad,tipo))`))[0];
    if (!insc) return res.status(200).json({ ok: false, error: 'No se encontró la inscripción' });
    const mail = String((insc.participante && insc.participante.mail) || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(200).json({ ok: false, error: 'El asistente no tiene un correo válido en la App' });

    const nombre = (insc.participante && insc.participante.nombre) || '';
    const curso = insc.generacion && insc.generacion.curso && insc.generacion.curso.nombre;
    const gen = insc.generacion || {};
    const html = armarHtml({ nombre, curso, nivel: insc.nivel_acceso, modalidad: gen.curso && gen.curso.modalidad, tipo: gen.curso && gen.curso.tipo, empresa: gen.cliente_nombre, waUrl: gen.whatsapp_grupo_url, zoomUrl: gen.zoom_url });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [mail], cc: [CAPA], reply_to: CAPA, subject: '¡Bienvenido a Academia Innovaci! Tus siguientes pasos', html }),
    });
    const rb = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(200).json({ ok: false, error: 'Resend: ' + (rb.message || r.status) });

    const ahora = new Date().toISOString();
    const quien = String(u.email || '');
    const quienId = u.id || null;
    await fetch(`${SURL}/rest/v1/academia_inscripciones?id=eq.${id}`, {
      method: 'PATCH', headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify({ atencion: { ...(insc.atencion || {}), bienvenida_at: ahora, bienvenida_por: quien } }),
    }).catch(() => {});
    await fetch(`${SURL}/rest/v1/academia_notificaciones_envios`, {
      method: 'POST', headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify({ inscripcion_id: id, tipo: 'bienvenida', enviada_en: ahora, enviada_por: quienId }),
    }).catch(() => {});
    return res.status(200).json({ ok: true, enviado_a: mail, bienvenida_at: ahora });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
