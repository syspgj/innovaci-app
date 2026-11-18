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
//   campos: id, firstName, lastName, phone, email, language, profilePic,
//   locale, countryCode, status, isBlocked, custom_fields, tags, assignee,
//   lifecycle, created_at
//
// ── Por qué el cruce se hace en memoria y no con consultas por contacto ──
// Auditoría del 2026-11-18, antes de la primera corrida:
//   1. Los teléfonos de la app NO están normalizados: de 5,244 prospectos,
//      1,715 traen espacios o guiones, 2,195 traen lada 52 pegada y 1,182
//      están limpios. Buscar con "termina en estos 10 dígitos" fallaba en
//      los 1,715 con separadores, o sea que habría duplicado a un tercio de
//      la base. Ahora se normaliza en memoria (solo dígitos, últimos 10),
//      que es lo único que cruza bien los tres formatos.
//   2. Consultar por contacto eran ~4 llamadas × 99 contactos × 8 páginas:
//      miles de peticiones en serie, imposible dentro del tiempo máximo de
//      una función. Ahora se cargan los índices UNA vez por corrida y las
//      escrituras van en lote.
//
// El barrido es continuable: se guarda el cursor en respond_sync_estado y la
// corrida siguiente sigue donde se quedó.

export const config = { maxDuration: 60 };

const RESPOND_TOKEN = process.env.RESPOND_API_TOKEN;
const RESPOND_BASE = process.env.RESPOND_API_BASE || 'https://api.respond.io/v2';
const TZ = process.env.RESPOND_TIMEZONE || 'America/Mexico_City';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAGINAS_POR_CORRIDA = Number(process.env.RESPOND_PAGINAS_POR_CORRIDA || 6);
const POR_PAGINA = 99;            // máximo que acepta la API
const MS_MAX = Number(process.env.RESPOND_MS_MAX || 45000); // margen antes del corte de Vercel

// Estatus válido en prospectos (hay CHECK en la tabla: 'Nuevo', 'Contactado',
// 'No contestó', 'En WhatsApp', 'Interesado', 'Canalizado a ventas',
// 'No interesado', 'Perdido'). Se puede cambiar por variable de entorno.
const ESTATUS_NUEVO = process.env.RESPOND_ESTATUS_NUEVO || 'Nuevo';

// ── Supabase (REST) ──────────────────────────────────────────────────────
const cab = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: cab });
  if (!res.ok) throw new Error(`GET ${path} falló (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
// Trae una tabla completa en páginas de 1000.
async function sbTodo(tabla, select) {
  let out = [];
  for (let p = 0; p < 40; p++) {
    const lote = await sbGet(`${tabla}?select=${select}&limit=1000&offset=${p * 1000}`);
    out = out.concat(lote);
    if (lote.length < 1000) break;
  }
  return out;
}
async function sbPost(table, fila, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...cab, Prefer: prefer || 'return=representation' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) throw new Error(`POST ${table} falló (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
async function sbPatch(pathConFiltro, cambios) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathConFiltro}`, {
    method: 'PATCH',
    headers: { ...cab, Prefer: 'return=minimal' },
    body: JSON.stringify(cambios),
  });
  if (!res.ok) throw new Error(`PATCH ${pathConFiltro} falló (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

// ── Teléfonos y textos ───────────────────────────────────────────────────
// Jp, 2026-11-17: "por teléfono ignorando el +52". Los últimos 10 dígitos son
// lo único que identifica un número mexicano sin importar cómo esté escrito.
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

// ── Lo que trae Respond y cómo se traduce a la app (Jp, 2026-11-18) ──────
// Respond ya sabe a quién le toca el contacto, en qué etapa va y con qué
// etiquetas quedó. Antes todo eso caía como texto en las notas y no servía
// para filtrar; ahora se convierte en campos de verdad.

// Nombres comparables: sin acentos, sin mayúsculas, sin dobles espacios.
function nombreComparable(t) {
  return String(t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Las cuentas genéricas de Respond no son personas: no asignan a nadie.
const ASIGNADOS_GENERICOS = new Set(['venta innovaci', 'grupo innovaci', 'innovaci']);

// Etiquetas de importaciones automáticas (imported_20260604_070618): basura.
function limpiarEtiquetas(tags) {
  const ls = (Array.isArray(tags) ? tags : [])
    .map((t) => String(t || '').trim())
    .filter((t) => t && !/^imported[_-]/i.test(t));
  return ls.length ? [...new Set(ls)] : null;
}

// Etapa de Respond -> estatus del prospecto. Lo que no esté aquí entra como
// 'Nuevo'. Los valores permitidos los fija un CHECK en la tabla prospectos.
const ETAPA_A_ESTATUS = {
  'no respondio': 'No contestó',
  'prospecto calificado': 'Interesado',
  'interesado': 'Interesado',
};
// Etapas que dicen que ya es cliente: esos no se dan de alta como prospecto.
const ETAPAS_DE_CLIENTE = new Set(['cliente 24/7', 'cliente sxe o poliza', 'cliente']);
function esClienteEnRespond(lifecycle) {
  return ETAPAS_DE_CLIENTE.has(nombreComparable(lifecycle));
}
function estatusDesdeEtapa(lifecycle) {
  return ETAPA_A_ESTATUS[nombreComparable(lifecycle)] || ESTATUS_NUEVO;
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
    const err = new Error(`Respond.io respondió ${res.status}: ${(cuerpo && cuerpo.message) || String(cuerpo).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return { items: Array.isArray(cuerpo?.items) ? cuerpo.items : [], pagination: cuerpo?.pagination || null };
}

function nombreDe(c) {
  return [limpiarTexto(c.firstName), limpiarTexto(c.lastName)].filter(Boolean).join(' ') || null;
}
function asignadoDe(c) {
  const a = c.assignee;
  if (!a) return { nombre: null, email: null };
  if (typeof a === 'string') return { nombre: a, email: null };
  return {
    nombre: [limpiarTexto(a.firstName), limpiarTexto(a.lastName)].filter(Boolean).join(' ') || null,
    email: correoNorm(a.email),
  };
}
function creadoEnDe(c) {
  const v = c.created_at ?? c.created ?? c.createdAt;
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return new Date(n > 1e12 ? n : n * 1000).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function filaEspejo(c) {
  const tel = limpiarTexto(c.phone);
  const asig = asignadoDe(c);
  return {
    respond_id: c.id,
    nombre: nombreDe(c),
    telefono: tel,
    telefono_norm: ultimos10(tel),
    email: correoNorm(c.email),
    lifecycle: limpiarTexto(c.lifecycle),
    estatus_conversacion: limpiarTexto(c.status),
    asignado_nombre: asig.nombre,
    asignado_email: asig.email,
    etiquetas: Array.isArray(c.tags) ? c.tags : null,
    campos_personalizados: c.custom_fields ?? c.customFields ?? null,
    creado_en_respond: creadoEnDe(c),
    sincronizado_at: new Date().toISOString(),
    // PostgREST exige que TODAS las filas de un insert en lote tengan
    // exactamente las mismas claves ("All object keys must match"). Antes
    // estas tres se agregaban solo en algunas ramas y el lote completo se
    // rechazaba con 400: los prospectos sí se creaban, pero el espejo quedaba
    // vacío. Ahora van siempre, en null cuando no aplican.
    prospecto_id: null,
    cliente_cartera_id: null,
    resultado: null,
  };
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
  const simulacion = !!(req.query && req.query.simulacion === '1');
  const cuenta = {
    paginas: 0, contactos: 0, prospecto_creado: 0, ligado_prospecto: 0,
    ligado_cartera: 0, sin_datos_para_ligar: 0, ya_ligado: 0,
    ya_es_cliente_en_respond: 0, asignados_a_vendedor: 0,
  };
  const errores = [];

  try {
    let estado = null;
    try { estado = (await sbGet('respond_sync_estado?id=eq.1&select=*'))[0] || null; } catch (_) {}
    const reiniciar = !!(req.query && req.query.reiniciar === '1');
    let cursor = reiniciar ? null : (estado?.ultimo_cursor || null);

    // ── Índices en memoria (una sola vez por corrida) ──
    const [prospectos, cartera, espejo, usuarios] = await Promise.all([
      sbTodo('prospectos', 'id,telefono,email,cliente_cartera_id,respond_contacto_id,vendedor_asignado,etiquetas'),
      sbTodo('clientes_cartera', 'id,telefono,telefono2,telefono_whatsapp,correo_principal'),
      sbTodo('respond_contactos', 'respond_id,prospecto_id,cliente_cartera_id,resultado'),
      sbTodo('usuarios', 'id,nombre,email,rol,activo'),
    ]);
    // A qué vendedor de la app corresponde cada nombre de Respond.
    const vendPorNombre = new Map(), vendPorMail = new Map();
    usuarios.filter((u) => u.rol === 'vendedor' && u.activo !== false).forEach((u) => {
      const n = nombreComparable(u.nombre); if (n) vendPorNombre.set(n, u.id);
      const e = correoNorm(u.email); if (e) vendPorMail.set(e, u.id);
    });
    const vendedorDeRespond = (f) => {
      const e = correoNorm(f.asignado_email);
      if (e && vendPorMail.has(e)) return vendPorMail.get(e);
      const n = nombreComparable(f.asignado_nombre);
      if (!n || ASIGNADOS_GENERICOS.has(n)) return null;
      return vendPorNombre.get(n) || null;
    };
    const proPorTel = new Map(), proPorMail = new Map();
    prospectos.forEach((p) => {
      const t = ultimos10(p.telefono); if (t && !proPorTel.has(t)) proPorTel.set(t, p);
      const e = correoNorm(p.email); if (e && !proPorMail.has(e)) proPorMail.set(e, p);
    });
    const carPorTel = new Map(), carPorMail = new Map();
    cartera.forEach((c) => {
      [c.telefono, c.telefono2, c.telefono_whatsapp].forEach((v) => {
        const t = ultimos10(v); if (t && !carPorTel.has(t)) carPorTel.set(t, c);
      });
      const e = correoNorm(c.correo_principal); if (e && !carPorMail.has(e)) carPorMail.set(e, c);
    });
    const yaEspejo = new Map(espejo.map((r) => [r.respond_id, r]));

    let terminado = false;
    let cortadoPorTiempo = false;
    let idsPaginaPrevia = '';

    for (let p = 0; p < PAGINAS_POR_CORRIDA; p++) {
      if (Date.now() - t0 > MS_MAX) { cortadoPorTiempo = true; break; }

      let pagina;
      try {
        pagina = await respondListar(cursor);
      } catch (e) {
        if (e.status === 429) { errores.push('Respond.io limitó las peticiones; se continúa en la corrida siguiente.'); break; }
        throw e;
      }
      const items = pagina.items;
      if (!items.length) { terminado = true; break; }

      // Guarda contra un cursor que no avanza: si la API devolviera la misma
      // página, el barrido se repetiría para siempre sin terminar nunca.
      const huella = items.map((c) => c.id).join(',');
      if (huella === idsPaginaPrevia) {
        errores.push('La API devolvió la misma página dos veces (el cursor no avanza). Se detiene el barrido para no repetirlo.');
        terminado = true;
        break;
      }
      idsPaginaPrevia = huella;
      cuenta.paginas++;

      const nuevosProspectos = [];   // {fila, respond_id, telN, mail}
      const parches = [];            // {id, cambios}
      const filasEspejo = [];
      // Dos contactos de Respond pueden ser la misma persona (mismo teléfono o
      // correo) dentro de la MISMA página. Sin esto se daban de alta dos veces,
      // porque el índice solo se actualiza después de escribir.
      const pendientePorTel = new Map(), pendientePorMail = new Map();

      for (const c of items) {
        cuenta.contactos++;
        const fila = filaEspejo(c);
        const telN = fila.telefono_norm;
        const mail = fila.email;

        const previo = yaEspejo.get(c.id);
        if (previo && (previo.prospecto_id || previo.cliente_cartera_id)) {
          fila.prospecto_id = previo.prospecto_id;
          fila.cliente_cartera_id = previo.cliente_cartera_id;
          fila.resultado = previo.resultado;
          filasEspejo.push(fila);
          cuenta.ya_ligado++;
          continue;
        }

        if (!telN && !mail) {
          fila.resultado = 'sin_datos_para_ligar';
          filasEspejo.push(fila);
          cuenta.sin_datos_para_ligar++;
          continue;
        }

        const cta = (telN && carPorTel.get(telN)) || (mail && carPorMail.get(mail)) || null;
        const pro = (telN && proPorTel.get(telN)) || (mail && proPorMail.get(mail)) || null;
        const etiquetas = limpiarEtiquetas(fila.etiquetas);
        const vendedorId = vendedorDeRespond(fila);

        if (pro) {
          const cambios = { respond_contacto_id: c.id, updated_at: new Date().toISOString() };
          if (!pro.telefono && fila.telefono) cambios.telefono = fila.telefono;
          if (!pro.email && mail) cambios.email = mail;
          if (cta && !pro.cliente_cartera_id) cambios.cliente_cartera_id = cta.id;
          // El vendedor y las etiquetas solo se rellenan si en la app están
          // vacíos: lo que alguien ya decidió aquí nunca se pisa.
          if (vendedorId && !pro.vendedor_asignado) cambios.vendedor_asignado = vendedorId;
          if (etiquetas && !(pro.etiquetas && pro.etiquetas.length)) cambios.etiquetas = etiquetas;
          if (fila.lifecycle) cambios.etapa_respond = fila.lifecycle;
          // Solo se escribe si de verdad cambia algo más que la marca de tiempo.
          if (pro.respond_contacto_id !== c.id || Object.keys(cambios).length > 2) {
            parches.push({ id: pro.id, cambios });
          }
          fila.prospecto_id = pro.id;
          fila.cliente_cartera_id = cta ? cta.id : (pro.cliente_cartera_id || null);
          fila.resultado = 'ligado_prospecto';
          filasEspejo.push(fila);
          cuenta.ligado_prospecto++;
          continue;
        }

        if (cta) {
          // Es un cliente que escribe por WhatsApp: se liga a su cuenta y no
          // se crea prospecto (ya es cliente, no prospecto).
          fila.cliente_cartera_id = cta.id;
          fila.resultado = 'ligado_cartera';
          filasEspejo.push(fila);
          cuenta.ligado_cartera++;
          continue;
        }

        // Jp, 2026-11-18: si Respond ya lo tiene marcado como cliente
        // ("Cliente 24/7", "Cliente SxE o Póliza"), no es prospecto. Queda en
        // el espejo; si algún día se cruza con una cuenta, se liga solo.
        if (esClienteEnRespond(fila.lifecycle)) {
          fila.resultado = 'ya_es_cliente_en_respond';
          filasEspejo.push(fila);
          cuenta.ya_es_cliente_en_respond = (cuenta.ya_es_cliente_en_respond || 0) + 1;
          continue;
        }

        // ¿Ya se encoló un alta para esta misma persona en esta página?
        const pend = (telN && pendientePorTel.get(telN)) ?? (mail && pendientePorMail.get(mail));
        if (pend !== undefined && pend !== null && pend !== false) {
          fila.cliente_cartera_id = null;
          fila.resultado = 'ligado_prospecto';
          fila._pendiente = pend;
          filasEspejo.push(fila);
          cuenta.ligado_prospecto++;
          continue;
        }

        // No existe en ningún lado: alta como prospecto.
        const hoy = new Date();
        const asigTxt = fila.asignado_nombre ? 'Atendido en Respond por: ' + fila.asignado_nombre : null;
        nuevosProspectos.push({
          respond_id: c.id,
          telN,
          mail,
          fila: {
            nombre: fila.nombre || fila.telefono || mail || 'Contacto de WhatsApp',
            telefono: fila.telefono,
            email: mail,
            origen: 'respond',
            evento: 'WhatsApp (Respond.io)',
            estatus: estatusDesdeEtapa(fila.lifecycle),
            vendedor_asignado: vendedorId,
            etiquetas,
            etapa_respond: fila.lifecycle || null,
            anio: hoy.getFullYear(),
            mes: hoy.getMonth() + 1,
            fecha_contacto: hoy.toISOString().slice(0, 10),
            respond_contacto_id: c.id,
            notas: [
              fila.lifecycle ? 'Etapa en Respond: ' + fila.lifecycle : null,
              fila.etiquetas && fila.etiquetas.length ? 'Etiquetas: ' + fila.etiquetas.join(', ') : null,
              asigTxt,
            ].filter(Boolean).join(' · ') || null,
          },
        });
        if (vendedorId) cuenta.asignados_a_vendedor++;
        const idx = nuevosProspectos.length - 1;
        if (telN) pendientePorTel.set(telN, idx);
        if (mail) pendientePorMail.set(mail, idx);
        fila.resultado = 'prospecto_creado';
        fila._pendiente = idx;
        filasEspejo.push(fila);
        cuenta.prospecto_creado++;
      }

      if (simulacion) {
        // Modo prueba: cuenta lo que haría y no escribe nada.
        cursor = items[items.length - 1].id;
        if (items.length < POR_PAGINA) terminado = true;
        if (terminado) break;
        await new Promise((ok) => setTimeout(ok, 250));
        continue;
      }

      // ── Escrituras en lote ──
      if (nuevosProspectos.length) {
        try {
          const creados = await sbPost('prospectos', nuevosProspectos.map((x) => x.fila), 'return=representation');
          (creados || []).forEach((row, i) => {
            const ref = nuevosProspectos[i];
            if (!ref) return;
            // Todas las filas que apuntaban a este alta (la original y las
            // repetidas de la misma persona) quedan ligadas al mismo prospecto.
            filasEspejo.forEach((z) => { if (z._pendiente === i) z.prospecto_id = row.id; });
            // El índice se actualiza en caliente para que dos contactos de
            // Respond con el mismo teléfono no generen dos prospectos.
            if (ref.telN) proPorTel.set(ref.telN, { id: row.id, telefono: ref.fila.telefono, email: ref.mail, respond_contacto_id: ref.respond_id });
            if (ref.mail) proPorMail.set(ref.mail, { id: row.id, telefono: ref.fila.telefono, email: ref.mail, respond_contacto_id: ref.respond_id });
          });
        } catch (e) {
          errores.push('alta de prospectos: ' + String(e.message || e).slice(0, 200));
          cuenta.prospecto_creado -= nuevosProspectos.length;
          filasEspejo.forEach((f) => { if (f.resultado === 'prospecto_creado') f.resultado = 'sin_datos_para_ligar'; });
        }
      }

      for (const pa of parches) {
        try { await sbPatch(`prospectos?id=eq.${pa.id}`, pa.cambios); }
        catch (e) { errores.push(`prospecto ${pa.id}: ` + String(e.message || e).slice(0, 150)); }
      }

      filasEspejo.forEach((f) => { delete f._pendiente; });
      if (filasEspejo.length) {
        try { await sbPost('respond_contactos', filasEspejo, 'resolution=merge-duplicates,return=minimal'); }
        catch (e) { errores.push('espejo de contactos: ' + String(e.message || e).slice(0, 200)); }
      }
      filasEspejo.forEach((f) => yaEspejo.set(f.respond_id, f));

      cursor = items[items.length - 1].id;
      if (items.length < POR_PAGINA) { terminado = true; break; }
      await new Promise((ok) => setTimeout(ok, 250));
    }

    const resumen = {
      ok: true,
      simulacion,
      ms: Date.now() - t0,
      barrido: terminado ? 'completo' : (cortadoPorTiempo ? 'parcial (se acabó el tiempo; sigue en la corrida siguiente)' : 'parcial (continúa en la corrida siguiente)'),
      ...cuenta,
      errores: errores.slice(0, 20),
    };

    if (!simulacion) {
      try {
        await sbPatch('respond_sync_estado?id=eq.1', {
          ultimo_cursor: terminado ? null : cursor,
          ultimo_barrido_at: terminado ? new Date().toISOString() : (estado?.ultimo_barrido_at || null),
          modo: terminado ? 'completo' : 'parcial',
          ultimo_resultado: resumen,
          actualizado_at: new Date().toISOString(),
        });
      } catch (e) {
        resumen.errores.push('No se pudo guardar el avance: ' + String(e.message || e));
      }
    }

    return res.status(200).json(resumen);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err), ...cuenta, errores });
  }
}
