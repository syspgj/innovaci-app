// api/cron/resguardo-evidencia-check.js
//
// Jp, 2026-10-23 — Mesa de Control: sistema de alertas de evidencia de
// resguardo (pendiente desde hace tiempo, ver claude/mesa-control-operaciones.md
// Lote 18 — "depende de que Jp mande la periodicidad real de cada tipo",
// ya confirmada por Jp con el PDF oficial + 2 facturas reales + el catálogo
// de servidores).
//
// Qué hace, una vez al día, para cada póliza activa de categoría RESGUARDO:
//   1. Resuelve su periodicidad real: override de la póliza (Personalizado
//      INN1/2/3) > derivada del servidor real contratado (Resguardo Nube
//      con Servidor, parseando el "Backup..." de productos_servidores.specs)
//      > default del catálogo (INN1=30d, INN2=15d, INN3=7d, Aliado=1d,
//      Beneficio Póliza Infinito=30d).
//   2. Calcula si el periodo actual ya debió tener evidencia subida
//      (resguardo_evidencias) y no la tiene.
//   3. Si está vencida Y no hay ya una incidencia abierta para esta póliza,
//      crea un ticket en servicios_ejecutados (tipo_servicio=
//      'INCIDENCIA_RESGUARDO', para que Soporte lo revise y suba el reporte
//      pendiente — Jp: "si no se hizo un resguardo debe crear
//      automáticamente una incidencia para que Soporte lo revise"), posta un
//      comentario en el Proyecto CRM de la póliza (si ya está espejado) y
//      agrega al aviso por correo del día.
//
// Jp pidió además que el aviso de "próxima a vencer" (sin crear incidencia
// todavía) exista para que Soporte no se entere solo cuando ya es tarde —
// se incluye en el mismo correo, en una sección aparte, sin crear ticket.
//
// Aviso por CORREO (no Telegram): Mesa de Control ya tiene un cron hermano
// para esto mismo (api/cron/cloud-servidores-alertas.js, servidores cloud) —
// se sigue ese mismo patrón (Resend, mismo remitente, mismo
// ADMIN_EMAIL/JP_BCC_EMAIL) en vez de inventar un canal de Telegram nuevo sin
// confirmar con Jp cuál usar. Si más adelante Jp prefiere también un aviso
// de Telegram (como Círculo), se puede agregar reutilizando ese patrón.
//
// Variables de entorno: reutiliza las ya configuradas — SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET, RESEND_API_KEY, REPORTE_FROM_EMAIL,
// VTIGER_BASE_URL, VTIGER_USER, VTIGER_ACCESS_KEY. No requiere ninguna nueva.
//
// Cómo se usa:
//   1. Coloca este archivo en api/cron/resguardo-evidencia-check.js.
//   2. Agrega la entrada en vercel.json (diario, por ejemplo 8:30am CDMX,
//      después de cloud-servidores-alertas a las 8:15am).
//   3. Sube el archivo a tu repo como siempre y Vercel despliega solo.

import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REPORTE_FROM_EMAIL || 'Innovaci OS <reportes@innovaci.com.mx>';
const JP_BCC_EMAIL = 'joss@innovaci.com.mx';
// Jp, 2026-11-17: el correo diario de resguardos va a Operaciones (Violeta), Coordinación/Mesa de Control y Soporte (Adriana);
// Jp recibe copia oculta. Administración YA NO lo recibe. Se puede cambiar sin tocar código con la variable de Vercel
// RESGUARDO_DESTINATARIOS (correos separados por coma).
const DESTINATARIOS = (process.env.RESGUARDO_DESTINATARIOS || 'violeta@innovaci.com.mx,coordinacion@innovaci.com.mx,adriana@innovaci.com.mx')
  .split(',').map((x) => x.trim()).filter(Boolean);
// Una póliza es PRIORITARIA cuando lleva este número de días (o más) de atraso en su evidencia, o si nunca se ha registrado.
const DIAS_PRIORITARIA = 7;

const VTIGER_BASE_URL = process.env.VTIGER_BASE_URL;
const VTIGER_USER = process.env.VTIGER_USER;
const VTIGER_ACCESS_KEY = process.env.VTIGER_ACCESS_KEY;

function hoyMexico() {
  // Mismo criterio ya usado en el resto de los crons del proyecto.
  const ahora = new Date();
  const cdmx = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
  return cdmx.toISOString().slice(0, 10);
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Supabase POST ${path} -> ${res.status}: ${JSON.stringify(j)}`);
  return Array.isArray(j) ? j[0] : j;
}

async function sbCount(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`Supabase HEAD ${path} -> ${res.status}`);
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1], 10) || 0 : 0;
}

async function enviarCorreo({ to, subject, html }) {
  if (!RESEND_KEY) return;
  const destinatarios = Array.isArray(to) ? to : [to];
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: destinatarios, bcc: [JP_BCC_EMAIL], subject, html }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend -> ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

function plantillaAviso({ fechaTxt, prioritarias, faltan, detectadas, alCorriente, sinPeriodicidad }) {
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // Jp 2026-11-17: el nombre del cliente abre directo la póliza dentro de la app (os.innovaci.com.mx/?poliza=ID).
  const SITE = process.env.SYNC_SITE_URL || 'https://os.innovaci.com.mx';
  const liga = (f) => f.id ? `<a href="${SITE}/?poliza=${encodeURIComponent(f.id)}" style="color:#0b1f33;text-decoration:underline;">${esc(f.cliente)}</a>` : esc(f.cliente);
  const chip = (n, txt, bg, fg) => `<td style="padding:0 4px;"><div style="background:${bg};color:${fg};border-radius:8px;padding:8px 6px;text-align:center;"><div style="font-size:20px;font-weight:700;">${n}</div><div style="font-size:10.5px;">${txt}</div></div></td>`;
  const bloque = (titulo, color, intro, filas, render) => !filas.length ? '' : `
    <div style="margin-top:20px;">
      <div style="font-size:13.5px;font-weight:700;color:${color};border-bottom:2px solid ${color};padding-bottom:4px;">${titulo} (${filas.length})</div>
      <div style="font-size:12px;color:#555;margin:6px 0 4px;">${intro}</div>
      ${filas.map(render).join('')}
    </div>`;
  // Línea por tarea de respaldo (cada carpeta): se ve de un vistazo cuál está al día y cuál atrasada.
  const tareaLinea = (t) => {
    const m = { ok: ['✅', '#1a7f4b', 'al día'], atrasada: ['⚠️', '#c77700', 'atrasada'], sin_revisar: ['🕗', '#888', 'sin revisar aún'], vacia: ['📭', '#c77700', 'carpeta vacía'], error: ['❌', '#b00000', 'no se pudo revisar'] };
    const [ic, col, lbl] = m[t.estado] || m.sin_revisar;
    return `<div style="font-size:12px;color:#444;margin:3px 0;">${ic} <b>${esc(t.nombre)}</b> <span style="color:${col};font-weight:600;">${lbl}</span>${t.fecha ? ` <span style="color:#999;">· último ${t.fecha}</span>` : ''}</div>`;
  };
  const filaFalta = (f) => `<div style="padding:12px 0;border-bottom:1px solid #eee;">
      <div style="font-size:13px;font-weight:700;color:#0b1f33;">${liga(f)} <span style="font-weight:400;color:#666;">· ${esc(f.poliza)}</span></div>
      <div style="font-size:13px;margin-top:3px;"><b style="color:${f.prioritaria ? '#b00000' : '#c77700'};">${f.nunca ? 'Sin ningún respaldo registrado' : (f.atraso > 0 ? '⏱ ' + f.atraso + ' día' + (f.atraso === 1 ? '' : 's') + ' de atraso' : '⏱ Vence hoy')}</b> <span style="color:#888;">· resguardo cada ${f.periodicidad} día${f.periodicidad === 1 ? '' : 's'}</span></div>
      ${f.tareas && f.tareas.length ? `<div style="margin-top:6px;padding-left:2px;">${f.tareas.map(tareaLinea).join('')}</div>` : ''}
      ${f.motivo ? `<div style="font-size:12px;color:#555;margin-top:6px;background:#f6f8fa;border-radius:6px;padding:7px 10px;"><b>Qué hacer:</b> ${esc(f.motivo)}</div>` : ''}
      ${f.ticketTxt ? `<div style="font-size:12px;color:#0b6;margin-top:4px;">🎫 ${esc(f.ticketTxt)}</div>` : ''}
    </div>`;
  const filaDet = (f) => `<div style="padding:8px 0;border-bottom:1px solid #eee;font-size:12.5px;"><b style="color:#0b1f33;">${liga(f)}</b> · ${esc(f.poliza)}<br><span style="color:#444;">${f.detalle}</span></div>`;
  const total = prioritarias.length + faltan.length;
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1f33;color:#fff;padding:18px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:17px;font-weight:700;">Resguardos — revisión del día</div>
      <div style="font-size:12px;opacity:0.8;margin-top:2px;">${esc(fechaTxt)} · Innovaci OS</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:16px 20px 20px;border-radius:0 0 8px 8px;">
      <table role="presentation" width="100%" style="border-collapse:collapse;"><tr>
        ${chip(prioritarias.length, 'PRIORITARIAS', prioritarias.length ? '#fdeaea' : '#f1f3f5', prioritarias.length ? '#b00000' : '#777')}
        ${chip(faltan.length, 'Falta evidencia', faltan.length ? '#fff4e0' : '#f1f3f5', faltan.length ? '#c77700' : '#777')}
        ${chip(detectadas.length, 'Evidencia detectada', detectadas.length ? '#e6f7ee' : '#f1f3f5', detectadas.length ? '#0a7a3d' : '#777')}
        ${chip(alCorriente.length, 'Al corriente', '#f1f3f5', '#444')}
      </tr></table>
      ${total === 0 ? '<div style="margin-top:16px;font-size:13px;color:#0a7a3d;font-weight:700;">✅ Todas las pólizas de resguardo tienen su evidencia al corriente. No hay nada pendiente hoy.</div>' : ''}
      ${bloque('🔴 PRIORITARIAS — atender hoy', '#b00000', `Llevan ${DIAS_PRIORITARIA} días o más sin evidencia, o nunca se ha registrado ninguna.`, prioritarias, filaFalta)}
      ${bloque('🟠 FALTA EVIDENCIA — revisar', '#c77700', 'Ya les toca evidencia del periodo vigente y todavía no se registra.', faltan, filaFalta)}
      ${bloque('🟢 EVIDENCIA DETECTADA — últimas 24 horas', '#0a7a3d', 'Estas pólizas quedaron cubiertas (Dropbox o subida a mano); no requieren acción.', detectadas, filaDet)}
      ${bloque('✅ AL CORRIENTE — próxima evidencia en 3 días o menos', '#444', 'Solo para tenerlas en el radar.', alCorriente, filaDet)}
      ${sinPeriodicidad.length ? `<div style="margin-top:20px;font-size:12px;color:#777;">⚠ ${sinPeriodicidad.length} póliza(s) de resguardo sin periodicidad o fecha de inicio capturada (no se pueden evaluar): ${sinPeriodicidad.map(esc).join(', ')}.</div>` : ''}
      <div style="margin-top:22px;font-size:11px;color:#888;">Se envía todos los días a las 7:00 a. m. Entra a Innovaci OS → Operaciones para subir evidencia o configurar la carpeta de Dropbox.</div>
    </div>
  </div>`;
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

async function vtigerLogin() {
  const challengeUrl = `${VTIGER_BASE_URL}/webservice.php?operation=getchallenge&username=${encodeURIComponent(VTIGER_USER)}`;
  const challengeJson = await fetch(challengeUrl).then((r) => r.json());
  if (!challengeJson.success) throw new Error('getchallenge falló: ' + JSON.stringify(challengeJson));
  const token = challengeJson.result.token;
  const accessKeyHash = md5(token + VTIGER_ACCESS_KEY);
  const loginBody = new URLSearchParams({ operation: 'login', username: VTIGER_USER, accessKey: accessKeyHash });
  const loginJson = await fetch(`${VTIGER_BASE_URL}/webservice.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginBody,
  }).then((r) => r.json());
  if (!loginJson.success) throw new Error('login falló: ' + JSON.stringify(loginJson));
  return loginJson.result.sessionName;
}

// Vtiger invalida el "challenge" de un usuario cuando otro proceso pide uno nuevo al mismo tiempo. Los crons de
// sincronización con el CRM corren a las :05, :07 y :10 (14, 17, 19, 21 y 1 h UTC), justo cuando corría este cron, y por
// eso el login fallaba a veces con INVALID_USER_CREDENTIALS (visto en los logs de Vercel el 2026-11-14 14:10).
// 2026-11-14: se reintenta hasta 3 veces con espera, y el cron se movió a una hora sin choques.
async function vtigerLoginConReintento() {
  let ultimo;
  for (let n = 0; n < 3; n++) {
    try { return await vtigerLogin(); } catch (e) { ultimo = e; await new Promise((r) => setTimeout(r, 2500 + n * 2500)); }
  }
  throw ultimo;
}

// Comenta en el Proyecto CRM espejado de la póliza (mismo criterio que
// api/crm-comentarios.js tipo='proyecto') — se duplica aquí porque ese
// endpoint exige un token de sesión de usuario (llamada desde la app), y
// este cron corre server-to-server sin sesión de usuario, igual que
// api/crm-describir-proyectos.js hace su propio vtigerLogin().
async function comentarEnProyectoCrm(numeroProyectoCrm, comentario) {
  try {
    const numero = String(numeroProyectoCrm).replace(/^POL/i, '').replace(/^PROJ/i, '');
    const rows = await sbGet(`proyectos_crm?crm_project_no=eq.${encodeURIComponent('PROJ' + numero)}&select=crm_projectid`);
    const crmid = rows?.[0]?.crm_projectid;
    if (!crmid) return false;
    const sessionName = await vtigerLoginConReintento();
    const record = { commentcontent: comentario, related_to: crmid };
    const body = new URLSearchParams({ operation: 'create', sessionName, element: JSON.stringify(record), elementType: 'ModComments' });
    const json = await fetch(`${VTIGER_BASE_URL}/webservice.php`, { method: 'POST', body }).then((r) => r.json());
    return !!json.success;
  } catch (e) {
    console.error('comentarEnProyectoCrm falló', e);
    return false;
  }
}

function parsearPeriodicidadBackupSpecs(specs) {
  if (!specs) return null;
  const arr = Array.isArray(specs) ? specs : [specs];
  const linea = arr.find((s) => /backup/i.test(s));
  if (!linea) return null;
  if (/quincenal/i.test(linea)) return 15;
  if (/semanal/i.test(linea)) return 7;
  if (/mensual/i.test(linea)) return 30;
  const porDias = linea.match(/cada\s*(\d+)\s*d[ií]as/i);
  if (porDias) return parseInt(porDias[1], 10);
  if (/diari/i.test(linea)) return 1;
  return null;
}

function calcularPeriodoActual(fechaInicioStr, periodicidadDias, hoyStr) {
  const inicio = new Date(fechaInicioStr + 'T00:00:00');
  const hoy = new Date(hoyStr + 'T00:00:00');
  const diffDias = Math.floor((hoy - inicio) / 86400000);
  if (diffDias < 0 || !periodicidadDias) return fechaInicioStr;
  const periodosTranscurridos = Math.floor(diffDias / periodicidadDias);
  const periodoFecha = new Date(inicio.getTime() + periodosTranscurridos * periodicidadDias * 86400000);
  return periodoFecha.toISOString().slice(0, 10);
}

function calcularProximoVencimiento(fechaInicioStr, periodicidadDias, ultimaEvidenciaFecha, hoyStr) {
  const periodoActual = calcularPeriodoActual(fechaInicioStr, periodicidadDias, hoyStr);
  if (ultimaEvidenciaFecha && ultimaEvidenciaFecha >= periodoActual) {
    const d = new Date(periodoActual + 'T00:00:00');
    d.setDate(d.getDate() + periodicidadDias);
    return d.toISOString().slice(0, 10);
  }
  return periodoActual;
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-sync-secret'];
  // Vercel Cron manda "Authorization: Bearer <CRON_SECRET>" en cada corrida programada
  // (2026-11-09: sin aceptar CRON_SECRET el cron diario era rechazado con 401 y nunca corría).
  // Las llamadas manuales siguen usando SYNC_SECRET.
  const claves = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (
    claves.length &&
    !claves.includes(secretHeader) &&
    !claves.some((c) => authHeader === `Bearer ${c}`)
  ) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const hoy = hoyMexico();

  try {
    const polizas = await sbGet(
      `clientes_polizas?estatus=neq.CERRADA&select=id,cliente_nombre,fecha_inicio,resguardo_periodicidad_dias_override,resguardo_plazo_cliente_dias,servidor_cloud_id,numero_proyecto_crm,resguardo_dropbox_folder,dropbox_revision_at,dropbox_revision_error,dropbox_ultimo_archivo,dropbox_ultimo_archivo_fecha,polizas_catalogo!inner(nombre,categoria,resguardo_periodicidad_dias)&polizas_catalogo.categoria=eq.RESGUARDO`
    );
    if (!polizas.length) {
      return res.status(200).json({ ok: true, hoy, mensaje: 'Sin pólizas de resguardo activas.' });
    }

    const servidorIds = [...new Set(polizas.map((p) => p.servidor_cloud_id).filter(Boolean))];
    let servidorMap = {};
    if (servidorIds.length) {
      const servidores = await sbGet(
        `clientes_servidores_cloud?id=in.(${servidorIds.join(',')})&select=id,nombre_servidor,productos_servidores(nombre,specs)`
      );
      servidores.forEach((s) => { servidorMap[s.id] = s; });
    }

    const polizaIds = polizas.map((p) => p.id);
    const evidencias = await sbGet(
      `resguardo_evidencias?cliente_poliza_id=in.(${polizaIds.join(',')})&select=cliente_poliza_id,periodo_fecha,origen,fecha_subida&order=periodo_fecha.desc`
    );
    const ultimaEvidenciaPorPoliza = {};
    const ultimaEvidenciaInfo = {}; // origen (dropbox/manual) y fecha real de subida, para el correo
    evidencias.forEach((e) => {
      if (!ultimaEvidenciaPorPoliza[e.cliente_poliza_id]) {
        ultimaEvidenciaPorPoliza[e.cliente_poliza_id] = e.periodo_fecha;
        ultimaEvidenciaInfo[e.cliente_poliza_id] = e;
      }
    });

    // Jp, 2026-11-22: carpetas de resguardo por póliza = "tareas" de respaldo
    // (cada carpeta de Drive). La de Dropbox va en la propia póliza. Se usan en
    // el correo para mostrar qué tarea está al día y cuál atrasada.
    let origenesPorPoliza = {};
    try {
      const origenes = await sbGet(`resguardo_origenes?cliente_poliza_id=in.(${polizaIds.join(',')})&activo=eq.true&select=cliente_poliza_id,etiqueta,proveedor,ultimo_archivo_fecha,revision_at,error`);
      (origenes || []).forEach((o) => { (origenesPorPoliza[o.cliente_poliza_id] = origenesPorPoliza[o.cliente_poliza_id] || []).push(o); });
    } catch (e) { origenesPorPoliza = {}; }

    const incidenciasAbiertas = await sbGet(
      `servicios_ejecutados?tipo_servicio=eq.INCIDENCIA_RESGUARDO&estatus=in.(PENDIENTE,ASIGNADO,EN_CURSO)&cliente_poliza_id=in.(${polizaIds.join(',')})&select=cliente_poliza_id`
    );
    const yaTieneIncidenciaAbierta = new Set(incidenciasAbiertas.map((i) => i.cliente_poliza_id));

    let folioContador = await sbCount(`servicios_ejecutados?created_at=gte.${hoy.slice(0, 4)}-01-01`);
    const anio = hoy.slice(0, 4);

    // Jp, 2026-11-14 — el correo se reorganizó para que se entienda de un vistazo:
    //   🔴 FALTA EVIDENCIA  → nunca subida, atrasada o del periodo vigente aún sin registrar, con el MOTIVO
    //                          (sin carpeta de Dropbox, carpeta no encontrada, carpeta vacía, archivo viejo…).
    //   ✅ AL CORRIENTE     → ya tiene la evidencia del periodo; se avisa cuándo toca la siguiente (en ≤ 3 días).
    // La lógica de tickets para Soporte no cambia (se crea uno cuando la evidencia está vencida y no hay uno abierto).
    const filasFalta = [];
    const filasAlCorriente = [];
    const sinPeriodicidad = [];
    let ticketsCreados = 0;
    let comentariosCrm = 0;

    for (const p of polizas) {
      const periodicidadDias = p.resguardo_periodicidad_dias_override || p.polizas_catalogo?.resguardo_periodicidad_dias
        || (p.servidor_cloud_id && servidorMap[p.servidor_cloud_id]?.productos_servidores?.specs
          ? parsearPeriodicidadBackupSpecs(servidorMap[p.servidor_cloud_id].productos_servidores.specs)
          : null);
      if (!periodicidadDias || !p.fecha_inicio) { sinPeriodicidad.push(p.cliente_nombre); continue; } // sin datos suficientes para calcular

      const ultimaEvidencia = ultimaEvidenciaPorPoliza[p.id] || null;
      const periodoActual = calcularPeriodoActual(p.fecha_inicio, periodicidadDias, hoy);
      const cubierto = !!(ultimaEvidencia && ultimaEvidencia >= periodoActual);
      const proximoVencimiento = calcularProximoVencimiento(p.fecha_inicio, periodicidadDias, ultimaEvidencia, hoy);
      const diasParaVencer = Math.floor((new Date(proximoVencimiento + 'T00:00:00') - new Date(hoy + 'T00:00:00')) / 86400000);
      const nombrePoliza = p.polizas_catalogo?.nombre || 'Resguardo';
      // Jp 2026-11-17: dos plazos. Vigilancia interna = periodicidad; plazo del contrato con el cliente (opcional) = holgura.
      // Mientras el atraso interno esté dentro del plazo del cliente: aviso suave, sin ticket y sin prioridad.
      const holguraCliente = p.resguardo_plazo_cliente_dias ? Math.max(0, p.resguardo_plazo_cliente_dias - periodicidadDias) : 0;
      const dentroPlazoCliente = diasParaVencer < 0 && diasParaVencer + holguraCliente >= 0;
      const diasRestantesCliente = diasParaVencer + holguraCliente;
      const info = ultimaEvidenciaInfo[p.id];
      const origenTxt = info ? (info.origen === 'dropbox' ? 'detectada en Dropbox' : 'subida a mano') : '';
      const ultimaTxt = ultimaEvidencia
        ? `Última evidencia registrada: ${ultimaEvidencia}${origenTxt ? ' (' + origenTxt + ')' : ''}.`
        : 'Nunca se ha registrado evidencia de esta póliza.';

      if (!cubierto) {
        // Tareas de respaldo de la póliza (Dropbox + cada carpeta de Drive) con su estado
        // respecto al periodo vigente. Así el correo muestra cuál está al día y cuál atrasada.
        const tareas = [];
        if (p.resguardo_dropbox_folder) tareas.push({ nombre: 'Dropbox', fecha: p.dropbox_ultimo_archivo_fecha ? String(p.dropbox_ultimo_archivo_fecha).slice(0, 10) : null, revisado: !!p.dropbox_revision_at, error: p.dropbox_revision_error || null, tieneArchivo: !!p.dropbox_ultimo_archivo });
        (origenesPorPoliza[p.id] || []).forEach((o) => tareas.push({ nombre: o.etiqueta || 'Drive', fecha: o.ultimo_archivo_fecha ? String(o.ultimo_archivo_fecha).slice(0, 10) : null, revisado: !!o.revision_at, error: o.error || null, tieneArchivo: !!o.ultimo_archivo_fecha }));
        tareas.forEach((t) => {
          if (t.error) t.estado = 'error';
          else if (!t.revisado) t.estado = 'sin_revisar';
          else if (!t.tieneArchivo) t.estado = 'vacia';
          else if (t.fecha && t.fecha >= periodoActual) t.estado = 'ok';
          else t.estado = 'atrasada';
        });
        // "Qué hacer" solo cuando hay algo que configurar/arreglar; si es puro atraso, las
        // líneas por tarea ya lo dicen (no se repite el texto largo de antes).
        let motivo = '';
        if (!tareas.length) motivo = 'No tiene carpeta de Dropbox ni de Drive configurada. Captúrala en ⚙ Configuración de resguardo, o sube la evidencia a mano.';
        else if (tareas.some((t) => t.estado === 'error')) { const e = tareas.find((t) => t.estado === 'error'); motivo = `La carpeta «${e.nombre}» no se pudo revisar: ${String(e.error).slice(0, 120)}`; }
        else if (tareas.every((t) => t.estado === 'sin_revisar')) motivo = 'Las carpetas aún no se han revisado. Usa “🔍 Revisar respaldos” en Operaciones.';
        else if (tareas.some((t) => t.estado === 'vacia')) motivo = 'Hay una carpeta sin archivos del periodo. Sube el respaldo, o súbelo a mano.';

        let ticketTxt = '';
        if (diasParaVencer < 0 && !dentroPlazoCliente && !yaTieneIncidenciaAbierta.has(p.id)) {
          // Vencida y sin incidencia abierta todavía: crear el ticket.
          folioContador++;
          const folio = `TCK-${anio}-${String(folioContador).padStart(5, '0')}`;
          const descripcion = `Evidencia de resguardo no subida — póliza ${nombrePoliza} de ${p.cliente_nombre}, periodicidad cada ${periodicidadDias} día${periodicidadDias === 1 ? '' : 's'}, debió subirse el ${proximoVencimiento}. Generado automático por el sistema de alertas de resguardo.`;
          await sbPost('servicios_ejecutados', {
            folio_ticket: folio,
            cliente_poliza_id: p.id,
            tipo_servicio: 'INCIDENCIA_RESGUARDO',
            cliente_nombre: p.cliente_nombre,
            solicitado_por: 'Sistema (alerta automática de resguardo)',
            descripcion_solicitud: descripcion,
            estatus: 'PENDIENTE',
          });
          ticketsCreados++;
          ticketTxt = `Se creó el ticket ${folio} para Soporte.`;

          if (p.numero_proyecto_crm) {
            const ok = await comentarEnProyectoCrm(p.numero_proyecto_crm, `⚠ ${descripcion} (ticket ${folio})`);
            if (ok) comentariosCrm++;
          }
        } else if (dentroPlazoCliente) {
          ticketTxt = `Atraso interno: aún estamos dentro del plazo del contrato con el cliente (${p.resguardo_plazo_cliente_dias} días; quedan ${diasRestantesCliente}). No se generó ticket todavía.`;
        } else if (diasParaVencer < 0) {
          ticketTxt = 'Ya tiene un ticket abierto en Soporte.';
        }

        const cuando = diasParaVencer < 0
          ? `Debió subirse el ${proximoVencimiento} (cada ${periodicidadDias} día${periodicidadDias === 1 ? '' : 's'}).`
          : `Vence hoy (cada ${periodicidadDias} día${periodicidadDias === 1 ? '' : 's'}).`;
        const atraso = diasParaVencer < 0 ? -diasParaVencer : 0;
        const nunca = !ultimaEvidencia;
        filasFalta.push({
          id: p.id,
          cliente: p.cliente_nombre,
          poliza: nombrePoliza,
          atraso,
          nunca,
          periodicidad: periodicidadDias,
          vencimiento: proximoVencimiento,
          tareas,
          motivo,
          ticketTxt,
          prioritaria: !dentroPlazoCliente && (atraso >= DIAS_PRIORITARIA || (nunca && atraso > 0)),
        });
      } else if (diasParaVencer >= 0 && diasParaVencer <= 3) {
        filasAlCorriente.push({
          id: p.id,
          cliente: p.cliente_nombre,
          poliza: nombrePoliza,
          detalle: `${ultimaTxt} Próxima evidencia: <b>${proximoVencimiento}</b> (en ${diasParaVencer} día${diasParaVencer === 1 ? '' : 's'}).`,
        });
      }
    }

    // Evidencias registradas en las últimas 24 h (Dropbox o a mano): son las "detectadas".
    const hace24h = Date.now() - 26 * 60 * 60 * 1000;
    const polizaPorId = {}; polizas.forEach((p) => { polizaPorId[p.id] = p; });
    const filasDetectadas = evidencias
      .filter((e) => e.fecha_subida && new Date(e.fecha_subida).getTime() >= hace24h && polizaPorId[e.cliente_poliza_id])
      .map((e) => {
        const p = polizaPorId[e.cliente_poliza_id];
        return { id: p.id, cliente: p.cliente_nombre, poliza: p.polizas_catalogo?.nombre || 'Resguardo', detalle: `Periodo ${e.periodo_fecha} · ${e.origen === 'dropbox' ? 'detectada automáticamente en Dropbox' : (e.origen === 'drive' ? 'detectada automáticamente en Google Drive (todas las tareas de respaldo)' : 'subida a mano')}.` };
      });

    const orden = (a, b) => (b.nunca - a.nunca) || (b.atraso - a.atraso);
    const prioritarias = filasFalta.filter((f) => f.prioritaria).sort(orden);
    const faltan = filasFalta.filter((f) => !f.prioritaria).sort(orden);

    // Se envía TODOS los días (aunque todo esté al corriente) para que se sepa que la revisión corrió.
    const fechaTxt = new Date(hoy + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let correoEnviado = false;
    let errorCorreo = null;
    try {
      await enviarCorreo({
        to: DESTINATARIOS,
        subject: `🗓 Resguardos ${hoy} — ${prioritarias.length ? `🔴 ${prioritarias.length} prioritaria${prioritarias.length === 1 ? '' : 's'}` : '🔴 0 prioritarias'} · ${faltan.length} sin evidencia · ${filasDetectadas.length} detectada${filasDetectadas.length === 1 ? '' : 's'}`,
        html: plantillaAviso({ fechaTxt, prioritarias, faltan, detectadas: filasDetectadas, alCorriente: filasAlCorriente, sinPeriodicidad }),
      });
      correoEnviado = true;
    } catch (e) { errorCorreo = e.message; console.error('resguardo correo', e); }

    res.status(200).json({
      ok: true,
      hoy,
      polizas_revisadas: polizas.length,
      tickets_creados: ticketsCreados,
      comentarios_crm: comentariosCrm,
      correo_enviado: correoEnviado,
      error_correo: errorCorreo,
      destinatarios: DESTINATARIOS.length,
      prioritarias: prioritarias.length,
      sin_evidencia: faltan.length,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Error desconocido.' });
  }
}
