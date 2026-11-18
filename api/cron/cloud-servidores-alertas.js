// api/cron/cloud-servidores-alertas.js
//
// Control de servidores en la nube por cliente (pedido por Jp, 201026).
// Las facturas de Cloud se siguen emitiendo a mano en Finanzas → Ingresos
// (fact_ingresos, rubro='CLOUD') — este cron NO factura ni cobra nada, solo
// vigila ese ciclo contra la tabla de contratos `clientes_servidores_cloud`
// y avisa cuando algo necesita atención humana:
//   - Factura emitida este mes pero sin cobrar y ya pasó el día límite de
//     pago (default 27) → estado 'pendiente_suspender' + correo a
//     Administración y al vendedor del cliente. NUNCA suspende nada solo
//     (decisión explícita de Jp, 201026) — Administración/el vendedor deciden
//     y suspenden a mano en el proveedor de hosting.
//   - Factura emitida, sin cobrar, dentro del plazo (hoy <= día límite) →
//     estado 'pendiente_pago' (sin correo, solo visible en el dashboard,
//     hasta que se acerque o pase el límite).
//   - Ya pasó el día de facturación (default 7) y NO hay factura este mes
//     en fact_ingresos todavía → aviso a Administración de "factura no
//     emitida" (puede ser simple olvido).
//   - Factura de este mes ya cobrada → estado 'activo'.
//
// El correo solo se manda en la TRANSICIÓN de estado (para no mandar el
// mismo aviso todos los días) — se vuelve a mandar si el registro regresa a
// 'activo' y luego vuelve a caer en el mismo problema un mes después.
//
// Reutiliza el mecanismo de correo que YA existe en el proyecto (Resend vía
// API REST directa, mismo patrón que api/cron/proyeccion-alertas-seguimiento.js
// y api/reporte-semanal-vendedores.js) — no se inventó un mecanismo nuevo ni
// se requieren variables de entorno nuevas: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET, RESEND_API_KEY, REPORTE_FROM_EMAIL
// (todas ya configuradas en Vercel).
//
// Cómo se usa:
//   1. Coloca este archivo en api/cron/cloud-servidores-alertas.js dentro
//      del repo.
//   2. Agrega la entrada de cron correspondiente en vercel.json — correr
//      diario, por ejemplo 8:15am hora CDMX (después de los syncs de las
//      7am ya existentes).
//   3. Sube el archivo a tu repo como siempre y Vercel despliega solo.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REPORTE_FROM_EMAIL || 'Innovaci OS <reportes@innovaci.com.mx>';
const JP_BCC_EMAIL = 'joss@innovaci.com.mx';
const ADMIN_EMAIL = 'administracion@innovaci.com.mx';

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

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path} -> ${res.status}: ${await res.text()}`);
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
  if (!res.ok) throw new Error(`Supabase POST ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

const MESES = ['', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
// Marca que lleva cada solicitud creada sola, para no duplicarla cuando el
// cron vuelva a correr los días siguientes del mismo mes.
function marcaCloud(anio, mes) { return `[cloud-auto ${anio}-${String(mes).padStart(2, '0')}]`; }

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

function fmtMoney(n) {
  return '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function plantillaAviso({ titulo, intro, filas }) {
  const filasHtml = filas.map(f => `
    <div style="padding:10px 0;border-bottom:1px solid #eee;">
      <div style="font-size:13px;font-weight:700;color:#0b1f33;">${f.cliente}</div>
      <div style="font-size:12.5px;color:#333;margin-top:2px;">${f.detalle}</div>
    </div>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;">
    <div style="background:#0b1f33;color:#fff;padding:18px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:16px;font-weight:700;">${titulo}</div>
      <div style="font-size:12px;opacity:0.8;margin-top:2px;">Servidores Cloud — Innovaci OS</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:18px 20px;border-radius:0 0 8px 8px;">
      <div style="font-size:13px;color:#333;margin-bottom:10px;">${intro}</div>
      ${filasHtml}
    </div>
  </div>`;
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
  const [anio, mes, dia] = hoy.split('-').map(Number);
  const inicioMes = `${anio}-${String(mes).padStart(2, '0')}-01`;

  try {
    const servidores = await sbGet(
      `clientes_servidores_cloud?estado=neq.cancelado&select=id,cliente_cartera_id,nombre_servidor,monto_mensual,dia_facturacion,dia_limite_pago,estado,producto_servidor_id`
    );
    if (!servidores.length) {
      return res.status(200).json({ ok: true, hoy, mensaje: 'Sin servidores cloud activos en control.' });
    }

    const clienteIds = [...new Set(servidores.map(s => s.cliente_cartera_id))];
    const clientes = await sbGet(
      `clientes_cartera?id=in.(${clienteIds.join(',')})&select=id,razon_social,num_cliente,rfc,regimen_fiscal,uso_cfdi,forma_pago_pref,metodo_pago_pref,vendedor_asignado`
    );
    const clienteMap = {};
    clientes.forEach(c => { clienteMap[c.id] = c; });

    const vendedorIds = [...new Set(clientes.map(c => c.vendedor_asignado).filter(Boolean))];
    const usuariosVend = vendedorIds.length
      ? await sbGet(`usuarios?id=in.(${vendedorIds.join(',')})&select=id,nombre,email`)
      : [];
    const usuarioMap = {};
    usuariosVend.forEach(u => { usuarioMap[u.id] = u; });

    const facturas = await sbGet(
      `fact_ingresos?rubro=eq.CLOUD&fecha=gte.${inicioMes}&cliente_cartera_id=in.(${clienteIds.join(',')})&select=cliente_cartera_id,fecha,total,cobrado&order=fecha.desc`
    );
    const facturaPorCliente = {};
    facturas.forEach(f => {
      // Solo la más reciente del mes por cliente (ya viene ordenado desc).
      if (!facturaPorCliente[f.cliente_cartera_id]) facturaPorCliente[f.cliente_cartera_id] = f;
    });

    // ── Solicitudes de factura del mes (Jp, 2026-11-18) ──────────────────
    // Las facturas de Cloud no nacen en Ventas: las hace Facturación. Antes
    // había que acordarse de capturar las 8 solicitudes a mano cada día 7; si
    // se olvidaba, este cron solo mandaba el correo de "factura no emitida".
    // Ahora, llegado el día de facturación de cada servidor, la solicitud se
    // crea sola a nombre del VENDEDOR dueño de la cuenta (así él la ve y le
    // carga el pago, aunque no la haya pedido) y queda en "pendiente de pago",
    // que es el estado con el que Facturación la timbra y luego espera el
    // pago del día límite. La factura se sigue haciendo en Aspel a mano: esto
    // solo deja la solicitud lista, nunca timbra ni cobra nada.
    const marca = marcaCloud(anio, mes);
    const nombresProducto = {};
    const prodIds = [...new Set(servidores.map(s => s.producto_servidor_id).filter(Boolean))];
    if (prodIds.length) {
      const prods = await sbGet(`productos_servidores?id=in.(${prodIds.join(',')})&select=id,nombre`);
      prods.forEach(p => { nombresProducto[p.id] = p.nombre; });
    }
    const solsMes = await sbGet(
      `solicitudes_factura?cliente_cartera_id=in.(${clienteIds.join(',')})&created_at=gte.${inicioMes}&select=id,cliente_cartera_id,notas,estado`
    );
    const yaTieneSolicitud = new Set(
      solsMes.filter(x => String(x.notas || '').includes(marca)).map(x => x.cliente_cartera_id)
    );
    const solicitudesCreadas = [];

    const avisosAdmin = []; // {cliente, detalle}
    const avisosPorVendedor = {}; // usuarioId -> [{cliente, detalle}]
    let actualizados = 0;

    for (const s of servidores) {
      const cliente = clienteMap[s.cliente_cartera_id];
      const nombreCliente = cliente ? cliente.razon_social : '(cliente no encontrado)';
      const factura = facturaPorCliente[s.cliente_cartera_id];
      const vendedorUsuario = cliente && cliente.vendedor_asignado ? usuarioMap[cliente.vendedor_asignado] : null;

      // Día de facturación: deja lista la solicitud si todavía no existe.
      if (
        cliente && s.estado !== 'suspendido' &&
        dia >= (s.dia_facturacion || 7) &&
        !facturaPorCliente[s.cliente_cartera_id] &&
        !yaTieneSolicitud.has(s.cliente_cartera_id)
      ) {
        const equipo = nombresProducto[s.producto_servidor_id] || s.nombre_servidor || 'SERVIDOR CLOUD';
        const concepto = `SERVIDOR ${String(equipo).toUpperCase().startsWith('CLOUD') ? '' : 'CLOUD '}${String(equipo).toUpperCase()} — ${MESES[mes]} ${anio}`;
        const limite = Math.min(28, s.dia_limite_pago || 27);
        try {
          await sbPost('solicitudes_factura', {
            vendedor_id: cliente.vendedor_asignado || null,
            vendedor_nombre: vendedorUsuario ? vendedorUsuario.nombre : '',
            cliente_cartera_id: cliente.id,
            num_cliente: cliente.num_cliente || null,
            cliente_nombre: cliente.razon_social,
            rfc: cliente.rfc || null,
            tipo: 'liberar_pago',
            estado: 'pendiente_pago',
            concepto,
            monto_total: s.monto_mensual,
            fecha_pago_esperada: `${anio}-${String(mes).padStart(2, '0')}-${String(limite).padStart(2, '0')}`,
            forma_pago: cliente.forma_pago_pref || null,
            metodo_pago: cliente.metodo_pago_pref || null,
            uso_cfdi: cliente.uso_cfdi || null,
            regimen: cliente.regimen_fiscal || null,
            notas: `${marca} Servidor en la nube — solicitud generada sola el día ${dia} (día de facturación: ${s.dia_facturacion || 7}). El pago vence el día ${limite}. Si el monto o el concepto cambiaron, corrígelos aquí antes de facturar.`,
          });
          yaTieneSolicitud.add(s.cliente_cartera_id);
          solicitudesCreadas.push({
            cliente: nombreCliente,
            detalle: `${concepto} · ${fmtMoney(s.monto_mensual)} · a nombre de ${vendedorUsuario ? vendedorUsuario.nombre : 'sin vendedor asignado'} · pago esperado el día ${limite}.`,
          });
        } catch (e) {
          avisosAdmin.push({
            cliente: nombreCliente,
            detalle: `No se pudo crear sola la solicitud de factura del servidor cloud: ${e.message}. Captúrala a mano.`,
          });
        }
      }

      let nuevoEstado = s.estado;
      let patch = null;

      if (factura && factura.cobrado) {
        nuevoEstado = 'activo';
        patch = { estado: 'activo', fecha_ultima_factura: factura.fecha, fecha_ultimo_pago: hoy };
      } else if (factura && !factura.cobrado) {
        if (dia > s.dia_limite_pago) {
          nuevoEstado = 'pendiente_suspender';
        } else {
          nuevoEstado = 'pendiente_pago';
        }
        patch = { estado: nuevoEstado, fecha_ultima_factura: factura.fecha };
      } else if (!factura && dia > s.dia_facturacion && s.estado !== 'suspendido') {
        // No hay factura este mes y ya pasó el día de facturación —
        // aviso de "factura no emitida", sin tocar el estado del servidor
        // (puede seguir activo por la factura del mes anterior).
        // Si la solicitud ya quedó lista (la acaba de crear este mismo cron o
        // se creó un día anterior), el aviso cambia de tono: no es un olvido,
        // es que falta timbrarla.
        const tieneSol = yaTieneSolicitud.has(s.cliente_cartera_id);
        if (!solicitudesCreadas.some(x => x.cliente === nombreCliente)) {
          avisosAdmin.push({
            cliente: nombreCliente,
            detalle: tieneSol
              ? `${s.nombre_servidor || 'Servidor cloud'} (${fmtMoney(s.monto_mensual)}/mes) — la solicitud de factura ya está en Facturación, falta timbrarla y registrarla en Finanzas.`
              : `${s.nombre_servidor || 'Servidor cloud'} (${fmtMoney(s.monto_mensual)}/mes) — todavía no se ha registrado la factura de este mes en Finanzas (día de facturación: ${s.dia_facturacion}).`,
          });
        }
      }

      if (patch && nuevoEstado !== s.estado) {
        await sbPatch(`clientes_servidores_cloud?id=eq.${s.id}`, { ...patch, actualizado_en: new Date().toISOString() });
        actualizados++;

        if (nuevoEstado === 'pendiente_suspender') {
          const detalle = `${s.nombre_servidor || 'Servidor cloud'} (${fmtMoney(s.monto_mensual)}/mes) — factura del ${factura.fecha} sin pagar, ya pasó el día límite (día ${s.dia_limite_pago}). Hay que decidir si se suspende.`;
          avisosAdmin.push({ cliente: nombreCliente, detalle });
          if (vendedorUsuario && vendedorUsuario.email) {
            if (!avisosPorVendedor[vendedorUsuario.id]) avisosPorVendedor[vendedorUsuario.id] = { usuario: vendedorUsuario, items: [] };
            avisosPorVendedor[vendedorUsuario.id].items.push({ cliente: nombreCliente, detalle });
          }
        }
      } else if (patch) {
        // Mismo estado que ya tenía — se actualiza la fecha de factura sin
        // generar aviso nuevo (evita correo repetido todos los días).
        await sbPatch(`clientes_servidores_cloud?id=eq.${s.id}`, patch);
        actualizados++;
      }
    }

    let correosEnviados = 0;

    if (solicitudesCreadas.length) {
      await enviarCorreo({
        to: ADMIN_EMAIL,
        subject: `🖥️ Servidores Cloud — ${solicitudesCreadas.length} solicitud${solicitudesCreadas.length !== 1 ? 'es' : ''} de factura lista${solicitudesCreadas.length !== 1 ? 's' : ''}`,
        html: plantillaAviso({
          titulo: 'Solicitudes de factura de servidores cloud',
          intro: `Hoy ${hoy} se crearon solas ${solicitudesCreadas.length} solicitud${solicitudesCreadas.length !== 1 ? 'es' : ''} de factura de servidores en la nube. Ya están en Facturación → "Por facturar", esperando que se timbren; el pago lo carga el vendedor cuando llegue.`,
          filas: solicitudesCreadas,
        }),
      });
      correosEnviados++;
    }

    if (avisosAdmin.length) {
      await enviarCorreo({
        to: ADMIN_EMAIL,
        subject: `🖥️ Servidores Cloud — ${avisosAdmin.length} pendiente${avisosAdmin.length !== 1 ? 's' : ''} de atención`,
        html: plantillaAviso({
          titulo: 'Servidores Cloud pendientes de atención',
          intro: `Hoy ${hoy} hay ${avisosAdmin.length} servidor${avisosAdmin.length !== 1 ? 'es' : ''} cloud que necesita${avisosAdmin.length !== 1 ? 'n' : ''} revisión:`,
          filas: avisosAdmin,
        }),
      });
      correosEnviados++;
    }

    for (const key of Object.keys(avisosPorVendedor)) {
      const { usuario, items } = avisosPorVendedor[key];
      await enviarCorreo({
        to: usuario.email,
        subject: `🖥️ Servidor(es) cloud de tu${items.length !== 1 ? 's' : ''} cliente${items.length !== 1 ? 's' : ''} sin pagar — pasó el día límite`,
        html: plantillaAviso({
          titulo: 'Pago de servidor cloud vencido',
          intro: `Hola ${usuario.nombre}, el pago del servidor cloud de ${items.length !== 1 ? 'estos clientes tuyos' : 'este cliente tuyo'} ya pasó el día límite:`,
          filas: items,
        }),
      });
      correosEnviados++;
    }

    res.status(200).json({ ok: true, hoy, servidores_revisados: servidores.length, actualizados, solicitudes_creadas: solicitudesCreadas.length, detalle_solicitudes: solicitudesCreadas, correos_enviados: correosEnviados });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Error desconocido.' });
  }
}
