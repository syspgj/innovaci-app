// api/odoo-inscribir.js
//
// Jp, 2026-11-20 — Inscribe en Odoo (eLearning) a los alumnos de Academia que
// ya tienen su inscripción liberada en la app. Es la pieza de ESCRITURA que
// faltaba (odoo-alumnos-sync.js solo LEE). Es idempotente: por cada alumno
// busca si ya está inscrito en el curso y solo lo inscribe si no lo está, así
// que se puede correr mil veces sin duplicar.
//
// Flujo por inscripción (academia_inscripciones):
//   1. Toma el participante (nombre, correo, teléfono) y la(s) liga(s) de la
//      generación a cursos de Odoo (academia_generacion_odoo.odoo_channel_id).
//   2. Busca el alumno en Odoo por correo (res.partner); si no existe, lo crea.
//   3. Para cada curso: si no está inscrito (slide.channel.partner), lo inscribe.
//   4. Marca la inscripción: odoo_inscrito_at / odoo_partner_id / odoo_channel_id,
//      o deja odoo_error si algo falló.
//
// Entrada (POST JSON):
//   { inscripcion_ids:[...] }        -> procesa esas inscripciones
//   { solo_pendientes:true, limite } -> procesa las que aún no están en Odoo
// Autorización: sesión de la app (Bearer token) o cron (SYNC_SECRET/CRON_SECRET).
// Variables: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// NUNCA devuelve ni imprime la clave de Odoo.

export const config = { maxDuration: 60 };

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function autorizado(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const secretos = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (secretos.includes(token)) return true;
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
  }).catch(() => {});
}

async function rpc(url, service, method, args) {
  const r = await fetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error((j.error.data && j.error.data.message) || j.error.message || 'Error de Odoo');
  return j.result;
}

const limpio = (v) => (v === false || v === null || v === undefined || v === '' ? null : String(v).trim());
const uuidRe = /^[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
    if (!(await autorizado(req))) return res.status(401).json({ ok: false, error: 'No autorizado' });

    const URL_ = String(process.env.ODOO_URL || '').trim().replace(/\/+$/, '');
    const DB = String(process.env.ODOO_DB || '').trim();
    const LOGIN = String(process.env.ODOO_LOGIN || '').trim();
    const KEY = String(process.env.ODOO_API_KEY || '').trim();
    if (!URL_ || !DB || !LOGIN || !KEY) return res.status(200).json({ ok: false, error: 'Odoo no está configurado en Vercel.' });

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const ids = Array.isArray(body.inscripcion_ids) ? body.inscripcion_ids.filter((x) => uuidRe.test(String(x))) : [];
    const soloPendientes = !!body.solo_pendientes;
    const limite = Math.min(Math.max(parseInt(body.limite, 10) || 40, 1), 100);

    // 1) Inscripciones a procesar
    const sel = 'id,generacion_id,odoo_inscrito_at,odoo_partner_id,participante:participante_id(nombre,mail,telefono)';
    let inscripciones = [];
    if (ids.length) {
      inscripciones = await sbGet(`academia_inscripciones?id=in.(${ids.join(',')})&select=${sel}`);
    } else if (soloPendientes) {
      inscripciones = await sbGet(`academia_inscripciones?odoo_inscrito_at=is.null&select=${sel}&order=created_at.asc&limit=${limite}`);
    } else {
      return res.status(400).json({ ok: false, error: 'Falta inscripcion_ids o solo_pendientes.' });
    }
    if (!inscripciones.length) return res.status(200).json({ ok: true, procesadas: 0, inscritos: 0, ya_estaban: 0, errores: [], mensaje: 'No hay inscripciones por procesar.' });

    // 2) Mapeo generación -> cursos de Odoo
    const genIds = [...new Set(inscripciones.map((i) => i.generacion_id).filter(Boolean))];
    const ligas = genIds.length ? await sbGet(`academia_generacion_odoo?generacion_id=in.(${genIds.join(',')})&select=generacion_id,odoo_channel_id,odoo_nombre`) : [];
    const canalesPorGen = {};
    ligas.forEach((l) => { (canalesPorGen[l.generacion_id] = canalesPorGen[l.generacion_id] || []).push({ id: Number(l.odoo_channel_id), nombre: l.odoo_nombre }); });

    // 3) Odoo
    const uid = await rpc(URL_, 'common', 'authenticate', [DB, LOGIN, KEY, {}]);
    if (!uid) return res.status(200).json({ ok: false, error: 'Odoo rechazó el login/clave.' });
    const call = (model, m, a, kw) => rpc(URL_, 'object', 'execute_kw', [DB, uid, KEY, model, m, a, kw || {}]);

    let inscritos = 0, yaEstaban = 0;
    const errores = [], detalle = [];

    for (const ins of inscripciones) {
      const nombre = limpio(ins.participante?.nombre);
      const email = limpio(ins.participante?.mail);
      const tel = limpio(ins.participante?.telefono);
      const canales = canalesPorGen[ins.generacion_id] || [];
      try {
        if (!email) throw new Error('El alumno no tiene correo capturado.');
        if (!canales.length) throw new Error('La generación no tiene curso de Odoo ligado.');

        // Partner (alumno) en Odoo: usa el guardado, o busca por correo, o lo crea.
        let pid = ins.odoo_partner_id ? Number(ins.odoo_partner_id) : null;
        if (!pid) {
          const found = await call('res.partner', 'search_read', [[['email', '=ilike', email]]], { fields: ['id'], limit: 1 });
          pid = found && found.length ? found[0].id : null;
          if (!pid) pid = await call('res.partner', 'create', [{ name: nombre || email, email, ...(tel ? { phone: tel } : {}) }]);
        }

        let creados = 0, existentes = 0;
        for (const c of canales) {
          const ya = await call('slide.channel.partner', 'search_read', [[['partner_id', '=', pid], ['channel_id', '=', c.id]]], { fields: ['id'], limit: 1 });
          if (ya && ya.length) { existentes++; continue; }
          await call('slide.channel.partner', 'create', [{ partner_id: pid, channel_id: c.id }]);
          creados++;
        }

        await sbPatch(`academia_inscripciones?id=eq.${ins.id}`, {
          odoo_inscrito_at: new Date().toISOString(),
          odoo_partner_id: pid,
          odoo_channel_id: canales[0].id,
          odoo_intento_at: new Date().toISOString(),
          odoo_error: null,
        });
        if (creados) inscritos++; else yaEstaban++;
        detalle.push({ id: ins.id, alumno: nombre || email, creados, existentes });
      } catch (e) {
        const msg = String((e && e.message) || e).slice(0, 300);
        await sbPatch(`academia_inscripciones?id=eq.${ins.id}`, { odoo_intento_at: new Date().toISOString(), odoo_error: msg });
        errores.push({ id: ins.id, alumno: nombre || email || '(sin datos)', error: msg });
      }
    }

    return res.status(200).json({ ok: true, procesadas: inscripciones.length, inscritos, ya_estaban: yaEstaban, errores, detalle });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
