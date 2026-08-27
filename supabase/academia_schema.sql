-- ============================================================================
-- Módulo Academia / Constancias — Esquema piloto (NOI 11.GMAY26 + COI 11.GMAY26)
-- Correr manualmente en el SQL Editor de Supabase del proyecto App VENTAS.
-- No borra ni modifica ninguna tabla existente (clientes_cartera, usuarios, etc.)
-- ============================================================================

-- ── Extensión necesaria para uuid ───────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── Rol nuevo en usuarios ────────────────────────────────────────────────────
-- La tabla `usuarios` ya existe con una columna `rol`. Si tiene un CHECK
-- constraint que enumera los roles válidos, hay que agregar 'academia' ahí.
-- Descomentar y ajustar el nombre del constraint si aplica:
-- alter table usuarios drop constraint if exists usuarios_rol_check;
-- alter table usuarios add constraint usuarios_rol_check
--   check (rol in ('director','vendedor','telemarketing','administracion','asesor','mesa_control','academia'));

-- ============================================================================
-- CATÁLOGOS
-- ============================================================================

create table if not exists academia_sistemas (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,        -- 'NOI', 'COI', 'SAE', 'SIIGO'
  nombre text not null,              -- 'Aspel Nóminas', 'Aspel Contabilidad'
  created_at timestamptz not null default now()
);

create table if not exists academia_cursos (
  id uuid primary key default gen_random_uuid(),
  sistema_id uuid not null references academia_sistemas(id),
  nombre text not null unique,
  tipo text not null check (tipo in ('diplomado_vip','24_7','empresarial','taller')),
  modalidad text not null,           -- 'en_vivo', '24_7', 'in_company'
  competencias text[] default '{}', -- bullets para la constancia
  descripcion text,
  duracion_horas numeric,
  ventana_practicas_dias int,        -- 15, 30, etc. NULL si no aplica
  created_at timestamptz not null default now()
);

create table if not exists academia_generaciones (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references academia_cursos(id),
  clave text not null,               -- 'GMAY26'
  fecha_inicio date,
  fecha_fin date,
  sesiones_totales int,
  created_at timestamptz not null default now(),
  unique (curso_id, clave)
);

create table if not exists academia_firmantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  cargo text not null,
  credenciales text,                 -- ej. 'EC0217.01 | EC0301'
  url_firma text,                    -- imagen de firma en Storage
  created_at timestamptz not null default now()
);

-- ============================================================================
-- PARTICIPANTES E INSCRIPCIONES
-- ============================================================================

create table if not exists academia_participantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  mail text,
  telefono text,
  cliente_cartera_id uuid references clientes_cartera(id),  -- "cuenta principal"
  created_at timestamptz not null default now()
);

create table if not exists academia_inscripciones (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references academia_participantes(id),
  generacion_id uuid not null references academia_generaciones(id),
  nivel_acceso text not null check (nivel_acceso in ('esencial','plus','premium')),
  tipo text not null default 'entero' check (tipo in ('entero','cortesia')),
  servidor text,
  usuario_rdp text,
  contrasena_rdp text,
  empresa_aspel text,
  usuario_aspel text,
  contrasena_aspel text,
  vendedor_id uuid references usuarios(id),
  vendedor_nombre_original text, -- nombre tal como venía en el Excel (Claude no tiene acceso a `usuarios` en vivo para resolver el id; un admin debe reconciliar vendedor_id a mano o vía UPDATE)
  folio text not null unique,
  created_at timestamptz not null default now(),
  unique (participante_id, generacion_id)
);

create index if not exists idx_academia_inscripciones_generacion on academia_inscripciones(generacion_id);
create index if not exists idx_academia_inscripciones_folio_prefix on academia_inscripciones(folio text_pattern_ops);

-- ============================================================================
-- ASISTENCIA Y PRÁCTICAS
-- ============================================================================

create table if not exists academia_asistencias (
  id uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references academia_inscripciones(id) on delete cascade,
  numero_sesion int not null,
  fecha_sesion date,
  asistio boolean not null default false,
  unique (inscripcion_id, numero_sesion)
);

create table if not exists academia_practicas (
  id uuid primary key default gen_random_uuid(),
  generacion_id uuid not null references academia_generaciones(id),
  nombre text not null,
  orden int not null default 1
);

create table if not exists academia_practicas_resultado (
  id uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references academia_inscripciones(id) on delete cascade,
  practica_id uuid not null references academia_practicas(id),
  aprobada boolean not null default false,
  fecha date,
  capturada_por uuid references usuarios(id),
  unique (inscripcion_id, practica_id)
);

-- ============================================================================
-- CONSTANCIAS
-- ============================================================================

create table if not exists academia_constancias (
  id uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references academia_inscripciones(id),
  tipo text not null check (tipo in ('participacion','aprobacion','acreditacion')),
  folio text not null unique,        -- mismo folio que academia_inscripciones.folio
  fecha_emision date not null default current_date,
  calificacion numeric,
  estatus text not null default 'vigente' check (estatus in ('vigente','revocada')),
  firmante_instructor_id uuid references academia_firmantes(id),
  firmante_director_id uuid references academia_firmantes(id),
  pdf_path text,                     -- ruta en Supabase Storage (bucket constancias-pdf)
  apellido_normalizado text not null, -- minúsculas sin acentos, para el 2do factor de verificación
  created_at timestamptz not null default now()
);

create index if not exists idx_academia_constancias_folio on academia_constancias(folio);

-- ============================================================================
-- FUNCIÓN: generación de folio (evita colisiones, formato acordado con Jp)
-- Formato: SISTEMA+VERSION-GENERACION-ACCESO-CONSECUTIVO(3)-ALEATORIO(5)
-- Ej: NOI11-GMAY26-P-001-7XQK2   (E=Esencial, P=Plus, PM=Premium)
-- ============================================================================

create or replace function academia_generar_folio(p_sistema text, p_generacion text, p_acceso text)
returns text
language plpgsql
as $$
declare
  v_consecutivo int;
  v_random text;
  v_prefijo text;
  v_folio text;
  v_intentos int := 0;
begin
  v_prefijo := p_sistema || '-' || p_generacion || '-' || p_acceso;
  select count(*) + 1 into v_consecutivo
  from academia_inscripciones
  where folio like v_prefijo || '-%';

  loop
    v_random := (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (floor(random()*33)+1)::int, 1), '')
      from generate_series(1,5)
    );
    v_folio := v_prefijo || '-' || lpad(v_consecutivo::text,3,'0') || '-' || v_random;
    exit when not exists (select 1 from academia_inscripciones where folio = v_folio);
    v_intentos := v_intentos + 1;
    if v_intentos > 20 then
      raise exception 'No se pudo generar un folio único tras 20 intentos';
    end if;
  end loop;

  return v_folio;
end;
$$;

-- ============================================================================
-- FUNCIÓN: buscar o crear cuenta en clientes_cartera (la "cuenta principal")
-- ADVERTENCIA: Claude construyó esto por análisis estático del código de
-- index.html (columnas vistas: razon_social, rfc, num_cliente, origen,
-- vendedor_asignado, estado). No hay acceso a la base de datos en vivo desde
-- esta sesión, así que un admin debe validar que estas columnas y sus tipos
-- coinciden exactamente antes de correr el seed. Si `clientes_cartera` no
-- tiene un índice/constraint único sobre razon_social, esta función puede
-- crear duplicados si se corre más de una vez — revisar antes de reusar.
-- ============================================================================

create or replace function academia_find_or_create_cliente(p_razon_social text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_razon_social is null or trim(p_razon_social) = '' then
    return null;
  end if;

  select id into v_id
  from clientes_cartera
  where lower(trim(razon_social)) = lower(trim(p_razon_social))
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into clientes_cartera (razon_social, num_cliente, origen)
  values (trim(p_razon_social), 'ACAD-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||substr(md5(random()::text),1,4), 'alta_academia')
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
-- RLS: helper de autorización (reutilizable en todas las políticas)
-- ============================================================================

create or replace function academia_es_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid()
      and rol in ('academia','director','administracion')
      and coalesce(activo, true) = true
  );
$$;

-- ── Habilitar RLS en todas las tablas nuevas ────────────────────────────────
alter table academia_sistemas enable row level security;
alter table academia_cursos enable row level security;
alter table academia_generaciones enable row level security;
alter table academia_firmantes enable row level security;
alter table academia_participantes enable row level security;
alter table academia_inscripciones enable row level security;
alter table academia_asistencias enable row level security;
alter table academia_practicas enable row level security;
alter table academia_practicas_resultado enable row level security;
alter table academia_constancias enable row level security;

-- ── Políticas: solo staff autenticado (academia/director) puede leer/escribir ──
do $$
declare
  t text;
begin
  foreach t in array array[
    'academia_sistemas','academia_cursos','academia_generaciones','academia_firmantes',
    'academia_participantes','academia_inscripciones','academia_asistencias',
    'academia_practicas','academia_practicas_resultado','academia_constancias'
  ]
  loop
    execute format('drop policy if exists %I_staff_all on %I;', t, t);
    execute format(
      'create policy %I_staff_all on %I for all using (academia_es_staff()) with check (academia_es_staff());',
      t, t
    );
  end loop;
end $$;

-- ============================================================================
-- VISTA PÚBLICA DE VERIFICACIÓN — única superficie accesible sin sesión
-- IMPORTANTE: proyecta solo columnas seguras. Nunca hacer `select *` aquí.
-- Corre con los privilegios del dueño de la vista (no security_invoker), por lo
-- que SÍ puede leer las tablas base aunque RLS bloquee a `anon` sobre ellas —
-- por eso el filtro de columnas de este SELECT es el único control de acceso
-- real. Revisar con cuidado antes de agregar columnas nuevas.
-- ============================================================================

create or replace view academia_constancias_publicas as
select
  c.folio,
  c.apellido_normalizado, -- usado SOLO como filtro server-side (segundo factor); el frontend nunca debe mostrar esta columna
  c.tipo,
  c.fecha_emision,
  c.calificacion,
  c.estatus,
  p.nombre as participante_nombre,
  cu.nombre as curso_nombre,
  s.clave as sistema,
  g.clave as generacion,
  cu.modalidad,
  fi.nombre as instructor_nombre,
  fi.cargo as instructor_cargo,
  fi.credenciales as instructor_credenciales,
  fd.nombre as director_nombre,
  fd.cargo as director_cargo
from academia_constancias c
join academia_inscripciones i on i.id = c.inscripcion_id
join academia_participantes p on p.id = i.participante_id
join academia_generaciones g on g.id = i.generacion_id
join academia_cursos cu on cu.id = g.curso_id
join academia_sistemas s on s.id = cu.sistema_id
left join academia_firmantes fi on fi.id = c.firmante_instructor_id
left join academia_firmantes fd on fd.id = c.firmante_director_id
where c.estatus = 'vigente';

grant select on academia_constancias_publicas to anon;
-- Aseg&uacute;rate de que NINGUNA tabla base tenga grants directos a `anon`:
revoke all on academia_sistemas, academia_cursos, academia_generaciones, academia_firmantes,
  academia_participantes, academia_inscripciones, academia_asistencias, academia_practicas,
  academia_practicas_resultado, academia_constancias
  from anon;

-- ============================================================================
-- BUCKET DE STORAGE para PDFs de constancias y firmas (correr aparte si el
-- SQL editor no tiene permisos sobre storage; si no, usar el dashboard:
-- Storage → New bucket → "constancias-pdf", público de solo lectura).
-- ============================================================================
-- insert into storage.buckets (id, name, public) values ('constancias-pdf','constancias-pdf', true)
--   on conflict (id) do nothing;

-- ============================================================================
-- SEED de catálogos base (sistemas) — necesario antes de insertar cursos
-- ============================================================================
insert into academia_sistemas (clave, nombre) values
  ('NOI','Aspel Nóminas'),
  ('COI','Aspel Contabilidad')
on conflict (clave) do nothing;

-- Ver academia_seed_piloto.sql para los cursos, generación, firmantes e
-- inscripciones de los 82 participantes piloto (27 NOI + 55 COI).
