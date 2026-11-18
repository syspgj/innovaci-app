// api/respond-traer-contacto.js
//
// Jp, 2026-11-18 — "¿qué pasa si llega alguien por WhatsApp que no está dado
// de alta y me compra de volada?". Esto trae UN contacto concreto de
// Respond.io por su teléfono (o correo) en el momento, sin esperar al barrido
// de cada hora. Aplica las mismas reglas que el cron:
//   · Si ya existe como prospecto, lo liga y completa lo que falte.
//   · Si ya es cliente de Cartera, lo dice y no crea prospecto.
//   · Si no existe, lo da de alta como prospecto.
//
// POST /api/respond-traer-contacto?telefono=5512345678
// POST /api/respond-traer-contacto?email=alguien@correo.com
//
// Exige una sesión de Supabase válida (Authorization: Bearer <token>).

const RESPOND_TOKEN = process.env.RESPOND_API_TOKEN;
const RESPOND_BASE = process.env.RESPOND_API_BASE || 'https://api.respond.io/v2';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ESTATUS_NUEVO = process.env.RESPOND_ESTATUS_NUEVO || 'Nuevo';

const cab = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: cab });
  if (!res.ok) throw new Error(`GET ${path} falló (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function sbPost(table, fila, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...cab, Prefer: prefer || 'return=representation' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) throw new Error(`POST ${table} falló (${res.status}): ${(await res.text()).slice(0, 250)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
async function sbPatch(pathConFiltro, cambios) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathConFiltro}`, {
    method: 'PATCH',
    headers: { ...cab, Prefer: 'return=minimal' },
    body: JSON.stringify(cambios),
  });
  if (!res.ok) throw new Error(`PATCH ${pathConFiltro} falló (${res.status})`);
}

function ultimos10(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}
function limpiarTexto(t) {
  const s = String(t == null ? '' : t).trim();
  return s || null;
}
function correoNorm(e) {
  const s = limpiarTexto(e);
  return s ? s.toLowerCase() : null;
}
// Mismo criterio que el cron: los últimos 10 dígitos, venga como venga.
function aInternacional(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) return '+52' + d;
  if (d.length === 12 && d.startsWith('52')) return '+' + d;
  if (d.length === 13 && d.startsWith('521')) return '+52' + d.slice(3);
  return '+' + d;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no soportado' });
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'No autorizado' });
  if (!RESPOND_TOKEN) return res.status(200).json({ ok: false, error: 'Falta RESPOND_API_TOKEN en el servidor.' });

  let usuarioId = null;
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: auth },
    });
    if (!u.ok) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    const datos = await u.json().catch(() => null);
    usuarioId = datos && datos.id ? datos.id : null;
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo validar la sesión.' });
  }

  const telRaw = req.query && req.query.telefono ? String(req.query.telefono) : '';
  const mailRaw = req.query && req.query.email ? String(req.query.email) : '';
  if (!telRaw && !mailRaw) return res.status(200).json({ ok: false, error: 'Escribe un teléfono o un correo para buscar.' });

  try {
    // 1) Buscarlo en Respond.io
    const identificador = telRaw ? 'phone:' + aInternacional(telRaw) : 'email:' + correoNorm(mailRaw);
    const r = await fetch(`${RESPOND_BASE.replace(/\/+$/, '')}/contact/${encodeURIComponent(identificador)}`, {
      headers: { Authorization: `Bearer ${RESPOND_TOKEN}`, Accept: 'application/json' },
    });
    if (r.status === 404) {
      return res.status(200).json({ ok: true, encontrado: false, buscado: identificador.replace(/^phone:|^email:/, '') });
    }
    if (!r.ok) {
      const t = await r.text();
      return res.status(200).json({ ok: false, error: `Respond.io respondió ${r.status}: ${t.slice(0, 160)}` });
    }
    const c = await r.json();

    const tel = limpiarTexto(c.phone) || (telRaw ? aInternacional(telRaw) : null);
    const telN = ultimos10(tel);
    const mail = correoNorm(c.email) || correoNorm(mailRaw);
    const nombre = [limpiarTexto(c.firstName), limpiarTexto(c.lastName)].filter(Boolean).join(' ') || null;
    const asig = c.assignee && typeof c.assignee === 'object'
      ? [limpiarTexto(c.assignee.firstName), limpiarTexto(c.assignee.lastName)].filter(Boolean).join(' ') || null
      : limpiarTexto(c.assignee);
    const etiquetas = Array.isArray(c.tags) ? c.tags : [];

    // 2) ¿Ya existe en la app? El cruce se hace en memoria sobre un conjunto
    //    chico (solo los que comparten los últimos dígitos o el correo).
    let cartera = null, prospecto = null;
    if (telN) {
      const sufijo = telN.slice(-8); // suficiente para acotar sin perder los que traen separadores
      const [cs, ps] = await Promise.all([
        sbGet(`clientes_cartera?select=id,razon_social,telefono,telefono_whatsapp&or=(telefono.ilike.*${sufijo}*,telefono_whatsapp.ilike.*${sufijo}*)&limit=50`),
        sbGet(`prospectos?select=id,nombre,telefono,email,cliente_cartera_id,respond_contacto_id&telefono=ilike.*${sufijo}*&limit=50`),
      ]);
      cartera = (cs || []).find((x) => ultimos10(x.telefono) === telN || ultimos10(x.telefono_whatsapp) === telN) || null;
      prospecto = (ps || []).find((x) => ultimos10(x.telefono) === telN) || null;
    }
    if (!cartera && mail) {
      const cs = await sbGet(`clientes_cartera?select=id,razon_social&correo_principal=ilike.${encodeURIComponent(mail)}&limit=1`);
      cartera = cs[0] || null;
    }
    if (!prospecto && mail) {
      const ps = await sbGet(`prospectos?select=id,nombre,telefono,email,cliente_cartera_id,respond_contacto_id&email=ilike.${encodeURIComponent(mail)}&limit=1`);
      prospecto = ps[0] || null;
    }

    const espejo = {
      respond_id: c.id,
      nombre, telefono: tel, telefono_norm: telN, email: mail,
      lifecycle: limpiarTexto(c.lifecycle),
      estatus_conversacion: limpiarTexto(c.status),
      asignado_nombre: asig || null,
      etiquetas: etiquetas.length ? etiquetas : null,
      campos_personalizados: c.custom_fields ?? c.customFields ?? null,
      sincronizado_at: new Date().toISOString(),
    };

    if (prospecto) {
      const cambios = { respond_contacto_id: c.id, updated_at: new Date().toISOString() };
      if (!prospecto.telefono && tel) cambios.telefono = tel;
      if (!prospecto.email && mail) cambios.email = mail;
      if (cartera && !prospecto.cliente_cartera_id) cambios.cliente_cartera_id = cartera.id;
      await sbPatch(`prospectos?id=eq.${prospecto.id}`, cambios);
      espejo.prospecto_id = prospecto.id;
      espejo.cliente_cartera_id = cartera ? cartera.id : (prospecto.cliente_cartera_id || null);
      espejo.resultado = 'ligado_prospecto';
      await sbPost('respond_contactos', espejo, 'resolution=merge-duplicates,return=minimal');
      return res.status(200).json({
        ok: true, encontrado: true, resultado: 'ya_existia_prospecto',
        nombre: nombre || prospecto.nombre, telefono: tel, prospecto_id: prospecto.id,
        etiquetas, lifecycle: espejo.lifecycle, atendido_por: asig || null,
        es_cliente: !!cartera, cliente: cartera ? cartera.razon_social : null,
      });
    }

    if (cartera) {
      espejo.cliente_cartera_id = cartera.id;
      espejo.resultado = 'ligado_cartera';
      await sbPost('respond_contactos', espejo, 'resolution=merge-duplicates,return=minimal');
      return res.status(200).json({
        ok: true, encontrado: true, resultado: 'ya_es_cliente',
        nombre, telefono: tel, cliente: cartera.razon_social, cliente_cartera_id: cartera.id,
        etiquetas, lifecycle: espejo.lifecycle, atendido_por: asig || null,
      });
    }

    const hoy = new Date();
    const creado = await sbPost('prospectos', {
      nombre: nombre || tel || mail || 'Contacto de WhatsApp',
      telefono: tel, email: mail,
      origen: 'respond', evento: 'WhatsApp (Respond.io)',
      estatus: ESTATUS_NUEVO,
      anio: hoy.getFullYear(), mes: hoy.getMonth() + 1,
      fecha_contacto: hoy.toISOString().slice(0, 10),
      respond_contacto_id: c.id,
      asignado_a: usuarioId,
      notas: [
        espejo.lifecycle ? 'Etapa en Respond: ' + espejo.lifecycle : null,
        etiquetas.length ? 'Etiquetas: ' + etiquetas.join(', ') : null,
        asig ? 'Atendido en Respond por: ' + asig : null,
        'Traído a mano desde WhatsApp el ' + hoy.toISOString().slice(0, 10) + '.',
      ].filter(Boolean).join(' · '),
    });
    const idNuevo = Array.isArray(creado) ? creado[0]?.id : creado?.id;
    espejo.prospecto_id = idNuevo || null;
    espejo.resultado = 'prospecto_creado';
    await sbPost('respond_contactos', espejo, 'resolution=merge-duplicates,return=minimal');

    return res.status(200).json({
      ok: true, encontrado: true, resultado: 'prospecto_creado',
      nombre, telefono: tel, prospecto_id: idNuevo,
      etiquetas, lifecycle: espejo.lifecycle, atendido_por: asig || null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
