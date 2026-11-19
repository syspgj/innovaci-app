// api/servicios-historicos-sync.js
//
// Jp, 2026-11-19: sincroniza los tickets de soporte desde 123FormBuilder (API v2)
// hacia la tabla servicios_historicos, para mantener el consumo de pólizas al día.
// Antes era un import manual que se quedó en sept-2026; esto lo automatiza.
//
// Formulario de tickets: "Pólizas de Asistencia Aspel" (FORM123_TICKETS_FORM_ID=4374329).
// Deduplica por id_entrada_form = submission.entry_id. Solo inserta los nuevos
// (entry_id > el máximo ya importado). Best-effort, idempotente.
//
// Protección: requiere ?key=<CRON_SECRET> (o Authorization: Bearer <CRON_SECRET>).
// Parámetros opcionales: ?desde=YYYY-MM-DD (start_date; por defecto = última fecha
//   importada − 10 días), ?max=<n> (tope de páginas, default 30).
//
// Variables Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
//   FORM123_EMAIL, FORM123_PASSHASH (MD5), FORM123_TICKETS_FORM_ID.
// Salida: { ok, importados, revisados, ultimo_entry, desde } | { ok:false, error }

const SURL = process.env.SUPABASE_URL || 'https://ydwouspzneacxfixlmmv.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.FORM123_EMAIL;
const PASSHASH = process.env.FORM123_PASSHASH;
const FORM_ID = process.env.FORM123_TICKETS_FORM_ID || '4374329';
const SECRET = process.env.CRON_SECRET || process.env.SYNC_SECRET;
const API = 'https://api.123formbuilder.com/v2';

// ── Mapa de campos del formulario 4374329 → columnas de servicios_historicos ──
const F = {
  poliza: '47648938', contacto_nom1: '47648945-1', contacto_nom2: '47648945-2',
  contacto_correo: '47648946', asesor_nombre: '47648947', asesor_correo: '49185079',
  forma_servicio: '47648968', servicio_realizado: '117812906',
  fecha_programada: '117813053', hora_programada: '117813059', sistema: '117813061',
  fecha_realizado: '102357709', hora_inicio: '102357717', hora_fin: '102357754',
  descripcion: '47648971', numero_resguardo: '105004208', minutos: '47650310',
  eventos: '47653573', tiempo_antes: '117815109', tiempo_despues: '117815126',
  tiempo_label: '49185087', observacion: '47651012', tipo_ticket: '98118456',
  ticket_enlazado: '98118471',
  q_correcto: '101252697', q_inicio: '101252652', q_reporto: '101252660', q_detecto: '101252669',
};

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

// Convierte content.fields.field[] en un mapa { fieldid: value }
function mapaCampos(sub) {
  const m = {};
  const arr = sub?.content?.fields?.field;
  if (Array.isArray(arr)) for (const f of arr) {
    const v = f.fieldvalue;
    m[String(f.fieldid)] = (v && typeof v === 'object') ? '' : (v == null ? '' : String(v));
  }
  return m;
}
const g = (m, key) => (m[F[key]] || '').trim();
const intODnull = (s) => { if (!s || /^na$/i.test(s)) return null; const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const siNo = (s) => (/^s[ií]$/i.test((s || '').trim()) ? 'SI' : (/^no$/i.test((s || '').trim()) ? 'NO' : (s || null) || null));
function fechaISO(s) {
  s = (s || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  return null;
}
function polizaNum(s) { const m = (s || '').match(/\b((?:POL|OP)\s?\d+)\b/i); return m ? m[1].replace(/\s+/g, '').toUpperCase() : null; }
function polizaCliente(s) { const parts = (s || '').split('|').map(x => x.trim()); return parts.length > 1 ? parts[1] : null; }

function aFila(sub) {
  const m = mapaCampos(sub);
  const quizPts = (siNo(g(m, 'q_correcto')) === 'SI' ? 5 : 0) + (siNo(g(m, 'q_inicio')) === 'SI' ? 2 : 0)
    + (siNo(g(m, 'q_reporto')) === 'SI' ? 3 : 0) + (siNo(g(m, 'q_detecto')) === 'SI' ? 1 : 0);
  const polTxt = g(m, 'poliza');
  return {
    id_entrada_form: sub.entry_id,
    fecha_registro: sub?.content?.date || sub.date || null,
    tipo_ticket: g(m, 'tipo_ticket') || null,
    ticket_enlazado: g(m, 'ticket_enlazado') || null,
    poliza_texto: polTxt || null,
    poliza_numero: polizaNum(polTxt),
    cliente_nombre: polizaCliente(polTxt),
    contacto_nombre: [g(m, 'contacto_nom1'), g(m, 'contacto_nom2')].filter(Boolean).join(' ') || null,
    contacto_apellido: g(m, 'contacto_nom2') || null,
    contacto_correo: g(m, 'contacto_correo') || null,
    asesor_nombre: g(m, 'asesor_nombre') || null,
    asesor_correo: g(m, 'asesor_correo') || null,
    forma_servicio: g(m, 'forma_servicio') || null,
    servicio_realizado: g(m, 'servicio_realizado') || null,
    fecha_programada: fechaISO(g(m, 'fecha_programada')),
    hora_programada: g(m, 'hora_programada') || null,
    sistema_relacionado: g(m, 'sistema') || null,
    fecha_realizado: fechaISO(g(m, 'fecha_realizado')) || fechaISO(sub?.content?.date || sub.date),
    hora_inicio: g(m, 'hora_inicio') || null,
    hora_fin: g(m, 'hora_fin') || null,
    descripcion: g(m, 'descripcion') || null,
    numero_resguardo: g(m, 'numero_resguardo') || null,
    minutos_remoto: intODnull(g(m, 'minutos')),
    eventos_telefonicos: g(m, 'eventos') || null,
    tiempo_disponible_antes: g(m, 'tiempo_antes') || null,
    tiempo_restante_despues: g(m, 'tiempo_despues') || null,
    tiempo_restante_label: g(m, 'tiempo_label') || null,
    observacion_interna: g(m, 'observacion') || null,
    correcto_reportado: siNo(g(m, 'q_correcto')),
    inicio_tiempo_forma: siNo(g(m, 'q_inicio')),
    reporto_tiempo_forma: siNo(g(m, 'q_reporto')),
    detecto_necesidades: siNo(g(m, 'q_detecto')),
    puntaje_quiz: quizPts,
    origen: 'api_123formbuilder_v2',
  };
}

export default async function handler(req, res) {
  try {
    if (!SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
    if (!EMAIL || !PASSHASH) return res.status(200).json({ ok: false, error: 'Faltan credenciales FORM123_EMAIL / FORM123_PASSHASH' });
    // Auth: secreto del cron (Vercel manda Authorization: Bearer <CRON_SECRET>),
    // ?key=<secreto>, o una sesión de staff de Operaciones (botón manual en la app).
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const key = (req.query && req.query.key) || bearer;
    let autorizado = !!SECRET && key === SECRET;
    if (!autorizado && bearer) {
      try {
        const ur = await fetch(`${SURL}/auth/v1/user`, { headers: { Authorization: `Bearer ${bearer}`, apikey: SKEY } });
        if (ur.ok) {
          const u = await ur.json();
          const rows = await sbGet(`usuarios?id=eq.${u.id}&select=rol`);
          if (['director', 'mesa_control', 'gerente_operaciones', 'administracion'].includes(rows[0]?.rol)) autorizado = true;
        }
      } catch (_) {}
    }
    if (!autorizado) return res.status(401).json({ ok: false, error: 'No autorizado' });

    // 1) Último entry importado + su fecha, para arrancar incremental
    const ult = await sbGet('servicios_historicos?select=id_entrada_form,fecha_realizado,fecha_registro&id_entrada_form=not.is.null&order=id_entrada_form.desc&limit=1');
    const lastEntry = ult[0]?.id_entrada_form || 0;
    let desde = (req.query && req.query.desde) || null;
    if (!desde) {
      const base = ult[0]?.fecha_realizado || (ult[0]?.fecha_registro ? String(ult[0].fecha_registro).slice(0, 10) : null) || '2026-08-25';
      const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() - 10);
      desde = d.toISOString().slice(0, 10);
    }
    const maxPaginas = Math.min(parseInt((req.query && req.query.max) || '30', 10) || 30, 100);

    // 2) Login 123FormBuilder v2 → JWT
    const tr = await fetch(`${API}/token?email=${encodeURIComponent(EMAIL)}&passhash=${encodeURIComponent(PASSHASH)}`, { method: 'POST' });
    const tj = await tr.json().catch(() => ({}));
    const JWT = tj.token;
    if (!JWT) return res.status(200).json({ ok: false, error: 'Login 123FormBuilder falló: ' + JSON.stringify(tj).slice(0, 200) });

    // 3) Paginar submissions desde 'desde', quedarnos con entry_id > lastEntry
    let page = 1, revisados = 0, importados = 0, ultimoEntry = lastEntry, seguir = true;
    const nuevos = [];
    while (seguir && page <= maxPaginas) {
      const url = `${API}/forms/${FORM_ID}/submissions?JWT=${encodeURIComponent(JWT)}&start_date=${desde}&per_page=1000&page=${page}`;
      const sr = await fetch(url);
      if (!sr.ok) { if (page === 1) return res.status(200).json({ ok: false, error: `Submissions ${sr.status}: ${(await sr.text()).slice(0, 200)}` }); break; }
      const sj = await sr.json();
      const data = sj.data || [];
      revisados += data.length;
      for (const sub of data) {
        if (sub.deleted) continue;
        if (typeof sub.entry_id === 'number' && sub.entry_id > lastEntry) {
          nuevos.push(aFila(sub));
          if (sub.entry_id > ultimoEntry) ultimoEntry = sub.entry_id;
        }
      }
      const pag = sj.meta && sj.meta.pagination;
      seguir = pag && pag.current_page < pag.total_pages && data.length > 0;
      page++;
    }

    // 4) Insertar en lotes de 200
    for (let i = 0; i < nuevos.length; i += 200) {
      const lote = nuevos.slice(i, i + 200);
      if (lote.length) { await sbInsert(lote); importados += lote.length; }
    }

    return res.status(200).json({ ok: true, importados, revisados, ultimo_entry_antes: lastEntry, ultimo_entry_ahora: ultimoEntry, desde });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
