// api/servicios-historicos-sync.js
//
// Jp, 2026-11-19: sincroniza los tickets de soporte de pólizas desde 123FormBuilder
// (API v2) hacia servicios_historicos, para mantener el consumo de pólizas al día.
//
// Cubre los formularios de PÓLIZA (misma estructura, distinto ID interno):
//   4374329 "Pólizas de Asistencia Aspel" y 6862542 "...Aspel - Black".
// (El formulario "Servicio Eventual" 4429701 es facturado por evento, NO consume
//  horas de póliza — se maneja aparte, no aquí.)
//
// Mapea los campos POR NOMBRE (no por ID), así un solo mapeo sirve para todos los
// formularios de póliza. Deduplica por (form_id_origen, id_entrada_form=entry_id):
// cada formulario numera sus registros por separado. Idempotente, best-effort.
//
// Protección: ?key=<CRON_SECRET> / Authorization: Bearer <CRON_SECRET> (cron),
//   o sesión de staff de Operaciones (botón manual).
// Parámetros: ?desde=YYYY-MM-DD (fuerza start_date para TODOS los forms),
//   ?form=<id> (solo ese formulario), ?max=<n> páginas (default 30).
// Variables Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
//   FORM123_EMAIL, FORM123_PASSHASH (MD5), FORM123_TICKETS_FORM_ID ("4374329,6862542").

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.FORM123_EMAIL;
const PASSHASH = process.env.FORM123_PASSHASH;
const FORM_IDS = (process.env.FORM123_TICKETS_FORM_ID || '4374329,6862542').split(',').map((s) => s.trim()).filter(Boolean);
const SECRET = process.env.CRON_SECRET || process.env.SYNC_SECRET;
const API = 'https://api.123formbuilder.com/v2';

// Normaliza una etiqueta de campo: minúsculas, sin acentos, sin signos ni espacios extra.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9¿ ]/g, '').replace(/\s+/g, ' ').trim();

// Nombre de campo (normalizado) → columna de servicios_historicos.
// Se resuelve por igualdad o, para unos pocos, por prefijo (ver labelACol()).
const EXACT = {
  'tipo de ticket': 'tipo_ticket', 'ticket enlazado': 'ticket_enlazado', 'poliza': 'poliza',
  'nombre del contacto': 'contacto', 'correo del contacto': 'contacto_correo',
  'asesor que asistio': 'asesor_nombre', 'correo del asesor': 'asesor_correo',
  'forma del servicio': 'forma_servicio', 'servicio realizado': 'servicio_realizado',
  'fecha programada': 'fecha_programada', 'hora programada': 'hora_programada',
  'sistema relacionado': 'sistema_relacionado', 'sistema relacioado': 'sistema_relacionado',
  'fecha en que se realizo el servicio': 'fecha_realizado',
  'hora de inicio del servicio': 'hora_inicio', 'hora de inicio': 'hora_inicio',
  'hora de conclusion del servicio': 'hora_fin', 'hora de finalizacion': 'hora_fin',
  'descripcion del servicio': 'descripcion', 'numero de resguardo reporte': 'numero_resguardo',
  'eventos telefonicos consumidos': 'eventos_telefonicos',
  'tiempo disponible antes del servicio': 'tiempo_disponible_antes',
  'tiempo restante de la poliza': 'tiempo_restante_despues',
  'observacion interna del servicio': 'observacion_interna', 'observaciones internas': 'observacion_interna',
};
function labelACol(nombre) {
  const n = norm(nombre);
  if (!n) return null;
  if (EXACT[n]) return EXACT[n];
  if (n.startsWith('minutos que duro el servicio')) return 'minutos_remoto';
  if (n.startsWith('¿se realizo el servicio')) return 'q_correcto';
  if (n.startsWith('¿el asesor inicio')) return 'q_inicio';
  if (n.startsWith('¿el asesor reporto')) return 'q_reporto';
  if (n.startsWith('¿el asesor detecto')) return 'q_detecto';
  return null;
}

async function sbGet(path) {
  const r = await fetch(`${SURL}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbInsert(rows) {
  const r = await fetch(`${SURL}/rest/v1/servicios_historicos`, {
    method: 'POST',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase INSERT -> ${r.status}: ${(await r.text()).slice(0, 400)}`);
}
async function api123Fields(JWT, formId) {
  const j = await (await fetch(`${API}/forms/${formId}/fields?JWT=${encodeURIComponent(JWT)}`)).json();
  const ctrl = (j.data && j.data.controls && j.data.controls.data) || (j.controls && j.controls.data) || [];
  // baseFieldId -> columna
  const map = {};
  for (const c of ctrl) { const col = labelACol(c.name); if (col) map[String(c.id)] = col; }
  return map;
}

const intODnull = (s) => { if (!s || /^na$/i.test(s)) return null; const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const siNo = (s) => { s = (s || '').trim(); return /^s[ií]$/i.test(s) ? 'SI' : (/^no$/i.test(s) ? 'NO' : null); };
function fechaISO(s) {
  s = (s || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}
const polizaNum = (s) => { const m = (s || '').match(/\b((?:POL|OP)\s?\d+)\b/i); return m ? m[1].replace(/\s+/g, '').toUpperCase() : null; };
const polizaCliente = (s) => { const p = (s || '').split('|').map((x) => x.trim()); return p.length > 1 ? p[1] : null; };

// Construye la fila a partir del submission y el mapa baseFieldId->columna del form.
function aFila(sub, baseMap, formId) {
  const v = {}; // columna -> valor crudo
  const contacto = [];
  const arr = sub?.content?.fields?.field;
  if (Array.isArray(arr)) for (const f of arr) {
    const base = String(f.fieldid).split('-')[0];
    const col = baseMap[base]; if (!col) continue;
    let val = f.fieldvalue; if (val && typeof val === 'object') val = ''; val = (val == null ? '' : String(val)).trim();
    if (col === 'contacto') { if (val) contacto.push(val); continue; }
    if (v[col] == null || v[col] === '') v[col] = val;
  }
  const q = (c) => siNo(v[c]);
  const quiz = (q('q_correcto') === 'SI' ? 5 : 0) + (q('q_inicio') === 'SI' ? 2 : 0) + (q('q_reporto') === 'SI' ? 3 : 0) + (q('q_detecto') === 'SI' ? 1 : 0);
  const polTxt = v.poliza || '';
  return {
    form_id_origen: Number(formId),
    id_entrada_form: sub.entry_id,
    fecha_registro: sub?.content?.date || sub.date || null,
    tipo_ticket: v.tipo_ticket || null,
    ticket_enlazado: v.ticket_enlazado || null,
    poliza_texto: polTxt || null,
    poliza_numero: polizaNum(polTxt),
    cliente_nombre: polizaCliente(polTxt),
    contacto_nombre: contacto.join(' ') || null,
    contacto_apellido: contacto.length > 1 ? contacto[contacto.length - 1] : null,
    contacto_correo: v.contacto_correo || null,
    asesor_nombre: v.asesor_nombre || null,
    asesor_correo: v.asesor_correo || null,
    forma_servicio: v.forma_servicio || null,
    servicio_realizado: v.servicio_realizado || null,
    fecha_programada: fechaISO(v.fecha_programada),
    hora_programada: v.hora_programada || null,
    sistema_relacionado: v.sistema_relacionado || null,
    fecha_realizado: fechaISO(v.fecha_realizado) || fechaISO(sub?.content?.date || sub.date),
    hora_inicio: v.hora_inicio || null,
    hora_fin: v.hora_fin || null,
    descripcion: v.descripcion || null,
    numero_resguardo: v.numero_resguardo || null,
    minutos_remoto: intODnull(v.minutos_remoto),
    eventos_telefonicos: v.eventos_telefonicos || null,
    tiempo_disponible_antes: v.tiempo_disponible_antes || null,
    tiempo_restante_despues: v.tiempo_restante_despues || null,
    observacion_interna: v.observacion_interna || null,
    correcto_reportado: q('q_correcto'), inicio_tiempo_forma: q('q_inicio'),
    reporto_tiempo_forma: q('q_reporto'), detecto_necesidades: q('q_detecto'),
    puntaje_quiz: quiz,
    origen: 'api_123formbuilder_v2',
  };
}

async function sincronizarForm(JWT, formId, desdeForzado, maxPaginas) {
  const baseMap = await api123Fields(JWT, formId);
  if (!Object.keys(baseMap).length) return { form: formId, error: 'No se pudieron leer los campos del formulario' };
  // Último entry importado DE ESTE FORM
  const ult = await sbGet(`servicios_historicos?select=id_entrada_form,fecha_realizado,fecha_registro&form_id_origen=eq.${formId}&id_entrada_form=not.is.null&order=id_entrada_form.desc&limit=1`);
  const lastEntry = ult[0]?.id_entrada_form || 0;
  let desde = desdeForzado;
  if (!desde) {
    if (!lastEntry) desde = '2015-01-01';
    else {
      const base = ult[0]?.fecha_realizado || (ult[0]?.fecha_registro ? String(ult[0].fecha_registro).slice(0, 10) : '2026-08-25');
      const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() - 10); desde = d.toISOString().slice(0, 10);
    }
  }
  let page = 1, revisados = 0, ultimoEntry = lastEntry, seguir = true;
  const nuevos = [];
  while (seguir && page <= maxPaginas) {
    const url = `${API}/forms/${formId}/submissions?JWT=${encodeURIComponent(JWT)}&start_date=${desde}&per_page=1000&page=${page}`;
    const sr = await fetch(url);
    if (!sr.ok) { if (page === 1) return { form: formId, error: `Submissions ${sr.status}` }; break; }
    const sj = await sr.json();
    const data = sj.data || [];
    revisados += data.length;
    for (const sub of data) {
      if (sub.deleted) continue;
      if (typeof sub.entry_id === 'number' && sub.entry_id > lastEntry) {
        nuevos.push(aFila(sub, baseMap, formId));
        if (sub.entry_id > ultimoEntry) ultimoEntry = sub.entry_id;
      }
    }
    const pag = sj.meta && sj.meta.pagination;
    seguir = pag && pag.current_page < pag.total_pages && data.length > 0;
    page++;
  }
  let importados = 0;
  for (let i = 0; i < nuevos.length; i += 200) { const lote = nuevos.slice(i, i + 200); if (lote.length) { await sbInsert(lote); importados += lote.length; } }
  return { form: formId, importados, revisados, entry_antes: lastEntry, entry_ahora: ultimoEntry, desde };
}

export default async function handler(req, res) {
  try {
    if (!SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
    if (!EMAIL || !PASSHASH) return res.status(200).json({ ok: false, error: 'Faltan FORM123_EMAIL / FORM123_PASSHASH' });
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const key = (req.query && req.query.key) || bearer;
    let autorizado = !!SECRET && key === SECRET;
    if (!autorizado && bearer) {
      try {
        const ur = await fetch(`${SURL}/auth/v1/user`, { headers: { Authorization: `Bearer ${bearer}`, apikey: SKEY } });
        if (ur.ok) { const u = await ur.json(); const rows = await sbGet(`usuarios?id=eq.${u.id}&select=rol`); if (['director', 'mesa_control', 'gerente_operaciones', 'administracion'].includes(rows[0]?.rol)) autorizado = true; }
      } catch (_) {}
    }
    if (!autorizado) return res.status(401).json({ ok: false, error: 'No autorizado' });

    const JWT = (await (await fetch(`${API}/token?email=${encodeURIComponent(EMAIL)}&passhash=${encodeURIComponent(PASSHASH)}`, { method: 'POST' })).json()).token;
    if (!JWT) return res.status(200).json({ ok: false, error: 'Login 123FormBuilder falló' });

    const desdeForzado = (req.query && req.query.desde) || null;
    const maxPaginas = Math.min(parseInt((req.query && req.query.max) || '30', 10) || 30, 100);
    const soloForm = req.query && req.query.form;
    const forms = soloForm ? [String(soloForm)] : FORM_IDS;

    const resultados = [];
    let totalImportados = 0;
    for (const fid of forms) {
      const r = await sincronizarForm(JWT, fid, desdeForzado, maxPaginas);
      resultados.push(r); totalImportados += (r.importados || 0);
    }
    return res.status(200).json({ ok: true, importados: totalImportados, forms: resultados });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
