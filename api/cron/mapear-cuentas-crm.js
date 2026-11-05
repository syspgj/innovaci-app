// api/cron/mapear-cuentas-crm.js
//
// Jp, 2026-10-30 — "se dio de alta una nueva cuenta en CRM... y en la
// aplicación siguen sin aparecer, a pesar de que ya podía sincronizar dos
// veces la información." Causa encontrada: sync-crm-accounts.js SOLO llena
// el espejo crudo stg_cuentas_crm_raw (a propósito, según su propio
// comentario: "el mapeo hacia clientes_cartera es un paso aparte, para no
// arriesgar el dato crudo con una traducción de columnas mal hecha") — pero
// ese "paso aparte" nunca se había construido. Resultado: una cuenta nueva
// creada directo en Vtiger quedaba para siempre en stg_cuentas_crm_raw sin
// jamás aparecer en Cartera de cuentas, sin importar cuántas veces se le
// diera "Sincronizar".
//
// Qué hace este endpoint:
//   - Lee stg_cuentas_crm_raw completo.
//   - Lee los num_cliente que YA existen en clientes_cartera.
//   - Para cada cuenta del CRM cuyo account_no NO está todavía en Cartera,
//     inserta una fila nueva en clientes_cartera con los campos que se
//     pueden mapear con confianza por nombre de columna (razón social,
//     teléfono, correo, sitio web, rating, dirección de facturación).
//
// A propósito NO mapea los campos personalizados cf_924..cf_1174 de
// stg_cuentas_crm_raw (RFC, sistemas Aspel, CFDI, etc.) — esos ids de campo
// no traen su significado de negocio sin antes correr un describe() del
// módulo Accounts y confirmarlo uno por uno (mismo cuidado que ya se tomó
// con "Vendedor" en crm-crear-prospecto.js, cf_958). Mapearlos a ciegas
// arriesgaría llenar la ficha con datos en la columna equivocada. Por eso
// la cuenta se da de alta con lo mínimo seguro y notas explicando que falta
// completarla a mano — igual que cualquier alta manual nueva.
//
// A propósito NUNCA actualiza una cuenta que YA existe en Cartera (solo
// inserta las que faltan) — evita pisar datos que el equipo ya capturó o
// corrigió a mano en la ficha.
//
// POST (sin body) — protegido con SYNC_SECRET (header x-sync-secret o
// Authorization: Bearer <SYNC_SECRET o CRON_SECRET>), mismo patrón que el
// resto de los crons de sync.
//
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

// PostgREST devuelve máximo 1000 filas por consulta. Cartera ya pasa de 1,800 cuentas y el espejo del CRM
// de 1,400: leer sin paginar dejaba fuera cuentas que SÍ existían, el script las creía nuevas y el alta
// fallaba con "duplicate key ... clientes_cartera_num_cliente_key" (caso ACC605, 2026-11-03).
async function sbGetAll(path) {
  const todas = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${desde}-${desde + paso - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}: ${await res.text()}`);
    const lote = await res.json();
    todas.push(...lote);
    if (lote.length < paso) break;
  }
  return todas;
}

async function sbInsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=num_cliente`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      // Si una cuenta ya existe se omite en silencio en vez de tumbar todo el lote.
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table} -> ${res.status}: ${await res.text()}`);
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-sync-secret'];
  const autorizadoPorHeader =
    authHeader === `Bearer ${process.env.SYNC_SECRET}` ||
    (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);
  if (process.env.SYNC_SECRET && secretHeader !== process.env.SYNC_SECRET && !autorizadoPorHeader) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' });
  }

  try {
    const [crm, existentes] = await Promise.all([
      sbGetAll(
        'stg_cuentas_crm_raw?select=account_no,accountname,phone,email1,website,rating,description,bill_street,bill_city,bill_state,bill_code,createdtime,assigned_user_id,cf_964,cf_1062&order=account_no.asc'
      ),
      sbGetAll('clientes_cartera?select=num_cliente&num_cliente=not.is.null&order=num_cliente.asc'),
    ]);
    // Dueño de la cuenta: se resuelve con usuarios.crm_user_id (assigned_user_id del CRM) y, si ese usuario
    // no está ligado, con el nombre del campo Vendedor del CRM (cf_964). Validado contra 1,475 cuentas ya
    // existentes: cf_964 = vendedor_origen (99%), cf_1062 = tipo_cliente_2, assigned_user_id = vendedor_asignado.
    const usuarios = await sbGetAll('usuarios?select=id,nombre,crm_user_id&activo=eq.true');
    const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const porCrm = new Map(usuarios.filter((u) => u.crm_user_id).map((u) => [u.crm_user_id, u.id]));
    const porNombre = new Map(usuarios.map((u) => [norm(u.nombre), u.id]));
    // El CRM a veces trae el nombre incompleto o con otra letra final ("Carolina Crisanto" vs "Carolina Crisantos").
    const buscarPorNombre = (n) => {
      const k = norm(n);
      if (!k) return null;
      if (porNombre.has(k)) return porNombre.get(k);
      const cand = usuarios.filter((u) => norm(u.nombre).startsWith(k) || k.startsWith(norm(u.nombre)));
      return cand.length === 1 ? cand[0].id : null;
    };
    const existentesSet = new Set((existentes || []).map((c) => c.num_cliente));
    const vistas = new Set();
    const nuevas = (crm || []).filter((c) => {
      if (!c.account_no || !c.accountname || existentesSet.has(c.account_no) || vistas.has(c.account_no)) return false;
      // Cuentas de descarte que el equipo deja en el CRM (BASURA, PRUEBA, NO USAR) no se dan de alta en Cartera.
      if (/^\s*(basura|prueba|no usar)/i.test(c.accountname)) return false;
      vistas.add(c.account_no);
      return true;
    });

    const hoy = new Date().toISOString().slice(0, 10);
    const rows = nuevas.map((c) => ({
      num_cliente: c.account_no,
      razon_social: c.accountname,
      telefono: c.phone || null,
      correo_principal: c.email1 || null,
      pagina_web: c.website || null,
      rating: c.rating || null,
      direccion_calle: c.bill_street || null,
      direccion_municipio: c.bill_city || null,
      direccion_estado: c.bill_state || null,
      direccion_cp: c.bill_code || null,
      fecha_creacion_crm: c.createdtime ? String(c.createdtime).slice(0, 10) : null,
      vendedor_asignado: porCrm.get(c.assigned_user_id) || buscarPorNombre(c.cf_964) || null,
      vendedor_origen: c.cf_964 || null,
      tipo_cliente_2: c.cf_1062 || null,
      origen: 'crm_auto',
      notas: `Dada de alta automáticamente desde CRM (Vtiger) el ${hoy} — completar RFC y demás datos a mano.${c.description ? '\n\nDescripción en CRM: ' + c.description : ''}`,
    }));

    // Inserta por lotes de 100 para no mandar un body gigante de una vez.
    for (let i = 0; i < rows.length; i += 100) {
      await sbInsert('clientes_cartera', rows.slice(i, i + 100));
    }

    // Espejo de la jerarquía del CRM (campo "Miembro de" -> cliente_padre_id). Decisiones de Jp 2026-11-05 en
    // crm_jerarquia_decision (principales de pares circulares y cuentas excluidas). Nunca rompe el mapeo si falla.
    let jerarquia = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/aplicar_jerarquia_crm`, {
        method: 'POST',
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      jerarquia = r.ok ? await r.json() : `error ${r.status}`;
    } catch (e) { jerarquia = 'error ' + String((e && e.message) || e); }

    return res.status(200).json({ ok: true, revisadas: (crm || []).length, creadas: rows.length, jerarquia_ligadas: jerarquia, cuentas: rows.map((r) => r.num_cliente) });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String((err && err.message) || err) });
  }
}
