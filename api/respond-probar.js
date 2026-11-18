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

async function llamarRespond(ruta, metodo, cuerpoEnviado) {
  const url = `${RESPOND_BASE.replace(/\/+$/, '')}${ruta}`;
  const t0 = Date.now();
  const opciones = {
    method: metodo || 'GET',
    headers: { Authorization: `Bearer ${RESPOND_TOKEN}`, Accept: 'application/json' },
  };
  if (cuerpoEnviado) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpoEnviado);
  }
  const res = await fetch(url, opciones);
  const texto = await res.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch (_) { cuerpo = texto.slice(0, 400); }
  return { url, ruta, metodo: opciones.method, status: res.status, ok: res.ok, ms: Date.now() - t0, cuerpo };
}

// Saca la lista de contactos venga como venga (items/data/contacts/arreglo suelto).
function sacarItems(cuerpo) {
  if (!cuerpo) return null;
  if (Array.isArray(cuerpo)) return cuerpo;
  for (const k of ['items', 'data', 'contacts', 'results', 'records']) {
    if (Array.isArray(cuerpo[k])) return cuerpo[k];
  }
  return null;
}

function mensajeDeError(c) {
  if (!c) return '';
  if (typeof c === 'string') return c.slice(0, 200);
  return String(c.message || c.error || JSON.stringify(c)).slice(0, 200);
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
    // 1) Listado de contactos. La ruta real no está confirmada: GET /contact/list
    //    devolvió 400 "Identifier list is invalid", o sea que el servidor la leyó
    //    como GET /contact/{identificador}. Así que se prueban varias formas en
    //    orden y se reporta cuál funcionó, para dejar la buena en el código.
    const intentos = [
      { ruta: '/contact/list', metodo: 'POST', cuerpo: { limit: 3 } },
      { ruta: '/contact/list', metodo: 'POST', cuerpo: { limit: 3, search: '' } },
      { ruta: '/contact', metodo: 'GET' },
      { ruta: '/contact?limit=3', metodo: 'GET' },
      { ruta: '/contacts?limit=3', metodo: 'GET' },
      { ruta: '/contact/list?limit=3', metodo: 'GET' },
    ];
    const probados = [];
    let lista = null;
    for (const it of intentos) {
      const r = await llamarRespond(it.ruta, it.metodo, it.cuerpo);
      probados.push({
        intento: it.metodo + ' ' + it.ruta,
        status: r.status,
        detalle: r.ok ? 'ok' : mensajeDeError(r.cuerpo),
      });
      if (r.ok && sacarItems(r.cuerpo)) { lista = r; break; }
      // Pausa corta: la API limita peticiones por segundo.
      await new Promise((ok) => setTimeout(ok, 220));
    }

    const salida = {
      ok: !!lista,
      base: RESPOND_BASE,
      token_aceptado: !probados.some((x) => x.status === 401 || x.status === 403),
      intentos: probados,
      listado: lista ? { ruta: lista.metodo + ' ' + lista.ruta, status: lista.status, ms: lista.ms } : null,
    };

    if (!lista) {
      const auth = probados.find((x) => x.status === 401 || x.status === 403);
      salida.error = auth
        ? 'El token no fue aceptado (¿se copió completo? ¿sigue activo en Respond.io?).'
        : 'El token funciona, pero ninguna de las rutas de listado probadas respondió. Abajo está lo que contestó cada una; con eso se ajusta el código.';
      // La búsqueda por teléfono se intenta de todas formas: esa ruta sí existe.
      if (telefono) {
        const tel = normalizarTelefono(telefono);
        const busca = await llamarRespond('/contact/phone:' + encodeURIComponent(tel));
        salida.busqueda = {
          telefono_enviado: tel, status: busca.status, encontrado: busca.ok, ms: busca.ms,
          nombre: busca.ok && busca.cuerpo ? [busca.cuerpo.firstName, busca.cuerpo.lastName].filter(Boolean).join(' ') || null : null,
          etiquetas: busca.ok && busca.cuerpo ? busca.cuerpo.tags || null : null,
          campos: busca.ok && busca.cuerpo ? Object.keys(busca.cuerpo) : null,
          nota: busca.status === 404 ? 'Ese teléfono no existe como contacto en Respond.io.' : mensajeDeError(busca.cuerpo) || null,
        };
      }
      return res.status(200).json(salida);
    }

    const items = sacarItems(lista.cuerpo) || [];
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
        campos: busca.ok && busca.cuerpo ? Object.keys(busca.cuerpo) : null,
        nota: busca.status === 404 ? 'Ese teléfono no existe como contacto en Respond.io.' : mensajeDeError(busca.cuerpo) || null,
      };
    }

    return res.status(200).json(salida);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo contactar a Respond.io: ' + String((e && e.message) || e) });
  }
}
