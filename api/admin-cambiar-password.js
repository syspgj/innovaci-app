// api/admin-cambiar-password.js
//
// Jp, 2026-11-18 — cambiar la contraseña de un usuario del equipo sin depender
// del correo de restablecimiento.
//
// Por qué existe: el tablero de Supabase solo ofrece "Send password recovery" y
// "Send magic link", y ambos salen por el buzón prestado de Supabase
// (noreply@mail.app.supabase.io), que entrega mal y está limitado a 2 correos
// por hora. Mientras no haya SMTP propio configurado, nadie puede recuperar su
// contraseña. Esto la cambia directo, sin correo de por medio.
//
// Reglas:
//  - Solo el director puede usarlo (se verifica contra la tabla usuarios, no
//    contra lo que mande el navegador).
//  - El usuario destino debe existir en la tabla usuarios (no se puede tocar a
//    nadie fuera del equipo).
//  - La contraseña viaja por HTTPS desde el navegador del director a este
//    servidor y de aquí a Supabase. NUNCA se escribe en la bitácora ni se
//    devuelve en la respuesta.
//
// POST /api/admin-cambiar-password
// Body: { usuario_id: "<uuid>", password: "<nueva>" }
// Cabecera: Authorization: Bearer <token de sesión de Supabase>

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const LARGO_MINIMO = 8;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no soportado' });

  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'No autorizado' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: 'Faltan variables del servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
  }

  let cuerpo = req.body;
  if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo); } catch (_) { cuerpo = {}; } }
  cuerpo = cuerpo || {};

  const usuarioId = String(cuerpo.usuario_id || '').trim();
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuarioId)) {
    return res.status(400).json({ ok: false, error: 'Falta indicar a qué usuario cambiarle la contraseña.' });
  }
  if (password.length < LARGO_MINIMO) {
    return res.status(400).json({ ok: false, error: `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.` });
  }
  if (/^\s|\s$/.test(password)) {
    return res.status(400).json({ ok: false, error: 'La contraseña no puede empezar ni terminar con espacios.' });
  }

  const cabecerasServicio = {
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  };

  try {
    // 1) ¿Quién pide el cambio?
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: auth },
    });
    if (!u.ok) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    const quien = await u.json().catch(() => ({}));
    if (!quien || !quien.id) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

    // 2) Solo dirección. El rol se lee del servidor, no del navegador.
    const rp = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(quien.id)}&select=rol,nombre`,
      { headers: cabecerasServicio }
    );
    const perfil = (await rp.json().catch(() => []))[0];
    if (!perfil || perfil.rol !== 'director') {
      return res.status(403).json({ ok: false, error: 'Solo dirección puede cambiar contraseñas.' });
    }

    // 3) El destino tiene que ser alguien del equipo.
    const tp = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=id,nombre,email,activo`,
      { headers: cabecerasServicio }
    );
    const destino = (await tp.json().catch(() => []))[0];
    if (!destino) return res.status(404).json({ ok: false, error: 'Ese usuario no está en el equipo.' });

    // 4) El cambio. La contraseña no se registra en ningún lado.
    const upd = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(usuarioId)}`, {
      method: 'PUT',
      headers: cabecerasServicio,
      body: JSON.stringify({ password }),
    });
    if (!upd.ok) {
      const detalle = await upd.text().catch(() => '');
      let msg = '';
      try { msg = JSON.parse(detalle).msg || JSON.parse(detalle).message || ''; } catch (_) { msg = ''; }
      return res.status(502).json({
        ok: false,
        error: msg || 'Supabase rechazó el cambio de contraseña (código ' + upd.status + ').',
      });
    }

    console.log('[cambiar-password] %s cambió la contraseña de %s', perfil.nombre || quien.id, destino.email || destino.id);

    return res.status(200).json({
      ok: true,
      usuario: destino.nombre || destino.email || usuarioId,
      email: destino.email || null,
      activo: destino.activo !== false,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
