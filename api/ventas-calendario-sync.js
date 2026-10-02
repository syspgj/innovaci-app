// api/ventas-calendario-sync.js
//
// Corre una vez al día (Vercel Cron). Revisa las ventas de timbres y
// pólizas registradas en fact_ingresos y, para cada una que todavía no
// tenga su recordatorio programado, calcula la fecha de vencimiento
// estimada (venta + 12 meses) y la fecha de aviso (vencimiento - N días),
// y la deja anotada en ventas_calendario_recordatorios.
//
// Cuando la fecha de aviso de un recordatorio pendiente ya llegó (hoy o
// antes), crea el evento en el calendario compartido de Ventas vía la API
// de Google Calendar (autenticado como cuenta de servicio) y marca el
// recordatorio como 'creado'.
//
// Variables de entorno requeridas (Vercel → Project Settings → Environment
// Variables):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL   (de la cuenta de servicio)
//   GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY     (private_key del JSON, con \n literales está bien, se reemplazan abajo)
//   GOOGLE_CALENDAR_ID                      (el calendario de la cuenta de Gmail de ventas, compartido con la cuenta de servicio)
//   VENTAS_CALENDARIO_CRON_SECRET           (cadena inventada, igual patrón que TELEGRAM_WEBHOOK_SECRET; protege el endpoint)

import crypto from 'crypto';

// ─── Config: qué rubros disparan cada tipo de recordatorio ─────────────────
const CONFIG_RECORDATORIOS = {
  timbres: {
    rubros: ['TIMBRES'],
    meses_vigencia: 12,
    dias_anticipacion: 15,
    etiqueta: 'Renovación de timbres',
    emoji: '📠',
  },
  poliza: {
    rubros: ['POLIZA', 'POLIZA ASPEL', 'POLIZA RESGUARDO', 'POLIZA TOTAL O ALIADO'],
    meses_vigencia: 12,
    dias_anticipacion: 15,
    etiqueta: 'Renovación de póliza',
    emoji: '🛡️',
  },
};

const NOMBRE_VENDEDOR = { MANUEL: 'Manuel Peña', DULCE: 'Dulce Solano' };

function nombreVendedor(v) {
  if (!v) return 'Sin vendedor';
  const key = String(v).trim().toUpperCase();
  return NOMBRE_VENDEDOR[key] || v;
}

function sumarMeses(fechaISO, meses) {
  const d = new Date(fechaISO + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function restarDias(fechaISO, dias) {
  const d = new Date(fechaISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function sumarUnDia(fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtMoneda(n) {
  const num = Number(n || 0);
  return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
}

function fmtFechaLarga(fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00Z');
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// ─── Autenticación con Google (cuenta de servicio, sin librerías externas) ──
async function obtenerAccessTokenGoogle() {
  const email = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL;
  const keyRaw = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY || '';
  const privateKey = keyRaw.replace(/\\n/g, '\n');
  if (!email || !privateKey) throw new Error('Faltan GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL/KEY en las variables de entorno.');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64url(header)}.${b64url(claim)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64url');
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('No se pudo autenticar con Google Calendar: ' + JSON.stringify(data));
  return data.access_token;
}

async function crearEventoCalendar(accessToken, calendarId, evento) {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(evento),
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error('Error creando evento en Calendar: ' + JSON.stringify(data));
  return data;
}

// ─── Supabase (REST directo, sin SDK, con la service role key) ─────────────
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, options = {}) {
  const resp = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${path} → ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export default async function handler(req, res) {
  // Protección simple del endpoint (igual patrón que TELEGRAM_WEBHOOK_SECRET)
  const secretEsperado = process.env.VENTAS_CALENDARIO_CRON_SECRET;
  const secretRecibido = req.headers['x-cron-secret'] || req.query?.secret;
  if (secretEsperado && secretRecibido !== secretEsperado) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const resultado = { detectadas: 0, nuevas: 0, eventos_creados: 0, errores: [] };

  try {
    const hoyISO = new Date().toISOString().slice(0, 10);

    for (const [tipo, cfg] of Object.entries(CONFIG_RECORDATORIOS)) {
      // 1) Detectar ventas nuevas de este tipo que aún no tienen fila en ventas_calendario_recordatorios
      const rubrosFiltro = cfg.rubros.map((r) => `"${r}"`).join(',');
      const ventas = await sb(
        `fact_ingresos?select=id,fecha,cliente,cliente_cartera_id,vendedor,rubro,total&rubro=in.(${rubrosFiltro})`
      );
      resultado.detectadas += ventas.length;

      const yaRegistradas = await sb(
        `ventas_calendario_recordatorios?select=fact_ingreso_id&origen_tipo=eq.${tipo}`
      );
      const idsRegistrados = new Set(yaRegistradas.map((r) => r.fact_ingreso_id));

      const nuevas = ventas.filter((v) => v.fecha && !idsRegistrados.has(v.id));
      for (const v of nuevas) {
        const fechaVencimiento = sumarMeses(v.fecha, cfg.meses_vigencia);
        const fechaRecordatorio = restarDias(fechaVencimiento, cfg.dias_anticipacion);
        await sb('ventas_calendario_recordatorios', {
          method: 'POST',
          prefer: 'return=minimal',
          body: JSON.stringify({
            origen_tipo: tipo,
            fact_ingreso_id: v.id,
            cliente: v.cliente,
            cliente_cartera_id: v.cliente_cartera_id,
            vendedor: v.vendedor,
            rubro: v.rubro,
            monto: v.total,
            fecha_venta: v.fecha,
            fecha_vencimiento_estimada: fechaVencimiento,
            fecha_recordatorio: fechaRecordatorio,
            dias_anticipacion: cfg.dias_anticipacion,
          }),
        });
        resultado.nuevas++;
      }
    }

    // 2) Crear en Calendar los recordatorios pendientes cuya fecha ya llegó
    const pendientes = await sb(
      `ventas_calendario_recordatorios?select=*&estado=eq.pendiente&fecha_recordatorio=lte.${hoyISO}`
    );

    if (pendientes.length > 0) {
      const accessToken = await obtenerAccessTokenGoogle();
      const calendarId = process.env.GOOGLE_CALENDAR_ID;
      if (!calendarId) throw new Error('Falta GOOGLE_CALENDAR_ID en las variables de entorno.');

      for (const rec of pendientes) {
        const cfg = CONFIG_RECORDATORIOS[rec.origen_tipo];
        const vendedorNombre = nombreVendedor(rec.vendedor);
        const titulo = `${cfg?.emoji || '📞'} ${vendedorNombre} — ${cfg?.etiqueta || 'Renovación'}: ${rec.cliente || 'cliente'}`;
        const descripcion = [
          `Cliente: ${rec.cliente || '—'}`,
          `Vendedor: ${vendedorNombre}`,
          `Venta original: ${fmtFechaLarga(rec.fecha_venta)} (${fmtMoneda(rec.monto)}, rubro ${rec.rubro})`,
          `Vencimiento estimado: ${fmtFechaLarga(rec.fecha_vencimiento_estimada)}`,
          '',
          'Generado automáticamente por Innovaci OS — da seguimiento con el cliente para la renovación.',
        ].join('\n');

        try {
          const evento = await crearEventoCalendar(accessToken, calendarId, {
            summary: titulo,
            description: descripcion,
            start: { date: rec.fecha_recordatorio },
            end: { date: sumarUnDia(rec.fecha_recordatorio) },
            reminders: { useDefault: true },
          });
          await sb(`ventas_calendario_recordatorios?id=eq.${rec.id}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: JSON.stringify({
              estado: 'creado',
              google_event_id: evento.id,
              actualizado_en: new Date().toISOString(),
            }),
          });
          resultado.eventos_creados++;
        } catch (e) {
          await sb(`ventas_calendario_recordatorios?id=eq.${rec.id}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: JSON.stringify({
              estado: 'error',
              error_detalle: String(e.message || e).slice(0, 500),
              actualizado_en: new Date().toISOString(),
            }),
          });
          resultado.errores.push({ id: rec.id, error: String(e.message || e) });
        }
      }
    }

    res.status(200).json({ ok: true, ...resultado });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), ...resultado });
  }
}
