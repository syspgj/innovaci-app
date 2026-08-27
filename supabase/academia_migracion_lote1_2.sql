-- ============================================================================
-- Academia — Migración Lote 1 + Lote 2 (observaciones de UI de Jp)
-- Correr DESPUÉS de academia_schema.sql (y del seed). No borra nada existente.
-- ============================================================================

-- ── Inscripciones: observación libre a nivel ficha del participante ─────────
alter table academia_inscripciones add column if not exists observaciones text;

-- ── Asistencias: quién/cuándo capturó + evidencia opcional por sesión ───────
alter table academia_asistencias add column if not exists capturada_por uuid references usuarios(id);
alter table academia_asistencias add column if not exists updated_at timestamptz;
alter table academia_asistencias add column if not exists evidencia_path text; -- ruta en bucket academia-evidencias

-- ============================================================================
-- PRÁCTICAS — se reemplaza el modelo de catálogo fijo (academia_practicas /
-- academia_practicas_resultado) por un LOG libre, igual que la asistencia:
-- el personal va registrando prácticas conforme se realizan, con calificación
-- y evidencia opcional. Las tablas viejas NO se borran (por si ya tienen datos
-- capturados), simplemente dejan de usarse desde la UI a partir de este lote.
-- ============================================================================

create table if not exists academia_practicas_registro (
  id uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references academia_inscripciones(id) on delete cascade,
  fecha date not null default current_date,
  descripcion text not null,          -- qué práctica se realizó
  calificacion numeric,               -- 0-100, opcional al capturar, requerida para contar en el promedio
  evidencia_path text,                -- ruta en bucket academia-evidencias, opcional
  capturada_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_academia_practicas_registro_inscripcion on academia_practicas_registro(inscripcion_id);

-- ============================================================================
-- BITÁCORA — histórico legible de cambios de asistencia y prácticas por
-- inscripción (Jp pidió explícitamente que quede un histórico de la captura,
-- no solo el estado actual).
-- ============================================================================

create table if not exists academia_bitacora (
  id uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references academia_inscripciones(id) on delete cascade,
  tipo text not null check (tipo in ('asistencia','practica','observacion')),
  detalle text not null,               -- ej. "Sesión 4 marcada como presente"
  capturada_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_academia_bitacora_inscripcion on academia_bitacora(inscripcion_id);

-- ── RLS: mismas reglas que el resto del módulo (solo staff academia/director/administracion) ──
alter table academia_practicas_registro enable row level security;
alter table academia_bitacora enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['academia_practicas_registro','academia_bitacora']
  loop
    execute format('drop policy if exists %I_staff_all on %I;', t, t);
    execute format(
      'create policy %I_staff_all on %I for all using (academia_es_staff()) with check (academia_es_staff());',
      t, t
    );
  end loop;
end $$;

-- Aseg&uacute;rate de que anon no tenga grants sobre las tablas nuevas.
revoke all on academia_practicas_registro, academia_bitacora from anon;

-- ============================================================================
-- BUCKET DE STORAGE para evidencia de asistencia/prácticas (crear desde el
-- dashboard: Storage → New bucket → "academia-evidencias". Puede ser privado;
-- el staff siempre accede vía signed URL, igual que constancias-pdf).
-- ============================================================================
-- insert into storage.buckets (id, name, public) values ('academia-evidencias','academia-evidencias', false)
--   on conflict (id) do nothing;
