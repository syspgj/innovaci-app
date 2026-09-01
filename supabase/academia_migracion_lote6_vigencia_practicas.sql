-- ============================================================================
-- Lote 6: fechas de vigencia de prácticas capturables por GENERACIÓN
-- (Jp, 2026-08-31) — antes la vigencia de prácticas se calculaba solo con
-- días (ventana_practicas_dias / practicas_extension_dias) fijos por CURSO
-- sobre la fecha_fin de la generación. Ahora "Editar generación" (y "Nueva
-- generación") captura directamente las dos fechas de cierre por
-- generación, sugeridas en automático (+15 días / +30 días sobre la fecha
-- de fin) pero editables a mano. Si estas fechas están vacías, la app sigue
-- calculando con el método anterior (días por curso) como respaldo, así que
-- correr esto no rompe generaciones ya existentes.
-- Correr manualmente en el SQL Editor de Supabase del proyecto App VENTAS.
-- ============================================================================

alter table academia_generaciones add column if not exists fecha_limite_practicas date;
alter table academia_generaciones add column if not exists fecha_limite_practicas_extension date;
