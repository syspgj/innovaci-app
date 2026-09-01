-- ============================================================================
-- Lote 8 (2026-09-01): vigencia de laboratorio y sesión privada POR PERSONA,
-- para cursos de inscripción continua (24/7: diplomados desde cero, Pólizas
-- Dinámicas, talleres). A diferencia de los diplomados en vivo (donde toda
-- la generación comparte una sola fecha de cierre de prácticas, ver Lote 6),
-- aquí cada participante compra en un momento distinto y su vigencia se
-- cuenta desde SU propia fecha, no desde una fecha compartida:
--   - Laboratorio virtual: 30 días desde la compra en diplomados 24/7,
--     15 días en talleres/cursos desde cero (Esencial: sin vigencia, acceso
--     abierto).
--   - Sesión privada con Karen: 90 días desde la compra, igual para todos
--     los accesos que aplican.
-- Correr manualmente en el SQL Editor de Supabase del proyecto App VENTAS.
-- ============================================================================

alter table academia_inscripciones add column if not exists fecha_inicio_laboratorio date;
alter table academia_inscripciones add column if not exists fecha_fin_laboratorio date;
alter table academia_inscripciones add column if not exists fecha_fin_sesion_privada date;
