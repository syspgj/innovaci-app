// api/admin-usuario-editar.js
//
// Jp, 2026-11-18 — corregir el nombre o el correo de alguien del equipo desde la
// app, sin entrar a Supabase.
//
// Por qué existe: el nombre vive en la tabla `usuarios` (es el que se ve en
// toda la app) y el correo vive en DOS lugares — en `usuarios` y en el sistema
// de acceso de Supabase (`auth.users`), que es con el que la persona entra. Si
// solo se cambia uno de los dos, la app muestra un correo y el acceso pide
// otro. Este endpoint los mantiene iguales siempre.
//
// Reglas:
//  - Solo el director (se verifica contra la tabla usuarios, no contra lo que
//    mande el navegador).
//  - El usuario destino debe existir en la tabla usuarios.
//  - Al cambiar el correo se marca como confirmado, para que la persona pueda
//    entrar de inmediato sin esperar un correo de verificación (que hoy no
//    llega, porque no hay SMTP propio configurado).
//
// POST /api/admin-usuario-editar
// Body: { usuario_id: "<uuid>", nombre?: "...", email?: "..." }
// Cabecera: Authorization: Bearer <token de sesión de Supabase>

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const nombre = cuerpo.nombre == null ? null : String(cuerpo.nombre).trim().replace(/\s+/g, ' ');
  const email = cuerpo.email == null ? null : String(cuerpo.email).trim().toLowerCase();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuarioId)) {
    return res.status(400).json({ ok: false, error: 'Falta indicar a qué usuario modificar.' });
  }
  if (nombre !== null && (nombre.length < 2 || nombre.length > 80)) {
    return res.status(400).json({ ok: false, error: 'El nombre debe tener entre 2 y 80 letras.' });
  }
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Ese correo no tiene una forma válida.' });
  }
  if (nombre === null && email === null) {
    return res.status(400).json({ ok: false, error: 'No hay nada que cambiar.' });
  }

  const cabeceras = {
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

    // 2) Solo dirección.
    const rp = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(quien.id)}&select=rol,nombre`,
      { headers: cabeceras }
    );
    const perfil = (await rp.json().catch(() => []))[0];
    if (!perfil || perfil.rol !== 'director') {
      return res.status(403).json({ ok: false, error: 'Solo dirección puede modificar usuarios.' });
    }

    // 3) El destino tiene que ser alguien del equipo.
    const tp = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=id,nombre,email`,
      { headers: cabeceras }
    );
    const destino = (await tp.json().catch(() => []))[0];
    if (!destino) return res.status(404).json({ ok: false, error: 'Ese usuario no está en el equipo.' });

    // 4) Si cambia el correo: que no lo tenga ya alguien más del equipo.
    if (email && email !== String(destino.email || '').toLowerCase()) {
      const dup = await fetch(
        `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}&select=id,nombre`,
        { headers: cabeceras }
      );
      const yaEsta = (await dup.json().catch(() => [])).filter((x) => x.id !== usuarioId);
      if (yaEsta.length) {
        return res.status(409).json({ ok: false, error: `Ese correo ya lo usa ${yaEsta[0].nombre || 'otro usuario'}.` });
      }
    }

    const cambios = [];

    // 5) El correo, primero en el sistema de acceso. Si falla ahí, no se toca
    //    nada más: así nunca quedan los dos lados distintos.
    if (email && email !== String(destino.email || '').toLowerCase()) {
      const upd = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(usuarioId)}`, {
        method: 'PUT',
        headers: cabeceras,
        body: JSON.stringify({ email, email_confirm: true }),
      });
      if (!upd.ok) {
        const detalle = await upd.text().catch(() => '');
        let msg = '';
        try { const j = JSON.parse(detalle); msg = j.msg || j.message || j.error_description || ''; } catch (_) { msg = ''; }
        return res.status(502).json({ ok: false, error: msg || 'Supabase rechazó el cambio de correo (código ' + upd.status + ').' });
      }
      cambios.push('correo');
    }

    // 6) La tabla de la app.
    const patch = {};
    if (nombre !== null && nombre !== destino.nombre) { patch.nombre = nombre; cambios.push('nombre'); }
    if (email && email !== String(destino.email || '').toLowerCase()) patch.email = email;
    if (Object.keys(patch).length) {
      const pr = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(usuarioId)}`, {
        method: 'PATCH',
        headers: { ...cabeceras, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (!pr.ok) {
        const detalle = await pr.text().catch(() => '');
        return res.status(502).json({
          ok: false,
          error: 'El correo sí se cambió en el acceso, pero no se pudo guardar en la tabla de usuarios: ' + detalle.slice(0, 200),
        });
      }
    }

    if (!cambios.length) return res.status(200).json({ ok: true, sin_cambios: true, usuario: destino.nombre });

    console.log('[usuario-editar] %s modificó %s de %s', perfil.nombre || quien.id, cambios.join(' y '), destino.email || destino.id);

    return res.status(200).json({
      ok: true,
      cambios,
      usuario: nombre || destino.nombre,
      email: email || destino.email || null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
