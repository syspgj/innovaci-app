// api/crm-describir-proyectos.js
//
// Jp, 2026-10-14 — arrancamos el punto 4 pendiente ("Proyectos y pólizas en
// la app", que habías dejado como "más adelante"). Primer paso: el módulo
// Projects de Vtiger hoy no tiene NINGÚN reflejo en Supabase — antes de
// construir la tabla de sync y el formulario de alta/edición en la app
// (como ya existe para Oportunidades), necesitamos confirmar en tu
// instalación real de Vtiger:
//   - el nombre interno exacto del módulo (normalmente "Project", singular)
//   - los campos reales que trae (estándar + cualquier campo personalizado
//     que hayan agregado, como pasó con "Tipo de Servicio" en Oportunidades)
//   - los valores reales del picklist de estatus del proyecto
//     (projectstatus), para que el catálogo de la app coincida exacto con
//     el del CRM — mismo cuidado que se tuvo con "Fase de venta"
//
// Diagnóstico de un solo uso, mismo patrón que
// api/crm-describir-oportunidades.js (ya usado antes para encontrar
// "Tipo de Servicio" → cf_1176).
//
// Cómo se usa:
//   1. Coloca este archivo en  api/crm-describir-proyectos.js  dentro del
//      repo.
//   2. No requiere variables de entorno nuevas — reutiliza VTIGER_BASE_URL,
//      VTIGER_USER, VTIGER_ACCESS_KEY y SYNC_SECRET, ya configuradas.
//   3. No lleva entrada en vercel.json (no es un cron, se llama manual).
//   4. Súbelo, espera a que Vercel despliegue, y ábrelo en el navegador:
//      https://os.innovaci.com.mx/api/crm-describir-proyectos?secret=TU_SYNC_SECRET
//   5. Copia/pega la respuesta completa de vuelta aquí en el chat — con eso
//      diseñamos la tabla de sync y los catálogos correctos antes de tocar
//      nada en Supabase.
//   6. Una vez que ya tengamos esto, este archivo se puede volver a borrar
//      del repo (ya cumplió su función), igual que las veces anteriores.

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

    // "Project" es el nombre estándar del módulo en Vtiger (distinto de
    // "Projects" que es el nombre del módulo en plural visible en el menú).
    // Si esta instalación lo tiene renombrado, el describe fallará y lo
    // intentamos también con "Projects" como respaldo.
    let elementType = 'Project';
    let describeJson;
    for (const intento of ['Project', 'Projects']) {
      const describeUrl = `${VTIGER_BASE_URL}/webservice.php?operation=describe&sessionName=${encodeURIComponent(sessionName)}&elementType=${intento}`;
      const describeRes = await fetch(describeUrl);
      const json = await describeRes.json();
      if (json.success) { describeJson = json; elementType = intento; break; }
    }
    if (!describeJson) {
      return res.status(500).json({ ok: false, error: 'describe falló para "Project" y "Projects" — revisa el nombre real del módulo en Configuración > Módulos de Vtiger.' });
    }

    const campos = describeJson.result.fields || [];
    // También traemos 3 proyectos reales de ejemplo (si existen) para ver
    // valores reales ya capturados, no solo la definición del campo.
    let ejemplos = [];
    try {
      const query = `select * from ${elementType} limit 3;`;
      const queryUrl = `${VTIGER_BASE_URL}/webservice.php?operation=query&sessionName=${encodeURIComponent(sessionName)}&query=${encodeURIComponent(query)}`;
      const queryJson = await fetch(queryUrl).then((r) => r.json());
      if (queryJson.success) ejemplos = queryJson.result;
    } catch (e) {
      ejemplos = [{ error: String(e?.message || e) }];
    }

    return res.status(200).json({
      ok: true,
      modulo_real: elementType,
      campos: campos.map((f) => ({
        name: f.name,
        label: f.label,
        mandatory: f.mandatory,
        type: f.type?.name,
        picklistValues: f.type?.picklistValues || null,
      })),
      ejemplos_reales: ejemplos,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
