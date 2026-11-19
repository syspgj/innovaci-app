// api/operaciones-avisar-asesor.js
//
// Jp, 2026-11-19 (Fase 1b de Mesa de Control): cuando Coordinación ASIGNA un
// servicio a un asesor (ops.html → Asignaciones), este endpoint avisa por
// Telegram al grupo de Coordinación con cliente, servicio, día/hora, el asesor
// y lo clave del catálogo (qué validar / qué pedir al cliente / tiempo aprox.).
// Best-effort: si falla, la asignación ya quedó guardada en servicios_ejecutados.
//
// Entrada (POST JSON, con sesión Bearer): { servicio_id, reenviar?: boolean }
//   Sin 'reenviar' no repite si ya se avisó (servicios_ejecutados.aviso_asesor_at).
// Variables de entorno en Vercel:
//   SUPABASE_URL (o la fija de abajo), SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
//   TELEGRAM_COORDINACION_CHAT_ID  → el grupo "Coordinación Soporte" donde están los asesores.
//     (si no existe, cae a TELEGRAM_ASIGNACIONES_CHAT_ID). El bot debe ser miembro del grupo.
// Salida: { ok:true, enviado_at } | { ok:true, yaEnviado:true } | { ok:false, error }

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_COORDINACION_CHAT_ID || process.env.TELEGRAM_ASIGNACIONES_CHAT_ID;
const UUID = /^[0-9a-f-]{36}$/i;

async function sesionValida(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SURL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SKEY } });
  if (!r.ok) return false;
  try { const u = await r.json(); return { email: u.email || '' }; } catch (e) { return { email: '' }; }
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
const fechaMx = (f) => {
  if (!f) return 'sin fecha';
  const p = String(f).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f;
};
const corta = (t, n) => { t = String(t == null ? '' : t).trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  let id = '';
  try {
    if (!SURL || !SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' });
    if (!BOT) return res.status(200).json({ ok: false, error: 'Falta TELEGRAM_BOT_TOKEN' });
    if (!CHAT) return res.status(200).json({ ok: false, error: 'Falta configurar el grupo de Coordinación (TELEGRAM_COORDINACION_CHAT_ID). El servicio sí quedó asignado.' });
    if (!(await sesionValida(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    id = String(body.servicio_id || '');
    if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'Falta servicio_id' });
    const reenviar = body.reenviar === true;

    const s = (await sbGet(`servicios_ejecutados?id=eq.${id}&select=cliente_nombre,tipo_servicio,descripcion_solicitud,asesor_nombre,fecha_asignada,hora_asignada,solicitado_por,nota,aviso_asesor_at`))[0];
    if (!s) return res.status(200).json({ ok: false, error: 'No se encontró la asignación' });
    if (s.aviso_asesor_at && !reenviar) return res.status(200).json({ ok: true, yaEnviado: true });

    // Guía del catálogo (best-effort): qué validar / qué pedir al cliente / tiempo aprox.
    let cat = null;
    try {
      cat = (await sbGet(`operaciones_servicios_catalogo?nombre=eq.${encodeURIComponent(s.tipo_servicio || '')}&select=consideraciones_mc,requisitos_cliente,tiempo_prom_txt&limit=1`))[0] || null;
    } catch (_) { cat = null; }

    const L = [];
    L.push('🛠 NUEVO SERVICIO ASIGNADO');
    L.push('');
    L.push(`👤 Asesor: ${s.asesor_nombre || '—'}`);
    L.push(`🏢 Cliente: ${s.cliente_nombre || '—'}`);
    L.push(`🧾 Servicio: ${s.tipo_servicio || '—'}`);
    L.push(`📅 Cuándo: ${fechaMx(s.fecha_asignada)}${s.hora_asignada ? ' · ' + String(s.hora_asignada).slice(0, 5) : ''}`);
    if (s.solicitado_por) L.push(`📞 Contacto: ${s.solicitado_por}`);
    if (s.descripcion_solicitud) { L.push(''); L.push(`Lo solicitado: ${corta(s.descripcion_solicitud, 500)}`); }
    if (s.nota) L.push(`Nota: ${corta(s.nota, 300)}`);
    if (cat && (cat.consideraciones_mc || cat.requisitos_cliente || cat.tiempo_prom_txt)) {
      L.push('');
      L.push('— Guía del servicio —');
      if (cat.tiempo_prom_txt) L.push(`⏱ Tiempo aprox.: ${cat.tiempo_prom_txt}`);
      if (cat.requisitos_cliente) L.push(`📋 Pedirle al cliente: ${corta(cat.requisitos_cliente, 350)}`);
      if (cat.consideraciones_mc) L.push(`🔎 Antes de empezar: ${corta(cat.consideraciones_mc, 350)}`);
    }
    L.push('');
    L.push('Al terminar, sube tu reporte con evidencias sobre esta misma asignación.');

    const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: L.join('\n') }),
    });
    if (!r.ok) {
      const err = 'Telegram: ' + (await r.text()).slice(0, 300);
      try { await sbPatch(`servicios_ejecutados?id=eq.${id}`, { aviso_asesor_error: err.slice(0, 300) }); } catch (_) {}
      return res.status(200).json({ ok: false, error: err });
    }
    const ahora = new Date().toISOString();
    try { await sbPatch(`servicios_ejecutados?id=eq.${id}`, { aviso_asesor_at: ahora, aviso_asesor_error: null }); } catch (_) {}
    return res.status(200).json({ ok: true, enviado_at: ahora });
  } catch (e) {
    if (id) { try { await sbPatch(`servicios_ejecutados?id=eq.${id}`, { aviso_asesor_error: String(e?.message || e).slice(0, 300) }); } catch (_) {} }
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
