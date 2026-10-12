// api/crm-agregar-comentario.js
//
// Cuando el vendedor completa una actividad de la bitácora de seguimiento en
// Proyección (pipeline_actividades) sobre una negociación ligada a una
// Oportunidad real del CRM, este endpoint deja ese mismo comentario también
// en Vtiger (módulo ModComments, colgado de la Oportunidad) — Jp pidió
// explícitamente que la bitácora viva en los dos lados, no solo de referencia
// en la app (claude/analisis-proyeccion-inteligente.md, 2026-10-12).
//
// Se dispara en el momento, desde index.html (pipeSincronizarComentarioCrm),
// cada vez que se completa una actividad. Es "best-effort": si falla, la
// actividad ya quedó guardada en la app (pipeline_actividades) — este
// endpoint solo intenta reflejarla también en Vtiger, no bloquea nada si no
// se puede.
//
// ⚠️ IMPORTANTE — SIN PROBAR TODAVÍA: a diferencia de los demás endpoints de
// Fase 3/4, este usa el módulo ModComments de Vtiger, que esta sesión no
// pudo probar contra el CRM real (no hay salida de red directa desde aquí
// hacia crminn.dynns.com). Es muy probable que, igual que pasó con
// crm-actualizar-oportunidad.js la primera vez, el primer intento real
// regrese algún error de campo obligatorio o de nombre de módulo — es
// normal, repórtalo con el detalle completo del error y se ajusta.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/crm-agregar-comentario.js  dentro del
//      repo (junto a los demás, en la carpeta api/ — NO en api/cron/).
//   2. No requiere variables de entorno nuevas — reutiliza las mismas que
//      ya están configuradas: VTIGER_BASE_URL, VTIGER_USER,
//      VTIGER_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//   3. No lleva entrada en vercel.json (no es un cron).
//   4. Sube el archivo a tu repo como siempre y Vercel despliega solo.
//
// Qué hace:
//   - Valida que quien llama tiene una sesión válida de Supabase.
//   - Recibe { crm_potentialid, comentario, vendedor_usuario_id }.
//   - Resuelve el usuario de Vtiger del vendedor (usuarios.crm_user_id,
//     igual que Fase 4) para dejar el comentario a nombre de quien
//     corresponde — si no está ligado, cae de respaldo al usuario Analisis.
//   - Login a Vtiger, crea el comentario (operation=create,
//     elementType=ModComments) colgado de la Oportunidad (related_to).

import crypto from 'crypto';

const VTIGER_BASE = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Analisis — usuario de respaldo cuando el vendedor no tiene todavía su
// usuario de Vtiger ligado en usuarios.crm_user_id (mismo que Fase 4).
const VTIGER_USUARIO_RESPALDO = '19x27';

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

async function vtigerCreateComentario(sessionName, element) {
  const body = new URLSearchParams({
    operation: 'create',
    sessionName,
    elementType: 'ModComments',
    element: JSON.stringify(element),
  });
  const res = await fetch(VTIGER_BASE, { method: 'POST', body }).then((r) => r.json());
  if (!res.success) {
    throw new Error('create ModComments failed: ' + JSON.stringify(res));
  }
  return res.result;
}

async function validarUsuarioSupabase(accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user && user.id ? user : null;
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const authHeader = req.headers['authorization'] || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const usuario = await validarUsuarioSupabase(accessToken);
  if (!usuario) {
    return res.status(401).json({ ok: false, error: 'sesión inválida — vuelve a iniciar sesión' });
  }

  const { crm_potentialid, comentario, vendedor_usuario_id } = req.body || {};
  if (!crm_potentialid || !comentario) {
    return res.status(400).json({ ok: false, error: 'faltan datos (crm_potentialid, comentario)' });
  }

  try {
    let assigned_user_id = VTIGER_USUARIO_RESPALDO;
    if (vendedor_usuario_id) {
      const usuarios = await supabaseGet(
        `usuarios?id=eq.${encodeURIComponent(vendedor_usuario_id)}&select=crm_user_id`
      );
      assigned_user_id = usuarios[0]?.crm_user_id || VTIGER_USUARIO_RESPALDO;
    }

    const sessionName = await vtigerLogin();
    const creado = await vtigerCreateComentario(sessionName, {
      commentcontent: comentario,
      related_to: crm_potentialid,
      assigned_user_id,
    });

    return res.status(200).json({ ok: true, id: creado.id });
  } catch (err) {
    console.error('crm-agregar-comentario failed', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
