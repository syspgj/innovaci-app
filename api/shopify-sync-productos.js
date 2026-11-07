// api/shopify-sync-productos.js
//
// Trae los productos ACTIVOS de la tienda Shopify y da de alta en
// shopify_producto_map las variantes que todavía no estén (Jp, 2026-11-07).
// Así el vínculo producto→curso/acceso se puede hacer ANTES de que llegue el
// primer pedido (ej. el acceso Plus de un taller que aún nadie compra).
// Nunca pisa vínculos ya hechos: solo inserta claves nuevas y refresca
// variante/precio/tipo de las existentes.
//
// Variables de entorno en Vercel (nuevas):
//   SHOPIFY_SHOP_DOMAIN  → ej. mi-tienda.myshopify.com
//   SHOPIFY_ADMIN_TOKEN  → token de una app personalizada con permiso read_products
// Ya existentes: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Entrada: POST sin cuerpo. Requiere sesión de Dirección (Bearer token).
// Salida: { ok:true, nuevos, actualizados } | { ok:false, error }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHOP = (process.env.SHOPIFY_SHOP_DOMAIN || '').trim();
const TOKEN = (process.env.SHOPIFY_ADMIN_TOKEN || '').trim();

const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' };

async function esDirector(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SKEY } });
  if (!r.ok) return false;
  const u = await r.json();
  const q = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${u.id}&select=rol`, { headers: H });
  const rows = q.ok ? await q.json() : [];
  return rows[0]?.rol === 'director';
}

const nivelDe = (v) => {
  const t = String(v || '').toLowerCase();
  return /premium|premier/.test(t) ? 'premium' : /plus/.test(t) ? 'plus' : /esencial|b[aá]sico/.test(t) ? 'esencial' : null;
};
const limpia = (v) => (v && v !== 'Default Title' ? String(v).replace(/[^\p{L}\p{N}\s\/.\-·|+]/gu, '').replace(/\s+/g, ' ').trim() : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    if (!SUPABASE_URL || !SKEY) return res.status(200).json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' });
    if (!SHOP || !TOKEN) return res.status(200).json({ ok: false, error: 'Falta configurar SHOPIFY_SHOP_DOMAIN y SHOPIFY_ADMIN_TOKEN en Vercel' });
    if (!(await esDirector(req))) return res.status(401).json({ ok: false, error: 'Solo Dirección puede sincronizar productos' });

    const productos = [];
    let cursor = null;
    for (let i = 0; i < 10; i++) {
      const q = `query($c:String){products(first:50,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor}nodes{title productType variants(first:30){nodes{id title sku price}}}}}`;
      const r = await fetch(`https://${SHOP}/admin/api/2024-10/graphql.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({ query: q, variables: { c: cursor } }),
      });
      const j = await r.json();
      if (!r.ok || j.errors) return res.status(200).json({ ok: false, error: 'Shopify: ' + JSON.stringify(j.errors || j).slice(0, 300) });
      const d = j.data.products;
      productos.push(...d.nodes);
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
    }

    const existentes = await (await fetch(`${SUPABASE_URL}/rest/v1/shopify_producto_map?select=clave`, { headers: H })).json();
    const ya = new Set((existentes || []).map((x) => x.clave));
    const nuevos = [], actualizar = [];
    for (const p of productos) {
      for (const v of p.variants.nodes) {
        const vid = String(v.id).split('/').pop();
        const clave = v.sku || 'var-' + vid;
        const fila = { clave, titulo: p.title, variante: limpia(v.title), precio: Number(v.price) || null, tipo_producto: p.productType || null };
        if (ya.has(clave)) actualizar.push(fila);
        else nuevos.push({ ...fila, nivel: nivelDe(v.title), generacion_ids: [], updated_at: new Date().toISOString() });
      }
    }
    if (nuevos.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/shopify_producto_map`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(nuevos) });
      if (!r.ok) return res.status(200).json({ ok: false, error: 'No se pudo guardar: ' + (await r.text()).slice(0, 300) });
    }
    for (const f of actualizar) {
      await fetch(`${SUPABASE_URL}/rest/v1/shopify_producto_map?clave=eq.${encodeURIComponent(f.clave)}`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ variante: f.variante, precio: f.precio, tipo_producto: f.tipo_producto }),
      });
    }
    return res.status(200).json({ ok: true, nuevos: nuevos.length, actualizados: actualizar.length });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
