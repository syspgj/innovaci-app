// api/shopify-webhook.js
//
// Recibe los pedidos de la tienda Shopify (innovaci.shop) y los guarda en
// la tabla shopify_pedidos para que Ventas los atienda desde la App.
//
// Configuración (una sola vez):
//   1. Shopify admin → Configuración → Notificaciones → Webhooks → "Crear webhook"
//      Hay que crear 3: Evento "Creación de pedido", "Pago del pedido" y
//      "Actualización de pedido" (y opcional "Cancelación de pedido").
//      Formato: JSON · URL: https://os.innovaci.com.mx/api/shopify-webhook
//   2. Al final de esa misma página Shopify muestra:
//      "Tus webhooks se firmarán con ..."  → copia esa clave.
//   3. En Vercel → Settings → Environment Variables agrega
//         SHOPIFY_WEBHOOK_SECRET = <esa clave>
//      y vuelve a desplegar. (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen.)
//
// Seguridad: se valida la firma HMAC (x-shopify-hmac-sha256) sobre el cuerpo
// crudo; sin firma válida se responde 401 y no se guarda nada.

import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function leerCrudo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

function firmaValida(crudo, firma) {
  if (!SECRET || !firma) return false;
  const esperada = crypto.createHmac('sha256', SECRET).update(crudo).digest('base64');
  const a = Buffer.from(esperada);
  const b = Buffer.from(String(firma));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  const crudo = await leerCrudo(req);
  if (!firmaValida(crudo, req.headers['x-shopify-hmac-sha256'])) {
    console.error('shopify-webhook: firma inválida o SHOPIFY_WEBHOOK_SECRET sin configurar');
    return res.status(401).json({ ok: false, error: 'firma inválida' });
  }

  let o;
  try { o = JSON.parse(crudo.toString('utf8')); } catch { return res.status(400).json({ ok: false, error: 'json inválido' }); }
  if (!o || !o.id) return res.status(400).json({ ok: false, error: 'sin id de pedido' });

  const cli = o.customer || {};
  const fac = o.billing_address || {};
  const env = o.shipping_address || {};
  const nombre = [cli.first_name, cli.last_name].filter(Boolean).join(' ').trim() || fac.name || env.name || '';

  // Solo se mandan columnas de datos: el estado de atención (nuevo/atendiendo...) no se pisa en actualizaciones.
  const fila = {
    shopify_id: o.id,
    numero: o.name || ('#' + o.order_number),
    creado_shopify: o.created_at || null,
    cliente_nombre: nombre,
    empresa: fac.company || env.company || null,
    email: o.email || cli.email || null,
    telefono: o.phone || fac.phone || cli.phone || env.phone || null,
    total: Number(o.total_price) || 0,
    moneda: o.currency || 'MXN',
    pasarela: (o.payment_gateway_names || []).join(', ') || o.gateway || null,
    estado_pago: o.financial_status || null,
    cancelado: !!o.cancelled_at,
    lineas: (o.line_items || []).map((l) => ({
      titulo: l.title, sku: l.sku || null, variante_id: l.variant_id || null, producto_id: l.product_id || null,
      variante: l.variant_title || null, cantidad: l.quantity, precio: Number(l.price) || 0,
    })),
    nota: o.note || null,
    updated_at: new Date().toISOString(),
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/shopify_pedidos?on_conflict=shopify_id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(fila),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('shopify-webhook guardar falló', err);
    // 500 → Shopify reintenta la entrega
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
