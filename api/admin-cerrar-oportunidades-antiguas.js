// api/admin-cerrar-oportunidades-antiguas.js
//
// Jp, 2026-10-14 — "cerrar todas las oportunidades de venta del CRM que
// sean anteriores a diciembre del 2025". Script de un solo uso (mismo
// patrón que crm-describir-proyectos.js / crm-listar-usuarios.js): se
// sube al repo, se abre la URL una vez en el navegador, y se puede borrar
// del repo después.
//
// Alcance confirmado con Jp (2026-10-14):
//   - Corte: fecha_cierre_prevista (closingdate en Vtiger) < 2025-12-01.
//   - 109 oportunidades abiertas cumplen el criterio (ninguna en CAP).
//
// Corrección tras la 1ra corrida real (2026-10-14, misma noche): solo
// cerró 1 de 109 — bug de paginación (ver supabaseGetTodo) ya corregido.
// Con 108 candidatas restantes y cada una necesitando 2 llamadas a la API
// de Vtiger (retrieve+update) de forma secuencial, una sola invocación
// podría tardar más que el límite de ejecución de Vercel y cortarse a la
// mitad sin avisar. Por seguridad este script ahora procesa en lotes:
// cada vez que se abre la URL, procesa como máximo `limit` candidatas
// (default 25, ajustable con &limit=N) y reporta cuántas quedan — hay que
// refrescar/volver a abrir la misma URL varias veces hasta que
// "restantes" salga en 0.
//
// Qué hace, por cada oportunidad candidata:
//   1. Trae el registro completo de Vtiger (retrieve) usando crm_potentialid.
//   2. Lo reenvía (update) con sales_stage="Cerrada-Perdida" y probability=0
//      — igual patrón que api/crm-actualizar-oportunidad.js (Fase 3), pero
//      en lote en vez de una fila a la vez desde el modal de Proyección.
//   3. Actualiza el espejo oportunidades_crm (fase_venta, probabilidad).
//   4. Si la oportunidad ya tenía fila en pipeline_vendedor (Proyección),
//      actualiza también su estatus/probabilidad — con eso la fila se va
//      a "histórico" y deja de aparecer en la vista principal del
//      vendedor/director (mismo comportamiento ya construido para cuando
//      alguien marca Cerrada-Perdida a mano).
//
// Dirección de la escritura: app → CRM (Vtiger), tal como pidió Jp —
// "que fuera de la aplicación hacia el CRM y que en el CRM se reflejara".
//
// Variables de entorno: reutiliza las ya configuradas — VTIGER_BASE_URL,
// VTIGER_USER, VTIGER_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SYNC_SECRET. No requiere ninguna nueva.
//
// Cómo se usa:
//   1. Coloca este archivo en  api/admin-cerrar-oportunidades-antiguas.js
//      dentro del repo, súbelo, espera a que Vercel despliegue.
//   2. Ábrelo en el navegador:
//      https://os.innovaci.com.mx/api/admin-cerrar-oportunidades-antiguas?secret=TU_SYNC_SECRET
//      Esto EJECUTA el cierre real de una vez (no es una vista previa).
//   3. Si en el futuro quieres solo ver qué se cerraría sin tocar nada,
//      agrega &dry_run=1 a la URL.
//   4. Una vez confirmado que corrió bien, este archivo puede borrarse del
//      repo (ya cumplió su función), igual que los demás scripts de un
//      solo uso.

const VTIGER_BASE_URL = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_SECRET = process.env.SYNC_SECRET;

// Fecha de corte confirmada con Jp — oportunidades cuya fecha de cierre
// prevista ya pasó hace casi un año y siguen "abiertas".
const FECHA_CORTE = '2025-12-01';

// Mismo set de fases "cerradas" usado en oportunidades-crm-diseno.md
// (sección 3) — todo lo que NO está aquí cuenta como abierta.
const FASES_CERRADAS = new Set([
  'Cerrada-Ganada',
  'Cerrada-Perdida',
  'Servidor en la Nube',
  'Suscripción Aspel',
  'Entrega de Producto',
  'Entrega 24/7',
  'Closed Won',
  'Closed Lost',
]);

async function vtigerLogin() {
  const crypto = await import('node:crypto');
  const challengeUrl = `${VTIGER_BASE_URL}/webservice.php?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`;
  const challengeRes = await fetch(challengeUrl);
  const challengeJson = await challengeRes.json();
  if (!challengeJson.success) {
    throw new Error('No se pudo obtener el challenge token de Vtiger: ' + JSON.stringify(challengeJson));
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
    throw new Error('Login a Vtiger falló: ' + JSON.stringify(loginJson));
  }
  return loginJson.result.sessionName;
}

async function vtigerRetrieve(sessionName, id) {
  const url = `${VTIGER_BASE_URL}/webservice.php?operation=retrieve&sessionName=${encodeURIComponent(sessionName)}&id=${encodeURIComponent(id)}`;
  const json = await fetch(url).then((r) => r.json());
  if (!json.success) throw new Error(`retrieve ${id} falló: ` + JSON.stringify(json));
  return json.result;
}

async function vtigerUpdate(sessionName, element) {
  const body = new URLSearchParams({
    operation: 'update',
    sessionName,
    element: JSON.stringify(element),
  });
  const res = await fetch(`${VTIGER_BASE_URL}/webservice.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`update ${element.id} falló: ` + JSON.stringify(json));
  return json.result;
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supabasePatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path} -> ${res.status}: ${await res.text()}`);
}

// Jp, 2026-10-14 (corrida real) — bug encontrado: `oportunidades_crm` tiene
// ~5,100 filas y PostgREST/Supabase trunca en silencio cualquier consulta
// sin paginar a 1,000 filas (mismo patrón ya documentado para
// servicios_historicos en claude/mesa-control-operaciones.md). La primera
// corrida de este script solo trajo 1,000 filas (por `id`, no por fecha) y
// de esas solo 1 era candidata real — de ahí que haya cerrado solo 1 de 109.
// Se pagina explícito, igual que fetchTodo() en sync-crm-proyectos.js.
async function supabaseGetTodo(path, select) {
  let todos = [];
  let desde = 0;
  const pageSize = 1000;
  while (true) {
    const rows = await supabaseGet(`${path}&select=${encodeURIComponent(select)}&limit=${pageSize}&offset=${desde}`);
    todos = todos.concat(rows);
    if (rows.length < pageSize) break;
    desde += pageSize;
  }
  return todos;
}

export default async function handler(req, res) {
  const secret = req.query?.secret || req.headers['x-sync-secret'];
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const dryRun = req.query?.dry_run === '1' || req.query?.dry_run === 'true';

  try {
    // Candidatas: todas las que tengan fecha_cierre_prevista antes del
    // corte (paginado completo, ver supabaseGetTodo — NO solo las primeras
    // 1000); se filtra "abierta" (fase no cerrada) en JS para no pelear
    // con comas/acentos en el filtro not.in de PostgREST.
    const candidatasRaw = await supabaseGetTodo(
      `oportunidades_crm?fecha_cierre_prevista=lt.${FECHA_CORTE}`,
      'id,crm_potentialid,nombre_oportunidad,fase_venta,probabilidad,fecha_cierre_prevista'
    );
    const candidatas = candidatasRaw.filter((o) => o.crm_potentialid && !FASES_CERRADAS.has(o.fase_venta));

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dry_run: true,
        corte: FECHA_CORTE,
        total_candidatas: candidatas.length,
        candidatas: candidatas.map((o) => ({ id: o.id, crm_potentialid: o.crm_potentialid, nombre: o.nombre_oportunidad, fase_actual: o.fase_venta, fecha_cierre_prevista: o.fecha_cierre_prevista })),
      });
    }

    // Lote por invocación — evita que una corrida con muchas candidatas se
    // corte a la mitad por el límite de duración de la función (cada
    // candidata hace 2 llamadas secuenciales a Vtiger). Default 25; se
    // ajusta con &limit=N. Hay que reabrir la misma URL hasta que
    // "restantes" salga en 0.
    const limitLote = Math.max(1, parseInt(req.query?.limit, 10) || 25);
    const totalCandidatas = candidatas.length;
    const loteActual = candidatas.slice(0, limitLote);

    const sessionName = await vtigerLogin();
    let actualizadasCRM = 0;
    let actualizadasApp = 0;
    let filasProyeccionActualizadas = 0;
    const errores = [];

    for (const op of loteActual) {
      try {
        const registro = await vtigerRetrieve(sessionName, op.crm_potentialid);
        registro.sales_stage = 'Cerrada-Perdida';
        registro.probability = '0';
        await vtigerUpdate(sessionName, registro);
        actualizadasCRM++;

        await supabasePatch(`oportunidades_crm?id=eq.${op.id}`, {
          fase_venta: 'Cerrada-Perdida',
          probabilidad: 0,
          updated_at: new Date().toISOString(),
        });
        actualizadasApp++;

        // Si ya tenía fila ligada en Proyección, se actualiza también para
        // que se vaya a histórico y deje de aparecer en la vista principal.
        const filasLigadas = await supabaseGet(
          `pipeline_vendedor?oportunidad_crm_id=eq.${op.id}&select=id`
        );
        if (filasLigadas.length) {
          await supabasePatch(`pipeline_vendedor?oportunidad_crm_id=eq.${op.id}`, {
            estatus: 'Cerrada-Perdida',
            probabilidad: 0,
          });
          filasProyeccionActualizadas += filasLigadas.length;
        }
      } catch (e) {
        errores.push({ id: op.id, crm_potentialid: op.crm_potentialid, nombre: op.nombre_oportunidad, error: String(e?.message || e) });
      }
    }

    return res.status(200).json({
      ok: true,
      corte: FECHA_CORTE,
      total_candidatas: totalCandidatas,
      procesadas_este_lote: loteActual.length,
      restantes: totalCandidatas - loteActual.length,
      actualizadas_crm: actualizadasCRM,
      actualizadas_app: actualizadasApp,
      filas_proyeccion_actualizadas: filasProyeccionActualizadas,
      errores,
      siguiente_paso: totalCandidatas - loteActual.length > 0
        ? 'Quedan candidatas por procesar — vuelve a abrir la misma URL para seguir con el siguiente lote.'
        : 'Listo, no quedan candidatas pendientes.',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 300 };
