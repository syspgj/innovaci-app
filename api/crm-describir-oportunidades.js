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
    const interes = ['cf_970','cf_972','cf_974','cf_980','cf_982','cf_984','cf_1016','cf_1100','cf_1128','cf_1130','cf_1132','cf_1176','contact_id','nextstep','opportunity_type','leadsource','description'];
    const esc = (t) => String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const fila = (f) => `<tr style="${interes.includes(f.name)?'background:#fff3cd;font-weight:600':''}"><td>${esc(f.name)}</td><td>${esc(f.label)}</td><td>${esc(f.type?.name)}</td><td>${f.mandatory?'SÍ':''}</td><td>${esc((f.type?.picklistValues||[]).map(p=>p.value).join(' | '))}</td></tr>`;
    const orden = [...campos].sort((a,b)=>(interes.includes(b.name)?1:0)-(interes.includes(a.name)?1:0));
    const html = `<!doctype html><meta charset="utf-8"><title>Campos de Oportunidades</title><body style="font-family:Arial;font-size:13px;padding:16px"><h2>Campos de Oportunidades (Potentials) en el CRM</h2><p>Los amarillos son los que estamos revisando.</p><table border="1" cellpadding="5" style="border-collapse:collapse"><tr><th>Código</th><th>Etiqueta en el CRM</th><th>Tipo</th><th>Obligatorio</th><th>Opciones</th></tr>${orden.map(fila).join('')}</table></body>`;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
