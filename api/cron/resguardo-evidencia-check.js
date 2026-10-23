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
const ADMIN_EMAIL = 'administracion@innovaci.com.mx';

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

function plantillaAviso({ titulo, intro, filas, introVencidas, filasVencidas }) {
  const fila = (f) => `
    <div style="padding:10px 0;border-bottom:1px solid #eee;">
      <div style="font-size:13px;font-weight:700;color:#0b1f33;">${f.cliente}</div>
      <div style="font-size:12.5px;color:#333;margin-top:2px;">${f.detalle}</div>
    </div>`;
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;">
    <div style="background:#0b1f33;color:#fff;padding:18px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:16px;font-weight:700;">${titulo}</div>
      <div style="font-size:12px;opacity:0.8;margin-top:2px;">Evidencia de Resguardo — Innovaci OS</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:18px 20px;border-radius:0 0 8px 8px;">
      ${filasVencidas && filasVencidas.length ? `
        <div style="font-size:13px;color:#b00000;font-weight:700;margin-bottom:6px;">${introVencidas}</div>
        ${filasVencidas.map(fila).join('')}
      ` : ''}
      ${filas && filas.length ? `
        <div style="font-size:13px;color:#333;margin:${filasVencidas && filasVencidas.length ? '16px' : '0'} 0 10px;">${intro}</div>
        ${filas.map(fila).join('')}
      ` : ''}
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
    const sessionName = await vtigerLogin();
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
  if (
    process.env.SYNC_SECRET &&
    secretHeader !== process.env.SYNC_SECRET &&
    authHeader !== `Bearer ${process.env.SYNC_SECRET}`
  ) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const hoy = hoyMexico();

  try {
    const polizas = await sbGet(
      `clientes_polizas?estatus=neq.CERRADA&select=id,cliente_nombre,fecha_inicio,resguardo_periodicidad_dias_override,servidor_cloud_id,numero_proyecto_crm,polizas_catalogo!inner(nombre,categoria,resguardo_periodicidad_dias)&polizas_catalogo.categoria=eq.RESGUARDO`
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
      `resguardo_evidencias?cliente_poliza_id=in.(${polizaIds.join(',')})&select=cliente_poliza_id,periodo_fecha&order=periodo_fecha.desc`
    );
    const ultimaEvidenciaPorPoliza = {};
    evidencias.forEach((e) => {
      if (!ultimaEvidenciaPorPoliza[e.cliente_poliza_id]) ultimaEvidenciaPorPoliza[e.cliente_poliza_id] = e.periodo_fecha;
    });

    const incidenciasAbiertas = await sbGet(
      `servicios_ejecutados?tipo_servicio=eq.INCIDENCIA_RESGUARDO&estatus=in.(PENDIENTE,ASIGNADO,EN_CURSO)&cliente_poliza_id=in.(${polizaIds.join(',')})&select=cliente_poliza_id`
    );
    const yaTieneIncidenciaAbierta = new Set(incidenciasAbiertas.map((i) => i.cliente_poliza_id));

    let folioContador = await sbCount(`servicios_ejecutados?created_at=gte.${hoy.slice(0, 4)}-01-01`);
    const anio = hoy.slice(0, 4);

    const avisosVencidas = [];
    const avisosProximas = []; // vence en los próximos 3 días, sin incidencia todavía
    let ticketsCreados = 0;
    let comentariosCrm = 0;

    for (const p of polizas) {
      const periodicidadDias = p.resguardo_periodicidad_dias_override || p.polizas_catalogo?.resguardo_periodicidad_dias
        || (p.servidor_cloud_id && servidorMap[p.servidor_cloud_id]?.productos_servidores?.specs
          ? parsearPeriodicidadBackupSpecs(servidorMap[p.servidor_cloud_id].productos_servidores.specs)
          : null);
      if (!periodicidadDias || !p.fecha_inicio) continue; // sin datos suficientes para calcular — se deja visible en el detalle de la póliza, no se puede alertar sin esto

      const ultimaEvidencia = ultimaEvidenciaPorPoliza[p.id] || null;
      const proximoVencimiento = calcularProximoVencimiento(p.fecha_inicio, periodicidadDias, ultimaEvidencia, hoy);
      const diasParaVencer = Math.floor((new Date(proximoVencimiento + 'T00:00:00') - new Date(hoy + 'T00:00:00')) / 86400000);

      if (diasParaVencer < 0 && !yaTieneIncidenciaAbierta.has(p.id)) {
        // Vencida y sin incidencia abierta todavía: crear el ticket.
        folioContador++;
        const folio = `TCK-${anio}-${String(folioContador).padStart(5, '0')}`;
        const descripcion = `Evidencia de resguardo no subida — póliza ${p.polizas_catalogo?.nombre || ''} de ${p.cliente_nombre}, periodicidad cada ${periodicidadDias} día${periodicidadDias === 1 ? '' : 's'}, debió subirse el ${proximoVencimiento}. Generado automático por el sistema de alertas de resguardo.`;
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

        if (p.numero_proyecto_crm) {
          const ok = await comentarEnProyectoCrm(p.numero_proyecto_crm, `⚠ ${descripcion} (ticket ${folio})`);
          if (ok) comentariosCrm++;
        }

        avisosVencidas.push({
          cliente: p.cliente_nombre,
          detalle: `${p.polizas_catalogo?.nombre || 'Resguardo'} — evidencia vencida desde el ${proximoVencimiento} (cada ${periodicidadDias}d). Ticket ${folio} creado para Soporte.`,
        });
      } else if (diasParaVencer >= 0 && diasParaVencer <= 3) {
        avisosProximas.push({
          cliente: p.cliente_nombre,
          detalle: `${p.polizas_catalogo?.nombre || 'Resguardo'} — evidencia debida el ${proximoVencimiento} (en ${diasParaVencer} día${diasParaVencer === 1 ? '' : 's'}).`,
        });
      }
    }

    let correoEnviado = false;
    if (avisosVencidas.length || avisosProximas.length) {
      await enviarCorreo({
        to: ADMIN_EMAIL,
        subject: `🗓 Evidencia de resguardo — ${avisosVencidas.length} vencida${avisosVencidas.length !== 1 ? 's' : ''}${avisosProximas.length ? `, ${avisosProximas.length} por vencer` : ''}`,
        html: plantillaAviso({
          titulo: 'Evidencia de resguardo',
          introVencidas: `${avisosVencidas.length} póliza${avisosVencidas.length !== 1 ? 's' : ''} sin evidencia de resguardo, con incidencia ya creada para Soporte:`,
          filasVencidas: avisosVencidas,
          intro: `${avisosProximas.length} póliza${avisosProximas.length !== 1 ? 's' : ''} con evidencia por vencer en los próximos 3 días:`,
          filas: avisosProximas,
        }),
      });
      correoEnviado = true;
    }

    res.status(200).json({
      ok: true,
      hoy,
      polizas_revisadas: polizas.length,
      tickets_creados: ticketsCreados,
      comentarios_crm: comentariosCrm,
      correo_enviado: correoEnviado,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Error desconocido.' });
  }
}
