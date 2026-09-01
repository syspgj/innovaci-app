-- ============================================================================
-- Fix: la constancia sigue mostrando "Josué Alcántara" como Director General
-- en vez de "Josué Peña". No hace falta volver a correr el seed completo
-- (duplicaría los 79 participantes ya cargados) — solo esto:
-- ============================================================================

update academia_firmantes
set nombre = 'Josué Peña'
where nombre = 'Josué Alcántara';

-- Si por alguna razón no actualiza ninguna fila (variación de acentos/espacios
-- en el nombre guardado), corre esto primero para ver el valor real:
-- select id, nombre, cargo from academia_firmantes where cargo ilike '%director%';
