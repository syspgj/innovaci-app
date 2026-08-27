-- ============================================================================
-- Academia — Migración Lote 3 (observaciones de UI de Jp, 2026-08-27)
-- Correr DESPUÉS de academia_schema.sql + academia_seed_piloto.sql +
-- academia_migracion_lote1_2.sql. No borra nada existente.
-- ============================================================================

-- ── Limpieza de datos: teléfono importado del Excel con ".0" pegado ─────────
update academia_participantes
set telefono = regexp_replace(telefono, '\.0$', '')
where telefono ~ '\.0$';

-- ============================================================================
-- VIGENCIA DE PRÁCTICAS — se captura por CURSO (no por generación ni por
-- participante). `ventana_practicas_dias` ya existía; se agrega la extensión.
-- Quién goza de la extensión SÍ es por participante (un check en su ficha).
-- ============================================================================
alter table academia_cursos add column if not exists practicas_extension_dias int; -- días extra si aplica extensión
alter table academia_cursos add column if not exists practicas_totales int;        -- número total de prácticas del curso (para el grid tipo asistencia)

alter table academia_inscripciones add column if not exists practicas_extension boolean not null default false;

-- ============================================================================
-- PRÁCTICAS — corrección de modelo: YA NO es un log libre con descripción y
-- calificación por entrada (academia_practicas_registro, Lote 2). Ahora es un
-- grid de números clicables igual que la asistencia: bien/mal por número de
-- práctica, con autosuma/promedio. La tabla `academia_practicas_registro` NO
-- se borra (por si ya se capturó algo ahí durante las pruebas) pero deja de
-- usarse desde la UI a partir de este lote.
-- ============================================================================
create table if not exists academia_practicas_sesiones (
  id uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references academia_inscripciones(id) on delete cascade,
  numero_practica int not null,
  aprobada boolean not null default false,
  capturada_por uuid references usuarios(id),
  updated_at timestamptz,
  unique (inscripcion_id, numero_practica)
);
create index if not exists idx_academia_practicas_sesiones_inscripcion on academia_practicas_sesiones(inscripcion_id);

-- Evidencia y observación de prácticas: UNA sola para todo el bloque de
-- prácticas del participante (no por número individual).
alter table academia_inscripciones add column if not exists practicas_evidencia_path text;
alter table academia_inscripciones add column if not exists practicas_observaciones text;

alter table academia_practicas_sesiones enable row level security;
do $$
begin
  execute 'drop policy if exists academia_practicas_sesiones_staff_all on academia_practicas_sesiones;';
  execute 'create policy academia_practicas_sesiones_staff_all on academia_practicas_sesiones for all using (academia_es_staff()) with check (academia_es_staff());';
end $$;
revoke all on academia_practicas_sesiones from anon;

-- ============================================================================
-- CONSTANCIAS — eliminar y regenerar. Solo el rol `director` puede borrar
-- (Jp: "solo dirección puede eliminar constancias... y solo dejarlo
-- habilitado para mí" — hoy solo Jp tiene ese rol, así que esto ya cumple
-- ambas condiciones sin necesitar un caso especial por usuario).
-- ============================================================================
create or replace function academia_es_director()
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from usuarios where id = auth.uid() and rol = 'director'
  );
$$;

drop policy if exists academia_constancias_staff_all on academia_constancias;
create policy academia_constancias_staff_select on academia_constancias
  for select using (academia_es_staff());
create policy academia_constancias_staff_insert on academia_constancias
  for insert with check (academia_es_staff());
create policy academia_constancias_staff_update on academia_constancias
  for update using (academia_es_staff()) with check (academia_es_staff());
create policy academia_constancias_director_delete on academia_constancias
  for delete using (academia_es_director());

-- ============================================================================
-- Nota sobre el bucket constancias-pdf: si al eliminar una constancia hace
-- falta también borrar el PDF de Storage, el rol autenticado necesita permiso
-- de DELETE en ese bucket (política de storage.objects). Si Jp ve un error al
-- eliminar el archivo desde la app, probablemente falte esa política — el
-- borrado del registro en la tabla funciona de cualquier forma.
-- ============================================================================
