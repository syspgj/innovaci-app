// api/cron/sync-crm-accounts.js
//
// Sincroniza el módulo "Cuentas" (Accounts) del CRM Vtiger hacia Supabase,
// como espejo crudo en la tabla public.stg_cuentas_crm_raw (ya creada en
// Supabase). Reemplaza el flujo manual de exportar/importar Excel.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/cron/sync-crm-accounts.js  dentro del
//      repo de Innovaci OS (github.com/syspgj/innovaci-app).
//   2. Agrega en Vercel (Project Settings > Environment Variables):
//        VTIGER_BASE_URL   = http://crminn.dynns.com/innova/webservice.php
//        VTIGER_USER       = Analisis
//        VTIGER_ACCESS_KEY = (la Access Key del usuario del CRM; se obtiene
//                             en el CRM en Mis Preferencias del usuario,
//                             NO es la contraseña de login)
//        SUPABASE_URL             = https://ydwouspzneacxfixlmmv.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY = (service_role key del proyecto Supabase,
//                                     en Supabase > Project Settings > API)
//        SYNC_SECRET       = (cualquier cadena larga que tú inventes; protege
//                             el endpoint para que nadie más lo pueda llamar)
//   3. Agrega/edita vercel.json en la raíz del repo con el bloque de "crons"
//      (ver vercel-cron-snippet.json en este mismo archivo entregado).
//   4. Sube los cambios a tu repo como siempre (flujo manual) y Vercel
//      despliega solo.
//   5. Vercel llamará a este endpoint automáticamente según el schedule.
//      También lo puedes llamar tú a mano para probar:
//        curl -H "x-sync-secret: TU_SYNC_SECRET" https://os.innovaci.com.mx/api/cron/sync-crm-accounts
//
// Qué hace:
//   - Login contra la API de Vtiger (webservice.php) con la Access Key.
//   - Pregunta al propio CRM (operation=describe) cuáles son TODOS los
//     campos del módulo Accounts en este momento (así si el equipo agrega
//     un campo nuevo en el CRM más adelante, el script lo sigue trayendo
//     sin que haya que tocar código).
//   - Trae TODAS las cuentas, paginando de 100 en 100.
//   - Hace upsert (insert o update) en stg_cuentas_crm_raw usando account_no
//     como llave — correrlo varias veces no duplica nada.
//
// Importante: esta tabla es un espejo CRUDO (nombres de columna = nombres
// de campo tal cual los tiene el CRM, incluyendo los cf_XXX de campos
// personalizados). El mapeo hacia las columnas "bonitas" de negocio
// (clientes_cartera) es un paso aparte, para no arriesgar el dato crudo
// con una traducción de columnas mal hecha.

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function vtigerLogin() {
  const challengeRes = await fetch(
    `${VTIGER_BASE}?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`
  ).then((r) => r.json());
  if (!challengeRes.success) {
    throw new Error('getchallenge failed: ' + JSON.stringify(challengeRes));
  }
  const token = challengeRes.result.token;
  const hash = crypto.createHash('md5').update(token + VTIGER_ACCESS_KEY).digest('hex');
  const body = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: hash });
  const loginRes = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!loginRes.success) {
    throw new Error('login failed: ' + JSON.stringify(loginRes));
  }
  return loginRes.result.sessionName;
}

async function vtigerDescribeFields(sessionName) {
  const url = `${VTIGER_BASE}?operation=describe&sessionName=${encodeURIComponent(
    sessionName
  )}&elementType=Accounts`;
  const res = await fetch(url).then((r) => r.json());
  if (!res.success) {
    throw new Error('describe failed: ' + JSON.stringify(res));
  }
  // "id" siempre existe de forma implícita en vtiger; nos aseguramos de incluirlo.
  const names = res.result.fields.map((f) => f.name);
  if (!names.includes('id')) names.push('id');
  return names;
}

async function vtigerQuery(sessionName, q) {
  const url = `${VTIGER_BASE}?operation=query&sessionName=${encodeURIComponent(
    sessionName
  )}&query=${encodeURIComponent(q)}`;
  const res = await fetch(url).then((r) => r.json());
  if (!res.success) {
    throw new Error('query failed: ' + JSON.stringify(res) + ' | query=' + q);
  }
  return res.result;
}

async function upsertToSupabase(table, rows, conflictCol) {
  if (rows.length === 0) return;
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCol}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${text}`);
  }
}

export default async function handler(req, res) {
  // Protección simple: sólo responde si trae el secreto correcto (Vercel
  // Cron manda su propio header de autorización interno; este header extra
  // evita que cualquiera en internet pueda disparar el sync a mano).
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-sync-secret'];
  if (
    process.env.SYNC_SECRET &&
    secretHeader !== process.env.SYNC_SECRET &&
    authHeader !== `Bearer ${process.env.SYNC_SECRET}`
  ) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const startedAt = new Date().toISOString();
  try {
    const sessionName = await vtigerLogin();
    const fields = await vtigerDescribeFields(sessionName);
    const fieldSel = fields.join(',');

    const PAGE_SIZE = 100;
    let offset = 0;
    let totalFetched = 0;
    const BATCH = 100; // filas por upsert a Supabase

    while (true) {
      const q = `select ${fieldSel} from Accounts limit ${offset},${PAGE_SIZE};`;
      const page = await vtigerQuery(sessionName, q);
      if (!page || page.length === 0) break;

      const rows = page.map((r) => {
        const row = {};
        for (const f of fields) {
          // "id" de vtiger -> columna crm_record_id en Supabase
          row[f === 'id' ? 'crm_record_id' : f] = r[f] === '' ? null : r[f] ?? null;
        }
        row.synced_at = new Date().toISOString();
        return row;
      });

      for (let i = 0; i < rows.length; i += BATCH) {
        await upsertToSupabase('stg_cuentas_crm_raw', rows.slice(i, i + BATCH), 'account_no');
      }

      totalFetched += page.length;
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return res.status(200).json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalSynced: totalFetched,
    });
  } catch (err) {
    console.error('sync-crm-accounts failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
