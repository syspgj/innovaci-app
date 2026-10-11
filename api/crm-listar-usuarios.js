// api/crm-listar-usuarios.js
//
// Script de UNA SOLA VEZ (no es parte de Fase 4 en producción) — solo para
// sacar la lista de usuarios de Vtiger con su id interno, y así poder
// ligar cada vendedor de la app a su usuario real del CRM antes de
// construir la creación automática de Oportunidades (Fase 4).
//
// Cómo se usa:
//   1. Coloca este archivo en  api/crm-listar-usuarios.js  dentro del
//      repo (junto a los demás, en la carpeta api/ — NO en api/cron/).
//   2. No requiere variables de entorno nuevas — reutiliza
//      VTIGER_BASE_URL, VTIGER_USER, VTIGER_ACCESS_KEY, SYNC_SECRET
//      (las mismas que ya están configuradas).
//   3. Sube el archivo, espera a que despliegue, y visita en el navegador:
//        https://os.innovaci.com.mx/api/crm-listar-usuarios?secret=TU_SYNC_SECRET
//      (usa el mismo SYNC_SECRET que ya tienes configurado en Vercel).
//   4. Te va a regresar un JSON con todos los usuarios de Vtiger: su id
//      interno (ej. "19x5"), nombre y si están activos. Cópiame ese
//      resultado completo (o una captura) y con eso armo la liga
//      vendedor-de-la-app ↔ usuario-de-Vtiger.
//   5. Cuando ya no lo necesites, puedes borrar este archivo del repo —
//      no es parte del flujo normal de la app.

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
    const rows = await vtigerQuery(
      sessionName,
      "select id,user_name,first_name,last_name,status,is_admin,roleid from Users;"
    );
    const usuarios = (rows || []).map((u) => ({
      id: u.id,
      user_name: u.user_name,
      nombre: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      status: u.status,
      is_admin: u.is_admin,
    }));
    return res.status(200).json({ ok: true, total: usuarios.length, usuarios });
  } catch (err) {
    console.error('crm-listar-usuarios failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
