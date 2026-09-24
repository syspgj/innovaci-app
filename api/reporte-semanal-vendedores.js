// api/reporte-semanal-vendedores.js
//
// Reporte semanal por correo para vendedores (Manuel Peña y Dulce Solano, ver
// vendedorFactIngresosFiltro en index.html) — pedido por Jp el 2026-09-24:
// cada LUNES, un correo con: avance de la meta principal de Servicios (venta
// actual, cuánto falta, ritmo diario necesario en lo que resta del mes),
// avance del bono de alcance (KPIs secundarios), avance de los bonos de venta
// cruzada (Aspel y Cursos 24/7), y el estatus de sus suscripciones que vencen
// este mes (renovada / no renovada / pendiente).
//
// Toda la lógica de comisiones/metas está copiada 1:1 de index.html (mismas
// tablas CT/BONO_KPI_TABLE, mismas funciones getDiasHabiles/getDiasTranscurridos,
// calcAlcanceBono, calcBonoAspelCruzada, calcBonoCursos247) para que el correo
// nunca muestre un número distinto al que el vendedor ve en su dashboard.
//
// Disparado por Vercel Cron (ver vercel.json) los lunes 7:00 AM hora CDMX
// (13:00 UTC — México no tiene horario de verano desde 2022, así que el
// offset es fijo). También se puede invocar a mano (GET) para probarlo.
//
// Variables de entorno requeridas:
//   SUPABASE_SERVICE_ROLE_KEY  (ya existe en el proyecto)
//   RESEND_API_KEY             (nueva — API key de Resend)
//   REPORTE_FROM_EMAIL         (opcional, default 'Innovaci OS <reportes@innovaci.com.mx>')
//   CRON_SECRET                (opcional pero recomendado — protege el endpoint
//                                de invocaciones externas; Vercel Cron la manda
//                                sola como header Authorization si está configurada
//                                en Project Settings → Environment Variables)

const SURL = 'https://ydwouspzneacxfixlmmv.supabase.co';

function fmt(n) {
  return '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Tablas de comisión (copiadas de index.html) ────────────────────────────
const CT = [
  { min: 0, max: 0.7999, r: 0 }, { min: 0.8, max: 0.9999, r: 0.04 }, { min: 1, max: 1.1999, r: 0.09 },
  { min: 1.2, max: 1.3999, r: 0.095 }, { min: 1.4, max: 1.5999, r: 0.10 }, { min: 1.6, max: 1.7999, r: 0.105 }, { min: 1.8, max: 99, r: 0.11 },
];
const BONO_KPI_TABLE = [
  { min: 0, max: 0.7999, extra: -0.01 },
  { min: 0.8, max: 0.9499, extra: 0 },
  { min: 0.95, max: 0.9999, extra: 0.005 },
  { min: 1.0, max: 1.0999, extra: 0.01 },
  { min: 1.1, max: 1.1999, extra: 0.02 },
  { min: 1.2, max: 99, extra: 0.04 },
];
function getBonoKpiExtra(alcance) {
  for (const t of BONO_KPI_TABLE) if (alcance >= t.min && alcance <= t.max) return t.extra;
  return 0;
}
const META_ASPEL_CRUZADA = 50000, TASA_ASPEL_CRUZADA = 0.03; // rubros: RENTA ASPEL + TIMBRES
const META_CURSOS247 = 40000, TASA_CURSOS247 = 0.05; // rubro: 24/7

function calcBonoAspelCruzada(montoAspel, deptoAlcanzo, vendedorCumplioMeta) {
  const m = montoAspel || 0;
  if (!deptoAlcanzo || !vendedorCumplioMeta) return { monto: 0, aplica: false };
  if (m < META_ASPEL_CRUZADA) return { monto: 0, aplica: false, faltante: META_ASPEL_CRUZADA - m };
  return { monto: m * TASA_ASPEL_CRUZADA, aplica: true };
}
function calcBonoCursos247(monto247, deptoAlcanzo, vendedorCumplioMeta) {
  const m = monto247 || 0;
  if (!deptoAlcanzo || !vendedorCumplioMeta) return { monto: 0, aplica: false };
  if (m < META_CURSOS247) return { monto: 0, aplica: false, faltante: META_CURSOS247 - m };
  return { monto: m * TASA_CURSOS247, aplica: true };
}

// ─── Días hábiles (copiado de index.html) ───────────────────────────────────
function getDiasHabiles(y, m) {
  let count = 0; const d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) { const dw = d.getDay(); if (dw > 0 && dw < 6) count++; d.setDate(d.getDate() + 1); }
  return count;
}
function getDiasTranscurridos(y, m, hoy) {
  let count = 0; const d = new Date(y, m - 1, 1);
  while (d < hoy && d.getMonth() === m - 1) { const dw = d.getDay(); if (dw > 0 && dw < 6) count++; d.setDate(d.getDate() + 1); }
  return count;
}

// ─── Bono de alcance (KPIs secundarios, copiado de index.html) ─────────────
function buildTotMap(t) {
  return { svc: t.svc, aspel: t.aspel, it: t.it, cursos: t.cursos, cur: t.cursos, cur247: t.cursos, sf: t.sf, siigo_fiscal: t.sf, demos: t.demos, val: t.val, cn: t.cn, dip: t.dip, cur_vivo: t.cur_vivo };
}
function calcAlcanceBono(kpiCfg, tot, metaKey) {
  let totalPeso = 0, ponderado = 0;
  const totMap = buildTotMap(tot);
  const kpisAplicables = kpiCfg.filter(k => !/_m$/.test(k.kpi_key));
  for (const k of kpisAplicables) {
    if (!k.peso || k.peso === 0) continue;
    const meta = k[metaKey] || 1;
    const actual = totMap[k.kpi_key] || 0;
    const alcance = Math.min(actual / meta, 1.5);
    ponderado += alcance * (k.peso / 100);
    totalPeso += k.peso / 100;
  }
  if (totalPeso === 0) return 0;
  return ponderado / totalPeso;
}

// ─── Vendedores objetivo (mismo criterio que vendedorFactIngresosFiltro) ────
// Confirmado por Jp, 2026-09-24: solo Manuel Peña y Dulce Solano reciben este
// correo y los bonos de venta cruzada — Guillermo Blancas es agente externo
// (solo facturación) y el resto de vendedores del dropdown están dados de baja.
function esVendedorObjetivo(email) {
  const em = (email || '').toLowerCase();
  return em.includes('manuel') || em.includes('dulce');
}
function filtroFactIngresos(email) {
  const em = (email || '').toLowerCase();
  if (em.includes('manuel')) return 'MANUEL';
  if (em.includes('dulce')) return 'DULCE';
  return null;
}

// ─── Cliente REST mínimo a Supabase (sin SDK, mismo patrón sin dependencias
// que el resto de los endpoints en /api) ─────────────────────────────────────
async function sb(path, serviceKey) {
  const r = await fetch(`${SURL}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

// ─── Envío de correo vía Resend (API REST directa, sin SDK) ────────────────
async function enviarCorreo({ to, subject, html }, resendKey, fromEmail) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend -> ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

// ─── Plantilla del correo ───────────────────────────────────────────────────
function construirHtml({ nombre, mesNombre, anio, ventaActual, svcMeta, faltante, pctAvance, diasRest, ritmoNecesario,
  alcanceBono, pctExtra, montoAspel, bonoAspel, monto247, bono247, deptoAlcanzado, vendedorCumplioMeta, suscripciones }) {
  const color = pctAvance >= 1 ? '#27AE60' : pctAvance >= 0.8 ? '#F5A623' : '#E84040';
  const barra = (pct, col) => `<div style="background:#eee;border-radius:6px;height:10px;overflow:hidden;margin:6px 0;"><div style="background:${col};height:100%;width:${Math.min(pct * 100, 100)}%;"></div></div>`;

  const filaBono = (titulo, monto, meta, aplica, tasa) => `
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee;">
      <div style="font-size:13px;font-weight:600;color:#1A2332;">${titulo}</div>
      ${barra(Math.min(monto / meta, 1), monto >= meta ? '#27AE60' : '#F5A623')}
      <div style="font-size:12px;color:#555;">${fmt(monto)} de ${fmt(meta)} ${monto >= meta ? '✓ meta alcanzada' : `— falta ${fmt(Math.max(meta - monto, 0))}`}</div>
      <div style="font-size:11px;color:${aplica ? '#27AE60' : '#999'};margin-top:2px;">${aplica ? `✓ Comisión activa (${(tasa * 100).toFixed(0)}% sobre el total)` : (deptoAlcanzado && vendedorCumplioMeta ? 'Aún no alcanza la meta del bono' : 'Retenido — falta cumplir la meta principal de Servicios (depto y/o individual)')}</div>
    </div>`;

  // Nota: los colores aquí deben ser hex de 6 dígitos (no shorthand de 3) porque
  // el badge les concatena "18" para simular opacidad (ej. "#2980B9"+"18" -> hex
  // de 8 dígitos válido). "#999"+"18" da "#99918", que es inválido y el navegador
  // lo ignora — por eso se usa "#999999" aquí, no "#999".
  const estadoLabel = { sin_reclamar: ['Sin reclamar', '#999999'], reclamada: ['Reclamada', '#2980B9'], en_revision: ['En revisión', '#2980B9'], renovada: ['Renovada', '#27AE60'], no_renovada: ['No renovada', '#E84040'] };
  const suscHtml = suscripciones.length
    ? suscripciones.map(s => {
        const [lbl, col] = estadoLabel[s.estado] || [s.estado || '—', '#999999'];
        return `<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:12px;">
          <strong>${s.cliente || s.razon_social_reportada || 'Sin razón social'}</strong>
          <span style="float:right;background:${col}18;color:${col};padding:1px 8px;border-radius:4px;font-size:11px;font-weight:600;">${lbl}</span>
          <div style="color:#888;font-size:11px;">serie ${s.numserie || '—'} · ${s.producto || ''}</div>
        </div>`;
      }).join('')
    : `<div style="font-size:12px;color:#888;padding:8px 0;">Sin suscripciones por vencer este mes.</div>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1A2332;">
    <div style="background:#1A2332;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0;">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:0.7;">Innovaci OS · Reporte semanal</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px;">Hola, ${nombre.split(' ')[0]} 👋</div>
      <div style="font-size:12px;opacity:0.85;">${mesNombre} ${anio} — lo que llevas y lo que falta</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:20px 24px;border-radius:0 0 10px 10px;">

      <div style="font-size:14px;font-weight:700;color:#1A2332;">🎯 Meta principal — Servicios</div>
      ${barra(pctAvance, color)}
      <div style="font-size:13px;color:#333;">${fmt(ventaActual)} de ${fmt(svcMeta)} <strong style="color:${color};">(${Math.round(pctAvance * 100)}%)</strong></div>
      ${faltante > 0
        ? `<div style="font-size:12px;color:#555;margin-top:4px;">Faltan ${fmt(faltante)}. ${diasRest > 0 ? `Con ${diasRest} días hábiles restantes en el mes, necesitas vender <strong>${fmt(ritmoNecesario)}/día</strong> para llegar a la meta.` : 'Ya no quedan días hábiles este mes.'}</div>`
        : `<div style="font-size:12px;color:#27AE60;margin-top:4px;">✓ Meta cumplida este mes.</div>`}

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee;">
        <div style="font-size:13px;font-weight:600;color:#1A2332;">⭐ Bono de alcance (KPIs secundarios)</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">Alcance ponderado: <strong>${Math.round(alcanceBono * 100)}%</strong> → ${pctExtra > 0 ? '+' : ''}${(pctExtra * 100).toFixed(1)}% extra sobre tu tasa de comisión.</div>
      </div>

      ${filaBono('🖥 Bono Aspel — venta cruzada (3%)', montoAspel, META_ASPEL_CRUZADA, bonoAspel.aplica, TASA_ASPEL_CRUZADA)}
      ${filaBono('🎓 Bono Cursos 24/7 (5%)', monto247, META_CURSOS247, bono247.aplica, TASA_CURSOS247)}

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee;">
        <div style="font-size:13px;font-weight:600;color:#1A2332;">📋 Suscripciones que vencen este mes</div>
        <div style="margin-top:6px;">${suscHtml}</div>
      </div>

      <div style="margin-top:20px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">
        Este correo se genera automáticamente cada lunes desde Innovaci OS.
      </div>
    </div>
  </div>`;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default async function handler(req, res) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers['authorization'] || '';
      // También se acepta ?secret=... por query string, para poder probar el
      // endpoint a mano desde el navegador (sin poder mandar headers custom).
      const querySecret = req.query && req.query.secret;
      const autorizado = auth === `Bearer ${cronSecret}` || querySecret === cronSecret;
      if (!autorizado) return res.status(401).json({ error: 'No autorizado' });
    }

    const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const RESEND_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.REPORTE_FROM_EMAIL || 'Innovaci OS <reportes@innovaci.com.mx>';
    if (!SKEY) return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
    if (!RESEND_KEY) return res.status(500).json({ error: 'Falta RESEND_API_KEY' });

    // Modo prueba: ?dryRun=1 calcula todo pero no manda el correo, solo lo regresa en la respuesta.
    const dryRun = req.query && (req.query.dryRun === '1' || req.query.dryRun === 'true');
    // Permite forzar un solo destinatario para pruebas: ?soloEmail=manuel@innovaci.com.mx
    const soloEmail = req.query && req.query.soloEmail ? String(req.query.soloEmail).toLowerCase() : null;

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const anio = now.getFullYear(), mes = now.getMonth() + 1;
    const diasHabiles = getDiasHabiles(anio, mes);
    const diasTrans = getDiasTranscurridos(anio, mes, now);
    const diasRest = Math.max(diasHabiles - diasTrans, 0);
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const lastDay = new Date(anio, mes, 0).getDate();
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1) Meta de depto y total real del depto este mes (para el doble candado)
    const kpiConfig = await sb(`kpi_config?anio=eq.${anio}&mes=eq.${mes}&activo=eq.true&order=orden`, SKEY);
    const metaDeptoRow = kpiConfig.find(k => k.kpi_key === 'meta_depto');
    const metaDepto = metaDeptoRow ? metaDeptoRow.meta_dulce : 160000;
    const allRegs = await sb(`registros_diarios?select=svc&fecha=gte.${desde}&fecha=lte.${hasta}`, SKEY);
    const totalDeptoSvc = allRegs.reduce((s, r) => s + (r.svc || 0), 0);
    const deptoAlcanzado = totalDeptoSvc >= metaDepto;

    // 2) Vendedores objetivo
    const usuarios = await sb(`usuarios?rol=eq.vendedor&activo=eq.true`, SKEY);
    let vendedores = usuarios.filter(u => esVendedorObjetivo(u.email));
    if (soloEmail) vendedores = vendedores.filter(u => (u.email || '').toLowerCase() === soloEmail);

    const enviados = [];
    for (const u of vendedores) {
      const isDulce = (u.email || '').toLowerCase().includes('dulce');
      const metaKey = isDulce ? 'meta_dulce' : 'meta_manuel';

      const regs = await sb(`registros_diarios?usuario_id=eq.${u.id}&fecha=gte.${desde}&fecha=lte.${hasta}`, SKEY);
      const tot = { svc: 0, aspel: 0, it: 0, cursos: 0, sf: 0, demos: 0, val: 0, cn: 0, dip: 0, cur_vivo: 0 };
      for (const r of regs) {
        tot.svc += r.svc || 0; tot.aspel += r.aspel || 0; tot.it += r.it || 0; tot.cursos += r.cursos || 0;
        tot.sf += r.siigo_fiscal || 0; tot.demos += r.demos || 0; tot.val += r.valoraciones || 0;
        tot.cn += r.clientes_nuevos || 0; tot.dip += r.diplomados || 0; tot.cur_vivo += r.talleres_vivo || 0;
      }
      const svcMetaRow = kpiConfig.find(k => k.kpi_key === 'svc');
      const svcMeta = (svcMetaRow ? svcMetaRow[metaKey] : 0) || 80000;
      const ventaActual = tot.svc;
      const faltante = Math.max(svcMeta - ventaActual, 0);
      const pctAvance = svcMeta > 0 ? ventaActual / svcMeta : 0;
      const ritmoNecesario = diasRest > 0 ? faltante / diasRest : 0;
      const vendedorCumplioMeta = ventaActual >= svcMeta;

      const alcanceBono = calcAlcanceBono(kpiConfig, tot, metaKey);
      const pctExtra = getBonoKpiExtra(alcanceBono);

      const filtroFact = filtroFactIngresos(u.email);
      let montoAspel = 0, monto247 = 0;
      if (filtroFact) {
        const fact = await sb(`fact_ingresos?select=rubro,total,vendedor,cobrado&anio=eq.${anio}&mes=eq.${mes}&cobrado=eq.true&vendedor=ilike.*${filtroFact}*`, SKEY);
        for (const r of fact) {
          const rub = (r.rubro || '').toUpperCase();
          if (rub === 'RENTA ASPEL' || rub === 'TIMBRES') montoAspel += r.total || 0;
          else if (rub === '24/7') monto247 += r.total || 0;
        }
      }
      const bonoAspel = calcBonoAspelCruzada(montoAspel, deptoAlcanzado, vendedorCumplioMeta);
      const bono247 = calcBonoCursos247(monto247, deptoAlcanzado, vendedorCumplioMeta);

      // Suscripciones que vencen este mes, de cuentas asignadas a este vendedor
      const clientes = await sb(`clientes_cartera?select=id,razon_social&vendedor_asignado=eq.${u.id}`, SKEY);
      const clientesPorId = {}; clientes.forEach(c => { clientesPorId[c.id] = c.razon_social; });
      const idsClientes = clientes.map(c => c.id);
      let suscripciones = [];
      if (idsClientes.length) {
        const raw = await sb(`suscripciones_cartera?select=numserie,producto,estado,razon_social_reportada,fecha_proxima_renovacion,cliente_id&cliente_id=in.(${idsClientes.join(',')})&fecha_proxima_renovacion=gte.${desde}&fecha_proxima_renovacion=lte.${hasta}`, SKEY);
        suscripciones = raw.map(s => ({ ...s, cliente: clientesPorId[s.cliente_id] }));
      }

      const html = construirHtml({
        nombre: u.nombre || u.email, mesNombre: MESES[mes - 1], anio,
        ventaActual, svcMeta, faltante, pctAvance, diasRest, ritmoNecesario,
        alcanceBono, pctExtra, montoAspel, bonoAspel, monto247, bono247,
        deptoAlcanzado, vendedorCumplioMeta, suscripciones,
      });
      const subject = `📊 Tu reporte semanal — ${MESES[mes - 1]} (${Math.round(pctAvance * 100)}% de tu meta)`;

      if (!dryRun) {
        await enviarCorreo({ to: u.email, subject, html }, RESEND_KEY, FROM_EMAIL);
      }
      enviados.push({ email: u.email, nombre: u.nombre, ventaActual, svcMeta, pctAvance, diasRest, ritmoNecesario, montoAspel, monto247, bonoAspelAplica: bonoAspel.aplica, bono247Aplica: bono247.aplica, suscripcionesVencenMes: suscripciones.length, dryRun: !!dryRun, ...(dryRun ? { html } : {}) });
    }

    return res.status(200).json({ ok: true, deptoAlcanzado, totalDeptoSvc, metaDepto, enviados });
  } catch (err) {
    console.error('reporte-semanal-vendedores error:', err);
    return res.status(500).json({ error: String(err && err.message || err) });
  }
}
