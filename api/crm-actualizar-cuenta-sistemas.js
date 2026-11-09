// api/crm-actualizar-cuenta-sistemas.js
//
// Jp, 2026-11-09 — "cargar los licenciamientos (sistemas que el cliente compró) a su cuenta y que se
// replique en el CRM en la parte de sistemas". Escribe en la Cuenta del CRM (Vtiger, módulo Accounts)
// los campos de "Sistemas" de la cuenta ligada: versión/licencia y usuarios de SAE / COI / NOI / FACTURe.
//
// Se llama desde index.html (🧩 Cargar licenciamientos, Suscripciones) justo después de guardar en
// clientes_cartera_sistemas. Nunca por cron.
//
// Entrada (POST, con el token de sesión de Supabase en Authorization):
//   { cliente_cartera_id, sistemas: [ { sistema:'COI', version_licencia:'v11.0 Compra', usuarios:'4 USU' } ] }
//   — solo se escriben los campos que vengan (no vacíos). La app es quien decide qué se manda.
//
// Campos del CRM (cf_), tomados de vw_cuentas_crm_mapeado:
//   SAE: cf_924 (sistema/versión) · cf_926 (usuarios)
//   COI: cf_928 · cf_930
//   NOI: cf_932 · cf_934
//   FACTURE: cf_936 · cf_938
//   BANCO/CAJA/PROD/ADM y Siigo: todavía no soportados aquí (se avisa, no se inventa el campo).
//
// El CRM valida las listas: "versión" debe existir en el picklist (ej. "v10.0 Compra"). Si Vtiger
// rechaza el valor, se regresa su mensaje para que la app lo muestre; no se reintenta con otro valor.
//
// Si la cuenta no existe en el CRM (SIN-xx, ALT-xx sin alta en CRM) regresa {ok:true, skipped:true, razon}.

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CAMPOS = {
  SAE: { version: 'cf_924', usuarios: 'cf_926' },
  COI: { version: 'cf_928', usuarios: 'cf_930' },
  NOI: { version: 'cf_932', usuarios: 'cf_934' },
  FACTURE: { version: 'cf_936', usuarios: 'cf_938' },
};

async function validarUsuarioSupabase(accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return u && u.id ? u : null;
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function vtigerLogin() {
  const ch = await fetch(`${VTIGER_BASE}/webservice.php?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`).then((r) => r.json());
  if (!ch.success) throw new Error('getchallenge falló: ' + JSON.stringify(ch));
  const accessKey = crypto.createHash('md5').update(ch.result.token + VTIGER_ACCESS_KEY).digest('hex');
  const login = await fetch(`${VTIGER_BASE}/webservice.php`, {
    method: 'POST',
    body: new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey }),
  }).then((r) => r.json());
  if (!login.success) throw new Error('login falló: ' + JSON.stringify(login));
  return login.result.sessionName;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no soportado' });
  const auth = req.headers['authorization'] || '';
  const user = await validarUsuarioSupabase(auth.replace(/^Bearer\s+/i, ''));
  if (!user) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

  try {
    const { cliente_cartera_id, sistemas } = req.body || {};
    if (!cliente_cartera_id || !Array.isArray(sistemas) || !sistemas.length) {
      return res.status(400).json({ ok: false, error: 'Faltan cliente_cartera_id o sistemas' });
    }
    const cli = (await sbGet(`clientes_cartera?id=eq.${encodeURIComponent(cliente_cartera_id)}&select=id,razon_social,num_cliente`))[0];
    if (!cli) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });
    if (!/^ACC\d+$/i.test(cli.num_cliente || '')) {
      return res.json({ ok: true, skipped: true, razon: `La cuenta (${cli.num_cliente || 'sin folio'}) no existe en el CRM todavía.` });
    }
    const raw = (await sbGet(`stg_cuentas_crm_raw?account_no=eq.${encodeURIComponent(cli.num_cliente)}&select=crm_record_id`))[0];
    const crmId = raw && raw.crm_record_id;
    if (!crmId) return res.json({ ok: true, skipped: true, razon: `No encontré ${cli.num_cliente} en el espejo del CRM.` });

    const cambios = {};
    const noSoportados = [];
    for (const s of sistemas) {
      const key = String(s.sistema || '').toUpperCase();
      const campos = CAMPOS[key];
      if (!campos) { noSoportados.push(key); continue; }
      if (s.version_licencia) cambios[campos.version] = String(s.version_licencia);
      if (s.usuarios) cambios[campos.usuarios] = String(s.usuarios);
    }
    if (!Object.keys(cambios).length) {
      return res.json({ ok: true, skipped: true, razon: 'Sin campos soportados para enviar', noSoportados });
    }

    const sessionName = await vtigerLogin();
    const rec = await fetch(`${VTIGER_BASE}/webservice.php?operation=retrieve&sessionName=${encodeURIComponent(sessionName)}&id=${encodeURIComponent(crmId)}`).then((r) => r.json());
    if (!rec.success) throw new Error('retrieve falló: ' + JSON.stringify(rec));
    const element = { ...rec.result, ...cambios };
    const upd = await fetch(`${VTIGER_BASE}/webservice.php`, {
      method: 'POST',
      body: new URLSearchParams({ operation: 'update', sessionName, element: JSON.stringify(element) }),
    }).then((r) => r.json());
    if (!upd.success) {
      return res.status(200).json({ ok: false, error: 'El CRM rechazó el cambio: ' + ((upd.error && upd.error.message) || JSON.stringify(upd)), enviado: cambios });
    }
    return res.json({ ok: true, cuenta: cli.num_cliente, enviado: cambios, noSoportados });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
