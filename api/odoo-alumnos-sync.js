// api/odoo-alumnos-sync.js
//
// Jp, 2026-11-16 — Trae de Odoo a TODOS los alumnos inscritos en cada curso
// (slide.channel.partner) y los guarda en Supabase (odoo_alumnos_cursos) para:
//   · saber cuántos alumnos hay por curso y por sistema (COI, NOI, SAE…),
//   · darles seguimiento (ofrecer cursos, ver cómo van),
//   · cruzarlos con asistentes de Academia y cuentas de Cartera (odoo_cruzar_alumnos).
// SOLO LEE de Odoo. Nunca devuelve ni imprime la clave.
//
// Autorización: sesión de un usuario de la App (Bearer token) o el cron
// (Bearer SYNC_SECRET / CRON_SECRET).
// Variables: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY, SUPABASE_SERVICE_ROLE_KEY.

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

// Sistema Aspel/Siigo según el nombre del curso.
function sistemaDeCurso(n) {
  const t = String(n || '').toUpperCase();
  if (/\bNOI\b/.test(t)) return 'NOI';
  if (/\bCOI\b/.test(t)) return 'COI';
  if (/\bSAE\b/.test(t)) return 'SAE';
  if (/\bBANCO\b/.test(t)) return 'BANCO';
  if (/\bPROD\b/.test(t)) return 'PROD';
  if (/FISCAL/.test(t)) return 'Fiscal';
  if (/INTERFACES/.test(t)) return 'Interfaces';
  if (/CFDI/.test(t)) return 'COI';
  return 'Otro';
}

const un = (v) => (Array.isArray(v) ? v[0] : v);
const nom = (v) => (Array.isArray(v) ? v[1] : null);
const limpio = (v) => (v === false || v === null || v === undefined || v === '' ? null : String(v).trim());

async function sbUpsert(filas) {
  const r = await fetch(`${SURL}/rest/v1/odoo_alumnos_cursos?on_conflict=id`, {
    method: 'POST',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filas),
  });
  if (!r.ok) throw new Error(`Supabase upsert -> ${r.status}: ${await r.text()}`);
}

export default async function handler(req, res) {
  try {
    if (!SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
    if (!(await autorizado(req))) return res.status(401).json({ ok: false, error: 'No autorizado' });

    const URL_ = String(process.env.ODOO_URL || '').trim().replace(/\/+$/, '');
    const DB = String(process.env.ODOO_DB || '').trim();
    const LOGIN = String(process.env.ODOO_LOGIN || '').trim();
    const KEY = String(process.env.ODOO_API_KEY || '').trim();
    if (!URL_ || !DB || !LOGIN || !KEY) return res.status(200).json({ ok: false, error: 'Odoo no está configurado en Vercel.' });

    const inicio = new Date().toISOString();
    const uid = await rpc(URL_, 'common', 'authenticate', [DB, LOGIN, KEY, {}]);
    if (!uid) return res.status(200).json({ ok: false, error: 'Odoo rechazó el login/clave.' });
    const call = (model, m, a, kw) => rpc(URL_, 'object', 'execute_kw', [DB, uid, KEY, model, m, a, kw || {}]);

    // Solo se piden los campos que existan en esta versión de Odoo.
    const fi = await call('slide.channel.partner', 'fields_get', [], { attributes: ['type'] });
    const fp = await call('res.partner', 'fields_get', [], { attributes: ['type'] });
    const camposIns = ['channel_id', 'partner_id', 'completion', 'completed', 'member_status', 'create_date'].filter((c) => fi[c]);
    const camposPar = ['name', 'email', 'phone', 'mobile', 'parent_id', 'commercial_company_name', 'company_name'].filter((c) => fp[c]);

    const cursos = await call('slide.channel', 'search_read', [[]], { fields: ['id', 'name'], context: { active_test: false } });
    const cursoNombre = new Map(cursos.map((c) => [c.id, c.name]));

    // Inscripciones (paginadas)
    const ins = [];
    for (let off = 0; off < 50000; off += 2000) {
      const lote = await call('slide.channel.partner', 'search_read', [[]], { fields: camposIns, limit: 2000, offset: off, order: 'id' });
      ins.push(...lote);
      if (lote.length < 2000) break;
    }

    // Datos de contacto de los alumnos
    const pids = [...new Set(ins.map((i) => un(i.partner_id)).filter(Boolean))];
    const partners = new Map();
    for (let i = 0; i < pids.length; i += 400) {
      const lote = await call('res.partner', 'read', [pids.slice(i, i + 400)], { fields: camposPar });
      lote.forEach((p) => partners.set(p.id, p));
    }

    const filas = ins.map((i) => {
      const cid = un(i.channel_id);
      const p = partners.get(un(i.partner_id)) || {};
      const nombreCurso = cursoNombre.get(cid) || nom(i.channel_id);
      const completado = !!i.completed || i.member_status === 'completed';
      const avance = typeof i.completion === 'number' ? i.completion : null;
      return {
        id: i.id,
        channel_id: cid,
        channel_nombre: nombreCurso,
        sistema: sistemaDeCurso(nombreCurso),
        partner_id: un(i.partner_id) || null,
        nombre: limpio(p.name) || nom(i.partner_id),
        email: limpio(p.email) ? limpio(p.email).toLowerCase() : null,
        telefono: limpio(p.mobile) || limpio(p.phone),
        empresa: nom(p.parent_id) || limpio(p.commercial_company_name) || limpio(p.company_name),
        estado: i.member_status || (completado ? 'completed' : null),
        avance,
        completado,
        inscrito_at: i.create_date ? String(i.create_date).replace(' ', 'T') + 'Z' : null,
        sync_at: inicio,
      };
    });

    for (let i = 0; i < filas.length; i += 500) await sbUpsert(filas.slice(i, i + 500));

    // Quita a quien ya no está inscrito en Odoo
    await fetch(`${SURL}/rest/v1/odoo_alumnos_cursos?sync_at=lt.${encodeURIComponent(inicio)}`, {
      method: 'DELETE', headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });

    // Cruce con asistentes / cuentas de la app
    let cruce = null;
    const rc = await fetch(`${SURL}/rest/v1/rpc/odoo_cruzar_alumnos`, {
      method: 'POST', headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (rc.ok) cruce = await rc.json(); else cruce = { error: await rc.text() };

    return res.status(200).json({ ok: true, cursos: cursos.length, inscripciones: filas.length, alumnos_unicos: pids.length, cruce });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
