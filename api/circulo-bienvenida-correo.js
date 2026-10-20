// api/circulo-bienvenida-correo.js
//
// Correo de bienvenida al Círculo Innovaci — pedido por Jp (211026): cuando
// se da de alta un socio nuevo en circulo-admin.html (crearMembresia()), se
// dispara este endpoint (best-effort, POST, sin bloquear el alta si falla)
// para mandarle un correo con buen diseño con sus datos de acceso al portal.
//
// Reutiliza el mismo mecanismo de correo que ya existe en el proyecto
// (Resend vía API REST directa, igual que api/reporte-semanal-vendedores.js
// y api/cron/proyeccion-alertas-seguimiento.js) — mismas variables de
// entorno, ya configuradas en Vercel: RESEND_API_KEY, opcional
// REPORTE_FROM_EMAIL. También reutiliza SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// para leer el dato fresco de la membresía en vez de confiar en lo que mande
// el navegador.
//
// Cómo se usa:
//   1. Coloca este archivo en api/circulo-bienvenida-correo.js dentro del
//      repo (ya tiene esa ruta).
//   2. No requiere variables de entorno nuevas.
//   3. Sube los archivos a tu repo como siempre y Vercel despliega solo.
//
// Body esperado: { membresia_id }.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REPORTE_FROM_EMAIL || 'Círculo Innovaci <reportes@innovaci.com.mx>';
// Jp, 2026-10-14: mismo patrón que el resto de correos automáticos del
// proyecto — copia oculta a Jp de todo lo que se manda.
const JP_BCC_EMAIL = 'joss@innovaci.com.mx';

const PORTAL_URL = 'https://os.innovaci.com.mx/circulo-portal.html';
const LOGO_URL = 'https://os.innovaci.com.mx/circulo-isotipo.png';

const ESPECIALIDAD_LABEL = { NOI: 'Aspel NOI (Nóminas)', COI: 'Aspel COI (Contabilidad)', SAE: 'Aspel SAE (Ventas y Facturación)' };
const PLAN_LABEL = { socio: 'Socio', socio_pro: 'Socio Pro' };

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

function fmtFecha(f) {
  if (!f) return null;
  const [y, m, d] = f.split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(d)} de ${meses[Number(m) - 1]} de ${y}`;
}

function construirHtml(m) {
  const primerNombre = (m.nombre || '').trim().split(' ')[0] || m.nombre || '';
  const especialidadTxt = ESPECIALIDAD_LABEL[m.especialidad] || m.especialidad || '';
  const planTxt = PLAN_LABEL[m.plan] || m.plan || '';
  const vigenciaTxt = fmtFecha(m.fecha_vencimiento);
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#f4f6f8;padding:24px 0;">
    <div style="background:#0D2240;background-image:radial-gradient(circle at 15% 15%,rgba(0,169,157,0.35) 0%,transparent 45%);border-radius:14px 14px 0 0;padding:32px 28px;text-align:center;">
      <img src="${LOGO_URL}" alt="Círculo Innovaci" style="width:64px;height:64px;object-fit:contain;margin-bottom:14px;">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.02em;">¡Bienvenido${primerNombre ? ', ' + primerNombre : ''}!</div>
      <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.72);margin-top:4px;letter-spacing:.02em;">Ya eres parte del Círculo Innovaci</div>
    </div>
    <div style="background:#fff;padding:28px;">
      <div style="font-size:14px;color:#1A2332;line-height:1.6;margin-bottom:20px;">
        Gracias por unirte al Círculo Innovaci como <strong>${planTxt}</strong>${especialidadTxt ? ` de la especialidad <strong>${especialidadTxt}</strong>` : ''}. Aquí tienes tus datos de acceso al portal de socios:
      </div>
      <div style="background:#eefaf9;border:1px dashed #00A99D;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:#00A99D;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Tu código de acceso</div>
        <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:700;color:#0D2240;letter-spacing:.08em;">${m.codigo_acceso}</div>
        <div style="font-size:12px;color:#5b6b7a;margin-top:8px;">Correo registrado: <strong>${m.email}</strong></div>
      </div>
      <div style="text-align:center;margin-bottom:22px;">
        <a href="${PORTAL_URL}" style="display:inline-block;background:#00A99D;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;">Entrar al portal de socios</a>
      </div>
      <div style="font-size:12.5px;color:#5b6b7a;line-height:1.6;margin-bottom:${vigenciaTxt ? '14px' : '0'};">
        Entra con tu correo y el código de arriba. Desde el portal podrás ver tus beneficios disponibles, agendar tu sesión académica privada y más.
      </div>
      ${vigenciaTxt ? `<div style="font-size:12px;color:#8BA0B8;">Tu membresía tiene vigencia hasta el <strong>${vigenciaTxt}</strong>.</div>` : ''}
    </div>
    <div style="text-align:center;padding:16px 20px;">
      <div style="font-size:11px;color:#8BA0B8;">Grupo Innovaci · Distribuidor autorizado Aspel/Siigo (D18944)</div>
    </div>
  </div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido.' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' });
    return;
  }
  if (!RESEND_KEY) {
    res.status(200).json({ ok: false, error: 'Falta RESEND_API_KEY.' });
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
    const membresiaId = body.membresia_id;
    if (!membresiaId) {
      res.status(400).json({ ok: false, error: 'Falta membresia_id.' });
      return;
    }

    const filas = await supabaseGet(
      `circulo_membresias?id=eq.${membresiaId}&select=id,nombre,email,codigo_acceso,especialidad,plan,fecha_vencimiento`
    );
    const m = (filas || [])[0];
    if (!m) {
      res.status(200).json({ ok: false, error: 'No se encontró la membresía.' });
      return;
    }
    if (!m.email) {
      res.status(200).json({ ok: false, error: 'La membresía no tiene correo registrado.' });
      return;
    }

    await enviarCorreo({
      to: m.email,
      subject: '🎉 Bienvenido al Círculo Innovaci — tus datos de acceso',
      html: construirHtml(m),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    // Best-effort desde circulo-admin.html (crearMembresia(), .catch(()=>{}))
    // — igual respondemos 200 con el detalle por si se revisa el log en Vercel.
    res.status(200).json({ ok: false, error: String((err && err.message) || err) });
  }
}
