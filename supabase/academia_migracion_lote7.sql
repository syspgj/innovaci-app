-- ============================================================================
-- Lote 7 (2026-09-01, Jp dijo "ejecuta"): limpieza de datos + nueva categoría
-- de curso para el filtro de tipo de curso en Generaciones.
-- Correr manualmente en el SQL Editor de Supabase del proyecto App VENTAS.
-- ============================================================================

-- ── Punto 31: limpieza del bug ".0" del Excel en servidor/empresa_aspel
-- (mismo bug ya corregido para teléfono en el Lote 3) ───────────────────────
update academia_inscripciones
set servidor = regexp_replace(servidor, '\.0$', '')
where servidor ~ '\.0$';

update academia_inscripciones
set empresa_aspel = regexp_replace(empresa_aspel, '\.0$', '')
where empresa_aspel ~ '\.0$';

-- ── Punto 29: nueva categoría de curso "desde_cero" (Jp: "cursos desde
-- cero" es una categoría real que no tenía equivalente en el catálogo de
-- tipos) — se agrega al CHECK existente sin tocar los cursos ya creados. ───
alter table academia_cursos drop constraint if exists academia_cursos_tipo_check;
alter table academia_cursos add constraint academia_cursos_tipo_check
  check (tipo in ('diplomado_vip','24_7','empresarial','taller','desde_cero'));
