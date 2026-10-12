// api/crm-describir-oportunidades.js
//
// Diagnóstico de un solo uso — igual que el que se usó para encontrar
// potential_no (folio bonito). Esta vez es para encontrar el nombre interno
// (API name, tipo "cf_1081") del campo personalizado "Tipo de Servicio" que
// Jp acaba de dar de alta en Vtiger (Potentials), para poder enviarlo desde
// la app al crear/actualizar Oportunidades (Jp, 2026-10-12).
//
// Cómo se usa:
//   1. Coloca este archivo en  api/crm-describir-oportunidades.js  dentro
//      del repo (ya existió antes con este mismo nombre y se borró porque
//      ya había cumplido su función — esta es una nueva corrida para un
//      campo nuevo).
//   2. No requiere variables de entorno nuevas — reutiliza VTIGER_BASE_URL,
//      VTIGER_USER, VTIGER_ACCESS_KEY y SYNC_SECRET, ya configuradas.
//   3. No lleva entrada en vercel.json (no es un cron, se llama manual).
//   4. Súbelo, espera a que Vercel despliegue, y ábrelo en el navegador:
//      https://os.innovaci.com.mx/api/crm-describir-oportunidades?secret=TU_SYNC_SECRET
//   5. En la respuesta busca el bloque "candidatos_tipo_servicio" — ahí debe
//      aparecer el campo con label "Tipo de Servicio" y su nombre interno.
//      Si no aparece ahí, revisa el bloque completo "todos_los_campos".
//   6. Una vez que tengamos el nombre, este archivo ya cumplió su función y
//      se puede volver a borrar del repo (como la vez pasada).

const VTIGER_BASE_URL = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SYNC_SECRET = process.env.SYNC_SECRET;

async function vtigerLogin() {
  const crypto = await import('node:crypto');
  const challengeUrl = `${VTIGER_BASE_URL}/webservice.php?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`;
  const challengeRes = await fetch(challengeUrl);
  const challengeJson = await challengeRes.json();
  if (!challengeJson.success) {
    throw new Error('getchallenge falló: ' + JSON.stringify(challengeJson));
  }
  const token = challengeJson.result.token;
  const accessKeyHash = crypto.createHash('md5').update(token + VTIGER_ACCESS_KEY).digest('hex');
  const loginBody = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: accessKeyHash });
  const loginRes = await fetch(`${VTIGER_BASE_URL}/webservice.php`, {
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
    const describeUrl = `${VTIGER_BASE_URL}/webservice.php?operation=describe&sessionName=${encodeURIComponent(sessionName)}&elementType=Potentials`;
    const describeRes = await fetch(describeUrl);
    const describeJson = await describeRes.json();
    if (!describeJson.success) {
      return res.status(500).json({ ok: false, error: 'describe falló: ' + JSON.stringify(describeJson) });
    }

    const campos = describeJson.result.fields || [];
    const candidatos = campos.filter((f) =>
      /servicio/i.test(f.label || '') || /servicio/i.test(f.name || '')
    );

    return res.status(200).json({
      ok: true,
      candidatos_tipo_servicio: candidatos.map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type?.name,
        picklistValues: f.type?.picklistValues || null,
      })),
      todos_los_campos: campos.map((f) => ({ name: f.name, label: f.label })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
