// api/respond-probar.js
//
// Jp, 2026-11-18 — primer paso de la integración con Respond.io (WhatsApp).
// Este endpoint NO sincroniza nada todavía: solo comprueba que el token
// funciona y reporta QUÉ devuelve realmente la API, para construir la
// sincronización sobre datos confirmados y no sobre documentación de
// terceros (la referencia oficial de respond.io no se pudo leer desde aquí;
// la forma de la API viene de una especificación OpenAPI publicada por un
// tercero, así que hay que verificarla contra la cuenta real).
//
// El token vive solo en el servidor (variable de entorno RESPOND_API_TOKEN);
// nunca llega al navegador ni se devuelve en la respuesta.
//
// POST /api/respond-probar                      -> lista los primeros contactos
// POST /api/respond-probar?telefono=5512345678  -> busca ese contacto por teléfono
//
// Exige una sesión válida de Supabase (Authorization: Bearer <token>).

const RESPOND_TOKEN = process.env.RESPOND_API_TOKEN;
const RESPOND_BASE = process.env.RESPOND_API_BASE || 'https://api.respond.io/v2';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Deja ver el dato sin exponerlo completo en pantalla.
function tapar(v, visibles = 4) {
  const s = String(v == null ? '' : v);
  if (!s) return null;
  if (s.length <= visibles) return s;
  return s.slice(0, visibles) + '…' + s.slice(-2);
}

// Normaliza un teléfono mexicano al formato internacional que espera la API.
// Jp, 2026-11-17: "por teléfono ignorando el +52".
function normalizarTelefono(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) return '+52' + d;
  if (d.length === 12 && d.startsWith('52')) return '+' + d;
  if (d.length === 13 && d.startsWith('521')) return '+52' + d.slice(3);
  return '+' + d;
}

async function llamarRespond(ruta) {
  const url = `${RESPOND_BASE.replace(/\/+$/, '')}${ruta}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${RESPOND_TOKEN}`, Accept: 'application/json' },
  });
  const texto = await res.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch (_) { cuerpo = texto.slice(0, 400); }
  return { url, status: res.status, ok: res.ok, ms: Date.now() - t0, cuerpo };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no soportado' });
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'No autorizado' });

  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: auth },
    });
    if (!u.ok) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo validar la sesión: ' + String(e.message || e) });
  }

  if (!RESPOND_TOKEN) {
    return res.status(200).json({
      ok: false,
      falta_token: true,
      error: 'Falta la variable RESPOND_API_TOKEN en el servidor.',
      ayuda: 'En Respond.io: Settings → Integrations → Developer API → Edit → Add Access Token. Luego cápturala en Vercel (Settings → Environment Variables) con el nombre RESPOND_API_TOKEN y vuelve a desplegar.',
    });
  }

  const telefono = req.query && req.query.telefono ? String(req.query.telefono) : '';

  try {
    // 1) Listado de contactos: confirma token, ruta y forma de la respuesta.
    const lista = await llamarRespond('/contact/list?limit=3');

    const salida = {
      ok: lista.ok,
      base: RESPOND_BASE,
      listado: { ruta: '/contact/list?limit=3', status: lista.status, ms: lista.ms },
    };

    if (!lista.ok) {
      salida.error = lista.status === 401 || lista.status === 403
        ? 'El token no fue aceptado (¿se copió completo? ¿sigue activo en Respond.io?).'
        : lista.status === 404
          ? 'La ruta no existe en esta versión de la API. Hay que ajustar la dirección base o el endpoint.'
          : lista.status === 429
            ? 'Respond.io está limitando las peticiones (demasiadas por segundo). Espera un momento y vuelve a probar.'
            : 'Respond.io respondió con un error.';
      salida.respuesta_cruda = typeof lista.cuerpo === 'string' ? lista.cuerpo : JSON.stringify(lista.cuerpo).slice(0, 400);
      return res.status(200).json(salida);
    }

    const items = (lista.cuerpo && (lista.cuerpo.items || lista.cuerpo.data)) || [];
    salida.contactos_recibidos = Array.isArray(items) ? items.length : 0;
    salida.paginacion = lista.cuerpo && lista.cuerpo.pagination ? lista.cuerpo.pagination : null;
    salida.campos = Array.isArray(items) && items.length ? Object.keys(items[0]) : [];
    salida.ejemplo = Array.isArray(items) && items.length
      ? {
          id: items[0].id ?? null,
          nombre: [items[0].firstName, items[0].lastName].filter(Boolean).join(' ') || null,
          telefono: tapar(items[0].phone, 6),
          correo: tapar(items[0].email, 3),
          etiquetas: items[0].tags || null,
          asignado_a: items[0].assignee ?? null,
          campos_personalizados: Array.isArray(items[0].customFields) ? items[0].customFields.map((c) => c && c.name) : null,
        }
      : null;

    // 2) Búsqueda por teléfono, si se pidió: es la operación que usará el
    //    alta de prospectos para no duplicar contactos.
    if (telefono) {
      const tel = normalizarTelefono(telefono);
      const busca = await llamarRespond('/contact/phone:' + encodeURIComponent(tel));
      salida.busqueda = {
        telefono_enviado: tel,
        status: busca.status,
        encontrado: busca.ok,
        ms: busca.ms,
        nombre: busca.ok && busca.cuerpo ? [busca.cuerpo.firstName, busca.cuerpo.lastName].filter(Boolean).join(' ') || null : null,
        etiquetas: busca.ok && busca.cuerpo ? busca.cuerpo.tags || null : null,
        nota: busca.status === 404 ? 'Ese teléfono no existe como contacto en Respond.io.' : null,
      };
    }

    return res.status(200).json(salida);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo contactar a Respond.io: ' + String((e && e.message) || e) });
  }
}
