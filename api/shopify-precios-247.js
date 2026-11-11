// api/shopify-precios-247.js
//
// Precio VIGENTE de los cursos 24/7 directo de Shopify, para el cotizador (Jp, 2026-11-11).
// Devuelve { ok:true, precios:{ [clave]: { precio, regular, producto, variante } } }, donde
// clave = SKU de la variante (o "var-<id>" si no tiene), igual que shopify_producto_map.clave.
// "regular" es el precio de comparación (precio normal cuando hay promoción) o null.
// De paso refresca shopify_producto_map.precio, que sirve de respaldo si Shopify no responde.
//
// Requiere sesión (cualquier usuario autenticado de la app). Mismas variables de entorno que
// shopify-sync-productos.js: SHOPIFY_SHOP_DOMAIN + (SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET | SHOPIFY_ADMIN_TOKEN)
// Scope necesario: read_products (el mismo que ya usa el sincronizador).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHOP = (process.env.SHOPIFY_SHOP_DOMAIN || '').trim();
const STATIC_TOKEN = (process.env.SHOPIFY_ADMIN_TOKEN || '').trim();
const CID = (process.env.SHOPIFY_CLIENT_ID || '').trim();
const CSEC = (process.env.SHOPIFY_CLIENT_SECRET || '').trim();
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' };

async function tokenShopify() {
  if (STATIC_TOKEN) return STATIC_TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CID, client_secret: CSEC }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('No se pudo obtener el token de Shopify (' + r.status + ')');
  return j.access_token;
}

async function haySesion(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SKEY } });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!SUPABASE_URL || !SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' });
    if (!SHOP || !(STATIC_TOKEN || (CID && CSEC))) return res.status(200).json({ ok: false, error: 'Falta configurar Shopify en Vercel' });
    if (!(await haySesion(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida' });

    const TOKEN = await tokenShopify();
    const precios = {};
    let cursor = null;
    for (let i = 0; i < 10; i++) {
      const q = `query($c:String){products(first:50,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor}nodes{title variants(first:30){nodes{id title sku price compareAtPrice}}}}}`;
      const r = await fetch(`https://${SHOP}/admin/api/2024-10/graphql.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({ query: q, variables: { c: cursor } }),
      });
      const j = await r.json();
      if (!r.ok || j.errors) return res.status(200).json({ ok: false, error: 'Shopify: ' + JSON.stringify(j.errors || j).slice(0, 200) });
      const d = j.data.products;
      for (const p of d.nodes) for (const v of p.variants.nodes) {
        const clave = v.sku || 'var-' + String(v.id).split('/').pop();
        const precio = Number(v.price);
        if (!isFinite(precio)) continue;
        const regular = Number(v.compareAtPrice) > precio ? Number(v.compareAtPrice) : null;
        precios[clave] = { precio, regular, producto: p.title, variante: v.title };
      }
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
    }
    // Respaldo: deja guardado el último precio conocido (si falla, no afecta la respuesta)
    await Promise.allSettled(Object.entries(precios).map(([clave, x]) => fetch(`${SUPABASE_URL}/rest/v1/shopify_producto_map?clave=eq.${encodeURIComponent(clave)}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ precio: x.precio }),
    }).catch(() => {})));
    return res.status(200).json({ ok: true, precios, actualizado: new Date().toISOString() });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
