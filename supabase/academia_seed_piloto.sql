-- ============================================================================
-- Seed piloto: NOI 11.GMAY26 (26 participantes) + COI 11.GMAY26 (53 participantes)
-- Generado por Claude a partir del Google Sheet 'Constancias' (hojas roster +
-- asistencia). Correr DESPUÉS de academia_schema.sql.
--
-- NOTAS IMPORTANTES:
--  * vendedor_id se deja NULL — no había acceso a la tabla `usuarios` en vivo
--    para resolver el id; el nombre original queda en vendedor_nombre_original
--    para que un admin lo reconcilie con un UPDATE.
--  * En COI, varias personas aparecían DUPLICADAS en la hoja de asistencia del
--    Excel (mismo nombre, dos filas). Se usó la fila con más asistencias totales
--    y se descartó la otra — revisar a mano si hace falta.
--  * firmante_instructor / firmante_director vienen del mockup que compartió Jp;
--    CONFIRMAR antes de imprimir constancias reales.
-- ============================================================================

-- ── Curso y generación NOI ──────────────────────────────────────────────────
insert into academia_cursos (sistema_id, nombre, tipo, modalidad, competencias, duracion_horas, ventana_practicas_dias)
select id, 'DIPLOMADO SIIGO ASPEL NOI 2026', 'diplomado_vip', 'en_vivo', '{}', 27, 15
from academia_sistemas where clave='NOI'
on conflict do nothing;

insert into academia_generaciones (curso_id, clave, sesiones_totales)
select id, 'GMAY26', 12 from academia_cursos where nombre='DIPLOMADO SIIGO ASPEL NOI 2026'
on conflict do nothing;

-- ── Curso y generación COI ──────────────────────────────────────────────────
insert into academia_cursos (sistema_id, nombre, tipo, modalidad, competencias, duracion_horas, ventana_practicas_dias)
select id, 'DIPLOMADO SIIGO ASPEL COI 2026', 'diplomado_vip', 'en_vivo', '{}', 27, 15
from academia_sistemas where clave='COI'
on conflict do nothing;

insert into academia_generaciones (curso_id, clave, sesiones_totales)
select id, 'GMAY26', 12 from academia_cursos where nombre='DIPLOMADO SIIGO ASPEL COI 2026'
on conflict do nothing;

-- ── Firmantes (PLACEHOLDER del mockup — Jp debe confirmar antes de imprimir) ──
insert into academia_firmantes (nombre, cargo, credenciales) values
  ('Karen Hernández', 'Instructora Certificada', 'EC0217.01 | EC0301'),
  ('Josué Alcántara', 'Director General', null)
on conflict do nothing;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTICIPANTES NOI 11.GMAY26
-- ══════════════════════════════════════════════════════════════════════════
-- Guadalupe Escobedo Jiménez (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('AMBTEC');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Guadalupe Escobedo Jiménez', 'gpe.escobedo@gmail.com', '55 8060 3355', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3321.0',
    'US45', 'DIP/NOI*052645',
    '45.0', 'US45',
    '52645.0', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Araceli Rendon Lopez (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('SALVADOR BECERRIL VAZQUEZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Araceli Rendon Lopez', 'aracelyrenlo2012@hotmail.com', '5581917346.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3321.0',
    'US46', 'DIP/NOI*052646',
    '46.0', 'US46',
    '52646.0', 'DULCE', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Marco Antonio González Kuri (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' MARCO ANTONIO GONZÁLEZ KURI');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Marco Antonio González Kuri', 'marcok323@gmail.com', '228 163 7204', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3321.0',
    'US47', 'DIP/NOI*052647',
    '47.0', 'US47',
    '52647.0', 'MIREYA', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Carolina Miranda (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('REFACCIONARIA NORMANDIA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Carolina Miranda', 'mkcaro2000@hotmail.com', '55 3070 4625', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3321.0',
    'US48', 'DIP/NOI*052648',
    '48.0', 'US48',
    '52648.0', 'DULCE', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Pablo Ortega Hidalgo  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('PABLO ORTEGA HIDALGO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Pablo Ortega Hidalgo ', 'consultanegocios@hotmail.com', '442 231 00 04', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3321.0',
    'US49', 'DIP/NOI*052649',
    '49.0', 'US49',
    '52649.0', 'MIREYA', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Yucif Santano Omaña (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('PABLO ORTEGA HIDALGO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Yucif Santano Omaña', 'yucifsantano@hotmail.com', '442 317 4088', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3321.0',
    'US50', 'DIP/NOI*052650',
    '50.0', 'US50',
    '52650.0', 'MIREYA', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Daniela Guadalupe Gomez Reynoso (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('CENTRO INTEGRAL DE SEGURIDAD PRIVADA Y ESTUDIO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Daniela Guadalupe Gomez Reynoso', 'cifes.seguridad@gmail.com', '4774758236.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3321.0',
    'US51', 'DIP/NOI*052651',
    '51.0', 'US51',
    '52651.0', 'DULCE', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Sonia Martínez Muñoz  (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' SONIA MARTINEZ MUÑOZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Sonia Martínez Muñoz ', 'casaxipe.contabilidad@gmail.com', '5551949799.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3321.0',
    'US52', 'DIP/NOI*052652',
    '52.0', 'US52',
    '52652.0', 'DULCE', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Alfredo Vargas Zaragoza (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ARAUJO, GENIS Y JIMENEZ SC');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Alfredo Vargas Zaragoza', 'alfredovargas@agjsc.com.mx', ' 56 3650 7870', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3321.0',
    'US53', 'DIP/NOI*052653',
    '53.0', 'US53',
    '52653.0', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Joseph Valter Echeveste Osorno (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' JOSEPH VALTER ECHEVESTE OSORNO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Joseph Valter Echeveste Osorno', 'valter_eo@yahoo.com.ar', ' 55 4487 0282', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3321.0',
    'US54', 'DIP/NOI*052654',
    '54.0', 'US54',
    '52654.0', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Maria Guadalupe Osorio Morales (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('O&P TAX AND ACCOUNTANT');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Maria Guadalupe Osorio Morales', 'gpe.osorio@optaxaccounts.com', '55 2691 0318', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3321.0',
    'US55', 'DIP/NOI*052655',
    '55.0', 'US55',
    '52655.0', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Fabiola Evert Martínez Escalante (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('WE MAKE BUSINESS SOLUTION');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Fabiola Evert Martínez Escalante', 'evertfabm@gmail.com', '7295557203.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3321.0',
    'US56', 'DIP/NOI*052656',
    '56.0', 'US56',
    '52656.0', 'MIREYA', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Clara Berenice Lázaro Marure (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('CLARA BERENICE LAZARO MARURE');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Clara Berenice Lázaro Marure', 'contabilidad.marure@gmail.com', '5516063397.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'DULCE', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- José Alberto Nova Luna (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('JOSE ALBERTO NOVA LUNA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('José Alberto Nova Luna', 'Contactojosealbertonova@gmail.com', '55 4938 7386', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3321.0',
    'US57', 'DIP/NOI*052657',
    '57.0', 'US57',
    '52657.0', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Antonia Vanegas Sifuentes (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ANTONIA VANEGAS SIFUENTES');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Antonia Vanegas Sifuentes', 'avanegasconta@gmail.com', '8112100015.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3321.0',
    'US58', 'DIP/NOI*052658',
    '58.0', 'US58',
    '52658.0', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Juliana Berenice Zúñiga Ramírez (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARCO IVAN MACHADO ZUÑIGA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Juliana Berenice Zúñiga Ramírez', 'zuniga.jb19@gmail.com', '55 8532 0995', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Karla Margarita Santana Ochoa (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('KARLA MARGARITA SANTANA OCHOA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Karla Margarita Santana Ochoa', 'nano.jes1728@gmail.com', ' 722 254 9948', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3321.0',
    'US59', 'DIP/NOI*052659',
    '59.0', 'US59',
    '52659.0', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- María de Lourdes Delgado Camacho (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARIA DE LOURDES DELGADO CAMACHO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('María de Lourdes Delgado Camacho', 'lourdes_dc@hotmail.com', '55 1397 1548', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Alejandro Tuxpan Rojo (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('CALIZAS Y DERIBADOS');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Alejandro Tuxpan Rojo', 'facturacion@calizashgo.com', '5523209337.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MIREYA', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Sandra Elizabeth Santos Luckie (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('DIMAI');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Sandra Elizabeth Santos Luckie', 'sesluckie10@gmail.com', '7227847176.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Ernesto Meza Sierra (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ERNESTO MEZA SIERRA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Ernesto Meza Sierra', 'emezasierra@gmail.com', '24 6494 5763', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MIREYA', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Beatriz Mayen Santoyo (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('BEATRIZ MAYEN SANTOYO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Beatriz Mayen Santoyo', 'francisco5359@prodigy.net.mx', '55 1299 6109', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Iván Barrón Hernández (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('IVAN BARRON HERNANDEZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Iván Barrón Hernández', 'ivanbarron10@gmail.com', '55 3633 1868', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Josefina Muñoz Rivera (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('JOSEFINA MUÑOZ RIVERA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Josefina Muñoz Rivera', 'rh@ipehz.com.mx', '5534338630.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Fabiola Francisca Mariscal Molina (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('FABIOLA FRANCISCA MARISCAL MOLINA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Fabiola Francisca Mariscal Molina', 'fabymar75@hotmail.com', '55 3149 6732', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'MANUEL ', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

--  Maria de Lourdes Barbara Lozada de la Cruz  (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL NOI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARIA DE LOURDES BARBARA LOZADA DE LA CRUZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values (' Maria de Lourdes Barbara Lozada de la Cruz ', 'blc1605@hotmail.com', '5540019585.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('NOI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'DULCE', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTICIPANTES COI 11.GMAY26
-- ══════════════════════════════════════════════════════════════════════════
-- Elizabeth Solares Flores (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ELIZABETH SOLARES FLORES');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Elizabeth Solares Flores', 'esolares0908@gmail.com', '5539557286.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3131.0',
    'US35', 'DIPNOI*052635',
    '35.0', 'US35',
    '52635.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Jazmín Morales Garcia (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('INSIDE BUSINESS MEXICO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Jazmín Morales Garcia', 'jazmin.morales@corp-mx.com', '993 238 3595', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3131.0',
    'US33', 'DIPNOI*052633',
    '33.0', 'US33',
    '52633.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- José Alberto Nova Luna (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('JOSE ALBERTO NOVA LUNA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('José Alberto Nova Luna', 'Contactojosealbertonova@gmail.com', '55 4938 7386', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3131.0',
    'US34', 'DIPNOI*052634',
    '34.0', 'US34',
    '52634.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Jose Jorge Morales Nolasco (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('JOSE JORGE MORALES NOLASCO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Jose Jorge Morales Nolasco', 'moralesymorales5@hotmail.com', '2224586200.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3131.0',
    'US36', 'DIPNOI*052636',
    '36.0', 'US36',
    '52636.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Margarita Gomez Cadena (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARGARITA GOMEZ CADENA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Margarita Gomez Cadena', 'marga_gc_mx@yahoo.com', '55 2727 0853', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3131.0',
    'US37', 'DIPNOI*052637',
    '37.0', 'US37',
    '52637.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Leticia Salas Dorantes  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('LETICIA SALAS DORANTES');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Leticia Salas Dorantes ', 'salasleticia@hotmail.com', '7711886446.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US03', 'DIPNOI*052603',
    '3.0', 'US03',
    '52603.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- María Elena Miguel Montes  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('TRANSPORTES TORNADO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('María Elena Miguel Montes ', 'marvd3518@gmail.com', ' 56 33 59 2772', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US04', 'DIPNOI*052604',
    '4.0', 'US04',
    '52604.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- José Manuel Abaroa Abaroa   (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARIA EMILIA GERALDO HIRALES');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('José Manuel Abaroa Abaroa  ', 'josemabaroa22@gmail.com', '61 22 21 62 87', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US05', 'DIPNOI*052605',
    '5.0', 'US05',
    '52605.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Miguel Espino Ramírez (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MINERZIM');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Miguel Espino Ramírez', 'mespino.minerzim@gmail.com', '7727364460.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US06', 'DIPNOI*052606',
    '6.0', 'US06',
    '52606.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- José Luis Paz Villarreal  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' JOSE LUIS PAZ VILLARREAL');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('José Luis Paz Villarreal ', 'vga.contadoresasesores@hotmail.com', '55 5405 4118', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US07', 'DIPNOI*052607',
    '7.0', 'US07',
    '52607.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Marco Antonio Rocha Gaxiola (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' ISO, COMPUTO Y TECNOLOGIAS');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Marco Antonio Rocha Gaxiola', 'margaxiola@hotmail.com', '555 433 2583', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US08', 'DIPNOI*052608',
    '8.0', 'US08',
    '52608.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Hortencia Hernández Jardon  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('HORTENCIA HERNANDEZ JARDON ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Hortencia Hernández Jardon ', 'hortej50@gmail.com', '55 7985 8604', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US09', 'DIPNOI*052609',
    '9.0', 'US09',
    '52609.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Jazmín García Cordero (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('YAZMIN GARCIA CORDERO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Jazmín García Cordero', 'contavazga21@gmail.com', ' 55 3201 2630', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US10', 'DIPNOI*052610',
    '10.0', 'US10',
    '52610.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- María del Carmen Martínez Vergara (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARIA DEL CARMEN MARTINEZ VERGARA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('María del Carmen Martínez Vergara', 'marycarmenmartinezvergara@gmail.com', '747 125 6394', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3131.0',
    'US30', 'DIPNOI*052630',
    '30.0', 'US30',
    '52630.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Marco Antonio Velázquez Rivera (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARCO ANTONIO VELAZQUEZ RIVERA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Marco Antonio Velázquez Rivera', 'marco.velr@despachovelazquez.com', ' 55 1153 7320', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US11', 'DIPNOI*052611',
    '11.0', 'US11',
    '52611.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Erica Roxana Porcayo Albino (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('SEMILLAS GAYLAND WARD MEXICO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Erica Roxana Porcayo Albino', 'ericaporcayo@hotmail.com', '5527327257.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US12', 'DIPNOI*052612',
    '12.0', 'US12',
    '52612.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Daniel Lopez Sotelo (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('SEMILLAS GAYLAND WARD MEXICO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Daniel Lopez Sotelo', 'dniells1977@hotmail.com', '6671750870.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US13', 'DIPNOI*052613',
    '13.0', 'US13',
    '52613.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Patricia Barron Cortes (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ISRAEL STEMPA Y ASOCIADOS');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Patricia Barron Cortes', 'patr6009215@yahoo.com.mx', '5515804488.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US14', 'DIPNOI*052614',
    '14.0', 'US14',
    '52614.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Jose Juan Anaya Sanchez  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('JOSE JUAN ANAYA SANCHEZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Jose Juan Anaya Sanchez ', 'anaya_jose_99@outlook.com', '772 106 0591', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US15', 'DIPNOI*052615',
    '15.0', 'US15',
    '52615.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Susana Arredondo Barajas (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' GRACIELA ANGUIANO ZAVALA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Susana Arredondo Barajas', 'susana_agro@hotmail.com', '4621311187.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US16', 'DIPNOI*052616',
    '16.0', 'US16',
    '52616.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Mónica Patricia Colmenero Franco  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MONICA PATRICIA COLMENERO FRANCO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Mónica Patricia Colmenero Franco ', 'colmeneropat@gmail.com', '5566701295.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US17', 'DIPNOI*052617',
    '17.0', 'US17',
    '52617.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Marco Antonio González Kuri (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARCO ANTONIO GONZÁLEZ KURI');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Marco Antonio González Kuri', 'marcok323@gmail.com', ' 228 163 7204', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3131.0',
    'US32', 'DIPNOI*052632',
    '32.0', 'US32',
    '52632.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Miriam Sandoval Rodríguez (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MIRIAM SANDOVAL RODRIGUEZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Miriam Sandoval Rodríguez', 'luaran@hotmail.com', '5578689863.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Febe Yin Gonzalez Nava  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('DINAMISMO EN PLASTICO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Febe Yin Gonzalez Nava ', 'contabilidad@dinamismo.mx', '5560915910.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US18', 'DIPNOI*052618',
    '18.0', 'US18',
    '52618.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Catalina Matadamas Martinez  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('DINAMISMO EN PLASTICO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Catalina Matadamas Martinez ', 'catym783@hotmail.com', '55 4822 7959', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US19', 'DIPNOI*052619',
    '19.0', 'US19',
    '52619.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Margarita Ruiz Hernández  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ARNULFO VALDEZ CRUZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Margarita Ruiz Hernández ', 'magos_america@hotmail.com', '7767696433.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US20', 'DIPNOI*052620',
    '20.0', 'US20',
    '52620.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Cecilia Rodiles Garibay (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' FRUTAS Y LEGUMBRES LA SOLEDAD');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Cecilia Rodiles Garibay', 'crodiles31@gmail.com', '3511110698.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US21', 'DIPNOI*052621',
    '21.0', 'US21',
    '52621.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Ana Laura Montes Hernández  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('FRANCISCO JAVIER RAMIREZ SANCHEZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Ana Laura Montes Hernández ', 'contabilidad1@mmgconsultores.com.mx', '5545008940.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US22', 'DIPNOI*052622',
    '22.0', 'US22',
    '52622.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Claudia Iliana González Soledad (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('CLAUDIA ILIANA GONZALEZ SOLEDAD');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Claudia Iliana González Soledad', 'c.iliana.glez@gmail.com', '228 304 1601', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US23', 'DIPNOI*052623',
    '23.0', 'US23',
    '52623.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Rosa María Olvera Tapia (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ROSA MARIA OLVERA TAPIA ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Rosa María Olvera Tapia', 'rosyolverat@hotmail.com', ' 55 2860 0265', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US24', 'DIPNOI*052624',
    '24.0', 'US24',
    '52624.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Maria de Lourdes Barbara Lozada de la Cruz  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARIA DE LOURDES BARBARA LOZADA DE LA CRUZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Maria de Lourdes Barbara Lozada de la Cruz ', 'blc1605@hotmail.com', '5540019585.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US25', 'DIPNOI*052625',
    '25.0', 'US25',
    '52625.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- María Del Refugio De Anda Esqueda (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' MARIA DEL REFUGIO DE ANDA ESQUEDA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('María Del Refugio De Anda Esqueda', 'de_anda_cuca@hotmail.com', '5585481705.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US26', 'DIPNOI*052626',
    '26.0', 'US26',
    '52626.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Ana Rosa Rives Romero (plus)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' ANA ROSA RIVES ROMERO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Ana Rosa Rives Romero', 'anarosarivesromero@gmail.com', '5529552466.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'P');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'plus', '3131.0',
    'US29', 'DIPNOI*052629',
    '29.0', 'US29',
    '52629.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Suyit Luevano Robles  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' ARAUJO, GENIS Y JIMENEZ SC');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Suyit Luevano Robles ', 'cp.sluevano@gmail.com', ' 55 6857 0535', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US27', 'DIPNOI*052627',
    '27.0', 'US27',
    '52627.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Juliana Berenice Zúñiga Ramírez (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARCO IVAN MACHADO ZUÑIGA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Juliana Berenice Zúñiga Ramírez', 'zuniga.jb19@gmail.com', '55 8532 0995', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Marcelino Campos Sánchez  (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARCELINO CAMPOS SANCHEZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Marcelino Campos Sánchez ', 'jafete1@hotmail.com', '2223787995.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US28', 'DIPNOI*052628',
    '28.0', 'US28',
    '52628.0', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Claudia Avendaño Sánchez (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente(' NAVAPACK');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Claudia Avendaño Sánchez', 'claudiaavendanosanchez@gmail.com', ' 55 2675 2453', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US31', 'DIPNOI*052631',
    '31.0', 'US31',
    '52631.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Jaime Esquivel Zepeda (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('JAIME ESQUIVEL ZEPEDA');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Jaime Esquivel Zepeda', 'Jaime_esquivelzepeda@outlook.com', '7224634349.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;

-- Araceli Walles Gonzalez (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ARACELI WALLES GONZALEZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Araceli Walles Gonzalez', 'arawalles@hotmail.com', '5527293656.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Glenys Amelia Radilla Ramos (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('GLENYS AMELIA RADILLA RAMOS');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Glenys Amelia Radilla Ramos', 'radillaglen@gmail.com', '7772728049.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Delia Juárez Lucas (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('WIRELESS BRIDGE');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Delia Juárez Lucas', 'delia@inetmexico.mx', '5530490904.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Mary Carmen Rubio Castillo (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('MARY CARMEN RUBIO CASTILLO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Mary Carmen Rubio Castillo', 'mrubio721120@gmail.com', '55 3102 2732', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Leon Hermenegildo Santos (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('LEON HERMENEGILDO SANTOS');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Leon Hermenegildo Santos', 'grupoalfa201120@gmail.com', '5513983814.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Faustina Cecilia Lázaro Ascencio (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('CILMA CONTADORES Y ABOGADOS SC');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Faustina Cecilia Lázaro Ascencio', 'lazarocecilia@outlook.com', '2722199220.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Eduardo Aquino Maldonado (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('EDUARDO AQUINO MALDONADO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Eduardo Aquino Maldonado', 'aquinoconta@yahoo.com.mx', '5556197391.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Graciela Flores López (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('LA PERLA DEL SUR MATERIAS PRIMAS LOGISTIC');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Graciela Flores López', 'gracielafloresl@hotmail.com', '5543545381.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Hugo Mejía García (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('SERVICIOS SOCIALES DE ATLIXCO');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Hugo Mejía García', 'contabilidad.fubepssa@gmail.com', '222 375 9628', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Patricia Mejía Trejo (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('HAMT WORKERS CONSTRUCTION');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Patricia Mejía Trejo', 'patricia.mejia@chabely.com.mx', '4271092631.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- María Diana Mejía Trejo (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('HAMT WORKERS CONSTRUCTION');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('María Diana Mejía Trejo', 'diana.mejia@chabely.com.mx', '4271640317.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Francisco Javier Martínez Muñoz (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('FRANCISCO JAVIER MARTINEZ');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Francisco Javier Martínez Muñoz', 'pacomtzmunoz@gmail.com', '2223973404.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Abraham Saldaña Ponce (esencial)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('US TECHNOLOGIES');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Abraham Saldaña Ponce', 'asaldana@ust.com.mx', '55 1613 3107', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'E');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'esencial', 'N/A',
    'N/A', 'N/A',
    'N/A', 'N/A',
    'N/A', 'Mireya', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Ernesto Javier Rojas Morales (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('ENRIQUE JAVIER ROJAS MORALES');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Ernesto Javier Rojas Morales', 'ernesro.rojas@contaxpertos.com', '771 776 2787', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US38', 'DIPNOI*052638',
    '38.0', 'US38',
    '52638.0', 'Manuel', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, false);
end $$;

-- Emily Yadira Sanchez Barragan (premium)
do $$
declare
  v_cliente_id uuid;
  v_participante_id uuid;
  v_generacion_id uuid;
  v_inscripcion_id uuid;
  v_folio text;
begin
  select g.id into v_generacion_id from academia_generaciones g
    join academia_cursos c on c.id=g.curso_id
    where c.nombre='DIPLOMADO SIIGO ASPEL COI 2026' and g.clave='GMAY26';

  v_cliente_id := academia_find_or_create_cliente('CONSTRUCTORA POO IZCALLI');

  insert into academia_participantes (nombre, mail, telefono, cliente_cartera_id)
  values ('Emily Yadira Sanchez Barragan', 'cp.emilysanchez@gmail.com', '5611693514.0', v_cliente_id)
  returning id into v_participante_id;

  v_folio := academia_generar_folio('COI11', 'GMAY26', 'PM');

  insert into academia_inscripciones (
    participante_id, generacion_id, nivel_acceso, servidor, usuario_rdp, contrasena_rdp,
    empresa_aspel, usuario_aspel, contrasena_aspel, vendedor_nombre_original, folio
  ) values (
    v_participante_id, v_generacion_id, 'premium', '3131.0',
    'US39', 'DIPNOI*052639',
    '39.0', 'US39',
    '52639.0', 'Dulce', v_folio
  ) returning id into v_inscripcion_id;

  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 1, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 2, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 3, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 4, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 5, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 6, true);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 7, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 8, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 9, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 10, false);
  insert into academia_asistencias (inscripcion_id, numero_sesion, asistio) values (v_inscripcion_id, 11, true);
end $$;
