// api/crm-describir-oportunidades.js
//
// Script de UNA SOLA VEZ (no es parte del flujo normal en producción) —
// solo para ver TODOS los campos reales del módulo Oportunidades (Potentials)
// en Vtiger, y así encontrar el nombre del campo que trae el folio "bonito"
// (ej. "OP6384") que Jp quiere mostrar en Proyección — hoy solo guardamos el
// id interno de Vtiger (ej. "13x29544"), que no es lo mismo.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/crm-describir-oportunidades.js  dentro
//      del repo (en la carpeta api/, NO en api/cron/).
//   2. No requiere variables de entorno nuevas — reutiliza VTIGER_BASE_URL,
//      VTIGER_USER, VTIGER_ACCESS_KEY, SYNC_SECRET.
//   3. Sube el archivo, espera a que despliegue, y visita en el navegador:
//        https://os.innovaci.com.mx/api/crm-describir-oportunidades?secret=TU_SYNC_SECRET
//   4. Te va a regresar un JSON con dos partes:
//        - "campos": todos los campos que tiene el módulo (nombre interno,
//          etiqueta visible, tipo) — busca ahí algo como "Número",
//          "potential_no", "No. de oportunidad", etc.
//        - "ejemplo": una Oportunidad real completa (la más reciente, con
//          TODOS sus valores) para ver en cuál campo aparece de verdad el
//          folio tipo "OP####" que ves en pantalla.
//   5. Copia el resultado (o una captura de la parte relevante) y con eso
//      Claude ajusta qué campo usar para `oportunidades_crm.crm_folio`.
//   6. Cuando ya no lo necesites, puedes borrar este archivo del repo.

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;

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
  )}&elementType=Potentials`;
  const res = await fetch(url).then((r) => r.json());
  if (!res.success) {
    throw new Error('describe failed: ' + JSON.stringify(res));
  }
  return res.result.fields.map((f) => ({ name: f.name, label: f.label, type: f.type?.name || f.type }));
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

export default async function handler(req, res) {
  const secretHeader = req.headers['x-sync-secret'];
  const secretQuery = req.query?.secret;
  if (
    process.env.SYNC_SECRET &&
    secretHeader !== process.env.SYNC_SECRET &&
    secretQuery !== process.env.SYNC_SECRET
  ) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const sessionName = await vtigerLogin();
    const campos = await vtigerDescribeFields(sessionName);
    const ejemploRows = await vtigerQuery(
      sessionName,
      'select * from Potentials order by createdtime desc limit 1;'
    );
    return res.status(200).json({ ok: true, total_campos: campos.length, campos, ejemplo: ejemploRows?.[0] || null });
  } catch (err) {
    console.error('crm-describir-oportunidades failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
