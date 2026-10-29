// api/admin-sync-crm.js
//
// Jp, 2026-10-29 — botón manual "🔄 Sincronizar CRM ahora" en Mesa de
// Control (Operaciones). Pedido justo después de encontrar que los 3
// crons de sync (Cuentas/Oportunidades/Proyectos) llevaban semanas
// fallando en silencio por un bug de autenticación con Vercel Cron (ver
// claude/mesa-control-renovacion-polizas-y-fix-cron-crm-291026.md en el
// proyecto) — Jp pidió un botón para poder forzar la sincronización él
// mismo sin esperar la próxima corrida automática (~cada 3h) ni tener que
// abrir las URLs de los crons a mano con el secreto en la barra de
// direcciones.
//
// Este endpoint es solo un disparador server-to-server: llama a los 3
// endpoints de cron ya existentes (/api/cron/sync-crm-accounts,
// sync-crm-oportunidades, sync-crm-proyectos) mandando el header
// "x-sync-secret" con SYNC_SECRET tomado de las variables de entorno del
// servidor — el secreto NUNCA se manda al navegador. sync-crm-proyectos
// ya incluye, desde el mismo lote, la detección automática de renovación
// de pólizas (resguardo y soporte) — por eso basta con disparar los 3 de
// siempre, no hace falta lógica nueva aquí.
//
// Protegido igual que api/crm-comentarios.js: solo exige que venga un
// header Authorization (sesión de Supabase ya iniciada en la app) — el
// botón mismo solo se muestra dentro de Mesa de Control/Vista Director,
// que ya están gateados por rol en el frontend.
//
// Variables de entorno: reutiliza SYNC_SECRET (ya configurada). Opcional
// SYNC_SITE_URL si algún día el dominio cambia; por default usa
// os.innovaci.com.mx.

const SYNC_SECRET = process.env.SYNC_SECRET;
const SITE_URL = process.env.SYNC_SITE_URL || 'https://os.innovaci.com.mx';

async function dispararSync(nombre) {
  const url = `${SITE_URL}/api/cron/${nombre}`;
  try {
    const res = await fetch(url, { headers: { 'x-sync-secret': SYNC_SECRET } });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...json };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ ok: false, error: 'No autorizado' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no soportado' });
  if (!SYNC_SECRET) return res.status(500).json({ ok: false, error: 'Falta SYNC_SECRET en el servidor' });

  try {
    // Jp, 2026-10-29 — se probó en paralelo y Vtiger respondió
    // INVALID_USER_CREDENTIALS en 2 de los 3 (Cuentas y Oportunidades),
    // mientras que Proyectos sí sincronizó bien (2,675 registros): Vtiger
    // no soporta bien que el MISMO usuario pida challenge+login al mismo
    // tiempo desde 2-3 llamadas simultáneas (se pisan los tokens de
    // reto entre sí) — por eso ahora van uno por uno, en serie. Un poco
    // más lento, pero confiable.
    const cuentas = await dispararSync('sync-crm-accounts');
    const oportunidades = await dispararSync('sync-crm-oportunidades');
    const proyectos = await dispararSync('sync-crm-proyectos');
    return res.status(200).json({ ok: true, cuentas, oportunidades, proyectos });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
