-- ============================================================================
-- Lote 5: campos editables por generación para "Editar generación" en la app
-- (Jp, 2026-08-29) — número de prácticas pasa de ser fijo por curso a ser
-- editable por generación (cada generación puede tener un número distinto
-- de prácticas), y se agregan 3 campos de texto libre que antes se
-- calculaban automáticamente en la constancia (formato, método de
-- evaluación, criterio de acreditación) para que Jp/Academia los pueda
-- capturar y editar directamente. Todos nullable y con fallback en el
-- código de la constancia si vienen vacíos, así que correr esto no rompe
-- nada de lo que ya existe.
-- Correr manualmente en el SQL Editor de Supabase del proyecto App VENTAS.
-- ============================================================================

alter table academia_generaciones add column if not exists practicas_totales int;
alter table academia_generaciones add column if not exists formato_texto text;
alter table academia_generaciones add column if not exists metodo_evaluacion text;
alter table academia_generaciones add column if not exists criterio_acreditacion text;

-- Backfill: copia el valor que ya existía a nivel curso (si lo había) a las
-- generaciones de ese curso que todavía no tengan su propio valor. De aquí
-- en adelante, el valor de la generación manda; academia_cursos.practicas_totales
-- se queda solo como fallback histórico (no hace falta borrarlo).
update academia_generaciones g
set practicas_totales = c.practicas_totales
from academia_cursos c
where g.curso_id = c.id
  and g.practicas_totales is null
  and c.practicas_totales is not null;
