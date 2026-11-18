// api/cron/respond-sync-contactos.js
//
// Jp, 2026-11-18 — sincronización de contactos de Respond.io (WhatsApp) hacia
// la app. Decisiones confirmadas con Jp:
//   · Se traen TODOS los contactos.
//   · Cada contacto se busca primero en la app (por teléfono ignorando el +52,
//     o por correo). Si ya existe como prospecto o como cuenta de Cartera, se
//     liga y se completa lo que falte; nunca se duplica. Si no existe, se da
//     de alta como prospecto.
//   · Corre cada hora en horario de oficina. El plan Growth de Respond.io NO
//     incluye webhooks, así que no hay aviso en tiempo real: vamos nosotros a
//     preguntar.
//
// Forma de la API confirmada contra la cuenta real el 2026-11-18:
//   POST https://api.respond.io/v2/contact/list?limit=99&cursorId=<id>
//   cuerpo: {"search":"","filter":{"$and":[]},"timezone":"America/Mexico_City"}
//   respuesta: { items:[...], pagination:{...} }
//   campos del contacto: id, firstName, lastName, phone, email, language,
//   profilePic, locale, countryCode, status, isBlocked, custom_fields, tags,
//   assignee, lifecycle, created_at
//
// El barrido es continuable: se guarda el cursor en respond_sync_estado y la
// corrida siguiente sigue donde se quedó, para no pasarse del tiempo máximo
// de ejecución ni del límite de peticiones por segundo.

const RESPOND_TOKEN = process.env.RESPOND_API_TOKEN;
const RESPOND_BASE = process.env.RESPOND_API_BASE || 'https://api.respond.io/v2';
const TZ = process.env.RESPOND_TIMEZONE || 'America/Mexico_City';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAGINAS_POR_CORRIDA = Number(process.env.RESPOND_PAGINAS_POR_CORRIDA || 8);
const POR_PAGINA = 99; // el máximo documentado es 99

// ── Supabase (REST) ──────────────────────────────────────────────────────
const cab = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: cab });
  if (!res.ok) throw new Error(`GET ${path} falló (${res.status}): ${await res.text()}`);
  return res.json();
}
async function sbPost(table, fila, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...cab, Prefer: prefer || 'return=representation' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) throw new Error(`POST ${table} falló (${res.status}): ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
async function sbPatch(pathConFiltro, cambios) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathConFiltro}`, {
    method: 'PATCH',
    headers: { ...cab, Prefer: 'return=minimal' },
    body: JSON.stringify(cambios),
  });
  if (!res.ok) throw new Error(`PATCH ${pathConFiltro} falló (${res.status}): ${await res.text()}`);
}

// ── Teléfonos ────────────────────────────────────────────────────────────
// Jp, 2026-11-17: "por teléfono ignorando el +52". Se guardan los últimos 10
// dígitos, que es lo que de verdad identifica a un número mexicano, sin
// importar cómo venga escrito (+52, 52, 521, con espacios o guiones).
function ultimos10(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.slice(-10);
}

function limpiarTexto(t) {
  const s = String(t == null ? '' : t).trim();
  return s || null;
}

// ── Respond.io ───────────────────────────────────────────────────────────
async function respondListar(cursorId) {
  const q = new URLSearchParams({ limit: String(POR_PAGINA) });
  if (cursorId) q.set('cursorId', String(cursorId));
  const res = await fetch(`${RESPOND_BASE.replace(/\/+$/, '')}/contact/list?${q}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESPOND_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ search: '', filter: { $and: [] }, timezone: TZ }),
  });
  const texto = await res.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch (_) { cuerpo = texto.slice(0, 300); }
  if (!res.ok) {
    const msg = cuerpo && cuerpo.message ? cuerpo.message : String(cuerpo).slice(0, 200);
    const err = new Error(`Respond.io respondió ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  const items = Array.isArray(cuerpo?.items) ? cuerpo.items : [];
  return { items, pagination: cuerpo?.pagination || null };
}

function nombreDe(c) {
  const n = [limpiarTexto(c.firstName), limpiarTexto(c.lastName)].filter(Boolean).join(' ');
  return n || null;
}
function asignadoDe(c) {
  const a = c.assignee;
  if (!a) return { nombre: null, email: null };
  if (typeof a === 'string') return { nombre: a, email: null };
  return {
    nombre: [limpiarTexto(a.firstName), limpiarTexto(a.lastName)].filter(Boolean).join(' ') || null,
    email: limpiarTexto(a.email),
  };
}
function creadoEnDe(c) {
  const v = c.created_at ?? c.created ?? c.createdAt;
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n * 1000).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Sincronización de un contacto ────────────────────────────────────────
async function procesarContacto(c, ya) {
  const tel = limpiarTexto(c.phone);
  const telN = ultimos10(tel);
  const email = limpiarTexto(c.email) ? String(c.email).trim().toLowerCase() : null;
  const nombre = nombreDe(c);
  const asig = asignadoDe(c);

  const fila = {
    respond_id: c.id,
    nombre,
    telefono: tel,
    telefono_norm: telN,
    email,
    lifecycle: limpiarTexto(c.lifecycle),
    estatus_conversacion: limpiarTexto(c.status),
    asignado_nombre: asig.nombre,
    asignado_email: asig.email,
    etiquetas: Array.isArray(c.tags) ? c.tags : null,
    campos_personalizados: c.custom_fields ?? c.customFields ?? null,
    creado_en_respond: creadoEnDe(c),
    sincronizado_at: new Date().toISOString(),
  };

  // 1) ¿Ya está ligado de antes? Entonces solo se refresca.
  const previo = ya.get(c.id);
  if (previo && (previo.prospecto_id || previo.cliente_cartera_id)) {
    fila.prospecto_id = previo.prospecto_id;
    fila.cliente_cartera_id = previo.cliente_cartera_id;
    fila.resultado = previo.resultado;
    await sbPost('respond_contactos', fila, 'resolution=merge-duplicates,return=minimal');
    return { resultado: 'ya_ligado' };
  }

  // 2) Sin teléfono ni correo no hay forma de cruzarlo ni de llamarle.
  if (!telN && !email) {
    fila.resultado = 'sin_datos_para_ligar';
    await sbPost('respond_contactos', fila, 'resolution=merge-duplicates,return=minimal');
    return { resultado: 'sin_datos_para_ligar' };
  }

  // 3) ¿Existe ya en Cartera de Cuentas? (un cliente, no un prospecto)
  let cartera = null;
  if (telN) {
    const r = await sbGet(`clientes_cartera?select=id,razon_social&or=(telefono.ilike.*${telN},telefono_whatsapp.ilike.*${telN})&limit=1`);
    cartera = r[0] || null;
  }
  if (!cartera && email) {
    const r = await sbGet(`clientes_cartera?select=id,razon_social&correo_principal=ilike.${encodeURIComponent(email)}&limit=1`);
    cartera = r[0] || null;
  }

  // 4) ¿Existe ya como prospecto?
  let prospecto = null;
  if (telN) {
    const r = await sbGet(`prospectos?select=id,nombre,telefono,email,respond_contacto_id&telefono=ilike.*${telN}&limit=1`);
    prospecto = r[0] || null;
  }
  if (!prospecto && email) {
    const r = await sbGet(`prospectos?select=id,nombre,telefono,email,respond_contacto_id&email=ilike.${encodeURIComponent(email)}&limit=1`);
    prospecto = r[0] || null;
  }

  if (prospecto) {
    // Ligar y completar lo que falte, sin pisar lo capturado en la app.
    const parche = { respond_contacto_id: c.id, updated_at: new Date().toISOString() };
    if (!prospecto.telefono && tel) parche.telefono = tel;
    if (!prospecto.email && email) parche.email = email;
    if (cartera && !prospecto.cliente_cartera_id) parche.cliente_cartera_id = cartera.id;
    await sbPatch(`prospectos?id=eq.${prospecto.id}`, parche);
    fila.prospecto_id = prospecto.id;
    fila.cliente_cartera_id = cartera ? cartera.id : null;
    fila.resultado = 'ligado_prospecto';
    await sbPost('respond_contactos', fila, 'resolution=merge-duplicates,return=minimal');
    return { resultado: 'ligado_prospecto' };
  }

  if (cartera) {
    // Es un cliente que escribe por WhatsApp: se deja ligado a su cuenta y no
    // se crea prospecto (ya es cliente, no prospecto).
    fila.cliente_cartera_id = cartera.id;
    fila.resultado = 'ligado_cartera';
    await sbPost('respond_contactos', fila, 'resolution=merge-duplicates,return=minimal');
    return { resultado: 'ligado_cartera' };
  }

  // 5) No existe en ningún lado: alta como prospecto.
  const hoy = new Date();
  const nuevo = await sbPost('prospectos', {
    nombre: nombre || tel || email || 'Contacto de WhatsApp',
    telefono: tel,
    email,
    origen: 'respond',
    evento: 'WhatsApp (Respond.io)',
    estatus: 'nuevo',
    anio: hoy.getFullYear(),
    mes: hoy.getMonth() + 1,
    fecha_contacto: hoy.toISOString().slice(0, 10),
    respond_contacto_id: c.id,
    notas: [
      fila.lifecycle ? 'Etapa en Respond: ' + fila.lifecycle : null,
      fila.etiquetas && fila.etiquetas.length ? 'Etiquetas: ' + fila.etiquetas.join(', ') : null,
      asig.nombre ? 'Atendido en Respond por: ' + asig.nombre : null,
    ].filter(Boolean).join(' · ') || null,
  });
  const idNuevo = Array.isArray(nuevo) ? nuevo[0]?.id : nuevo?.id;
  fila.prospecto_id = idNuevo || null;
  fila.resultado = 'prospecto_creado';
  await sbPost('respond_contactos', fila, 'resolution=merge-duplicates,return=minimal');
  return { resultado: 'prospecto_creado' };
}

// ── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-sync-secret'];
  const claves = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (
    claves.length &&
    !claves.includes(secretHeader) &&
    !claves.some((c) => authHeader === `Bearer ${c}`) &&
    !(req.query && claves.includes(req.query.secret))
  ) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!RESPOND_TOKEN) return res.status(200).json({ ok: false, omitido: 'Falta RESPOND_API_TOKEN en el servidor.' });

  const t0 = Date.now();
  const cuenta = { paginas: 0, contactos: 0, prospecto_creado: 0, ligado_prospecto: 0, ligado_cartera: 0, sin_datos_para_ligar: 0, ya_ligado: 0 };
  const errores = [];

  try {
    // ¿Desde dónde seguimos? Si la corrida anterior terminó el barrido, se
    // empieza de nuevo desde el principio (así se recogen los nuevos).
    let estado = null;
    try { estado = (await sbGet('respond_sync_estado?id=eq.1&select=*'))[0] || null; } catch (_) {}
    const reiniciar = req.query && req.query.reiniciar === '1';
    let cursor = reiniciar ? null : (estado?.ultimo_cursor || null);
    let terminado = false;

    for (let p = 0; p < PAGINAS_POR_CORRIDA; p++) {
      let pagina;
      try {
        pagina = await respondListar(cursor);
      } catch (e) {
        if (e.status === 429) { errores.push('Respond.io limitó las peticiones; se continúa en la corrida siguiente.'); break; }
        throw e;
      }
      cuenta.paginas++;
      const items = pagina.items;
      if (!items.length) { terminado = true; break; }

      // Lo que ya teníamos de estos contactos, en una sola consulta.
      const ids = items.map((c) => c.id).filter((x) => x != null);
      const ya = new Map();
      if (ids.length) {
        try {
          const prev = await sbGet(`respond_contactos?select=respond_id,prospecto_id,cliente_cartera_id,resultado&respond_id=in.(${ids.join(',')})`);
          prev.forEach((r) => ya.set(r.respond_id, r));
        } catch (_) {}
      }

      for (const c of items) {
        try {
          const r = await procesarContacto(c, ya);
          cuenta.contactos++;
          cuenta[r.resultado] = (cuenta[r.resultado] || 0) + 1;
        } catch (e) {
          errores.push(`contacto ${c && c.id}: ${String(e.message || e).slice(0, 180)}`);
        }
      }

      cursor = items[items.length - 1].id;
      if (items.length < POR_PAGINA) { terminado = true; break; }
      // La API limita las peticiones por segundo; se deja respirar.
      await new Promise((ok) => setTimeout(ok, 250));
    }

    const resumen = {
      ok: true,
      ms: Date.now() - t0,
      barrido: terminado ? 'completo' : 'parcial (continúa en la corrida siguiente)',
      ...cuenta,
      errores: errores.slice(0, 20),
    };

    try {
      await sbPatch('respond_sync_estado?id=eq.1', {
        ultimo_cursor: terminado ? null : cursor,
        ultimo_barrido_at: terminado ? new Date().toISOString() : estado?.ultimo_barrido_at || null,
        modo: terminado ? 'completo' : 'parcial',
        ultimo_resultado: resumen,
        actualizado_at: new Date().toISOString(),
      });
    } catch (e) {
      errores.push('No se pudo guardar el avance: ' + String(e.message || e));
    }

    return res.status(200).json(resumen);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err), ...cuenta, errores });
  }
}
