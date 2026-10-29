// api/crm-describir-leads.js
//
// Jp, 2026-10-29 — diagnóstico de un solo uso, mismo patrón que
// api/crm-describir-proyectos.js (ya usado antes para Proyectos y
// Oportunidades). Lo necesitamos para resolver el bug real encontrado en
// la auditoría general de hoy: api/crm-crear-prospecto.js lleva desde el
// 17 de octubre fallando SIEMPRE que intenta crear un Lead nuevo, con
// "MANDATORY_FIELDS_MISSING: cf_958 does not have a value" — un campo
// personalizado del módulo Leads que el código nunca manda. 2,928
// prospectos se quedaron sin llegar al CRM por esto.
//
// Este endpoint solo CONSULTA (describe) el módulo Leads en vivo — no crea
// ni modifica nada — para ver la etiqueta real de cf_958 (y de paso
// confirmar si hay algún otro campo obligatorio nuevo que tampoco se esté
// mandando, como pasó con cf_1180 en Cuentas esta misma semana).
//
// Cómo se usa:
//   1. Coloca este archivo en  api/crm-describir-leads.js  dentro del repo.
//   2. No requiere variables de entorno nuevas — reutiliza VTIGER_BASE_URL,
//      VTIGER_USER, VTIGER_ACCESS_KEY y SYNC_SECRET, ya configuradas.
//   3. No lleva entrada en vercel.json (no es un cron, se llama manual).
//   4. Súbelo, espera a que Vercel despliegue, y ábrelo en el navegador:
//      https://os.innovaci.com.mx/api/crm-describir-leads?secret=TU_SYNC_SECRET
//   5. Copia/pega la respuesta completa de vuelta en el chat — con eso
//      armamos el fix correcto (quitarle "obligatorio" en Vtiger Studio, o
//      mandarle un valor por default desde el código, según lo que
//      convenga más).
//   6. Una vez que ya tengamos esto, este archivo se puede volver a borrar
//      del repo (ya cumplió su función), igual que las veces anteriores.

const VTIGER_BASE_URL = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SYNC_SECRET = process.env.SYNC_SECRET;

async function vtigerLogin() {
  const crypto = await import('node:crypto');
  const challengeUrl = `${VTIGER_BASE_URL}?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`;
  const challengeRes = await fetch(challengeUrl);
  const challengeJson = await challengeRes.json();
  if (!challengeJson.success) {
    throw new Error('getchallenge falló: ' + JSON.stringify(challengeJson));
  }
  const token = challengeJson.result.token;
  const accessKeyHash = crypto.createHash('md5').update(token + VTIGER_ACCESS_KEY).digest('hex');
  const loginBody = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: accessKeyHash });
  const loginRes = await fetch(VTIGER_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginBody,
  });
  const loginJson = await loginRes.json();
  if (!loginJson.success) {
    throw new Error('login falló: ' + JSON.stringify(loginJson));
  }
  return loginJson.result.sessionName;
}

export default async function handler(req, res) {
  const secret = req.query?.secret || req.headers['x-sync-secret'];
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const sessionName = await vtigerLogin();

    const describeUrl = `${VTIGER_BASE_URL}?operation=describe&sessionName=${encodeURIComponent(sessionName)}&elementType=Leads`;
    const describeJson = await fetch(describeUrl).then((r) => r.json());
    if (!describeJson.success) {
      return res.status(500).json({ ok: false, error: 'describe falló: ' + JSON.stringify(describeJson) });
    }

    const campos = describeJson.result.fields || [];
    const obligatorios = campos.filter((f) => f.mandatory);

    // Igual traemos 3 Leads reales de ejemplo, para ver si cf_958 ya tiene
    // valor en Leads viejos (pistas de qué se espera ahí) o siempre está
    // vacío también en los que sí se lograron crear hace tiempo.
    let ejemplos = [];
    try {
      const query = `select * from Leads limit 3;`;
      const queryUrl = `${VTIGER_BASE_URL}?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(query)}`;
      const queryJson = await fetch(queryUrl).then((r) => r.json());
      if (queryJson.success) ejemplos = queryJson.result;
    } catch (e) {
      ejemplos = [{ error: String(e?.message || e) }];
    }

    return res.status(200).json({
      ok: true,
      campos_obligatorios: obligatorios.map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type?.name,
        picklistValues: f.type?.picklistValues || null,
      })),
      cf_958: campos.find((f) => f.name === 'cf_958') || null,
      total_campos: campos.length,
      ejemplos_reales: ejemplos,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
