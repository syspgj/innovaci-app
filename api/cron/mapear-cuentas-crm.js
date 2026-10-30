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

async function sbInsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
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
      sbGet(
        'stg_cuentas_crm_raw?select=account_no,accountname,phone,email1,website,rating,description,bill_street,bill_city,bill_state,bill_code,createdtime'
      ),
      sbGet('clientes_cartera?select=num_cliente&num_cliente=not.is.null'),
    ]);
    const existentesSet = new Set((existentes || []).map((c) => c.num_cliente));
    const nuevas = (crm || []).filter((c) => c.account_no && c.accountname && !existentesSet.has(c.account_no));

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
      origen: 'crm_auto',
      notas: `Dada de alta automáticamente desde CRM (Vtiger) el ${hoy} — completar RFC, vendedor asignado y demás datos a mano.${c.description ? '\n\nDescripción en CRM: ' + c.description : ''}`,
    }));

    // Inserta por lotes de 100 para no mandar un body gigante de una vez.
    for (let i = 0; i < rows.length; i += 100) {
      await sbInsert('clientes_cartera', rows.slice(i, i + 100));
    }

    return res.status(200).json({ ok: true, revisadas: (crm || []).length, creadas: rows.length, cuentas: rows.map((r) => r.num_cliente) });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String((err && err.message) || err) });
  }
}
