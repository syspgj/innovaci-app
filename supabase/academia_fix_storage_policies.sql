-- ============================================================================
-- Fix: "Esta constancia no tiene un PDF guardado en Storage todavía"
--
-- Causa más probable: el bucket `constancias-pdf` existe (Jp ya lo creó),
-- pero Supabase Storage tiene su PROPIO Row Level Security sobre la tabla
-- `storage.objects` — crear el bucket desde el dashboard NO habilita subir
-- archivos por sí solo. Sin una política que lo permita, cualquier intento
-- de `sb.storage.from('constancias-pdf').upload(...)` falla en silencio
-- desde el navegador (el registro de la constancia sí se guarda porque esa
-- tabla tiene su propia política vía `academia_es_staff()`, pero el PDF
-- nunca llega a Storage — por eso `pdf_path` queda nulo).
--
-- Correr esto en el SQL Editor de Supabase. Sustituye/crea las políticas
-- necesarias para que el staff de Academia (rol academia/director/
-- administracion) pueda subir y leer los PDFs de este bucket.
-- ============================================================================

drop policy if exists constancias_pdf_staff_all on storage.objects;
create policy constancias_pdf_staff_all on storage.objects
  for all
  to authenticated
  using (bucket_id = 'constancias-pdf' and academia_es_staff())
  with check (bucket_id = 'constancias-pdf' and academia_es_staff());

-- Si el bucket se dejó marcado como "público" (lectura sin sesión, para que
-- el QR funcione desde el celular de cualquier egresado sin login), agrega
-- también esta política de SELECT para anon:
drop policy if exists constancias_pdf_public_read on storage.objects;
create policy constancias_pdf_public_read on storage.objects
  for select
  to anon
  using (bucket_id = 'constancias-pdf');

-- Mismo fix para el bucket de evidencias del Lote 1+2 (academia-evidencias),
-- por si tiene el mismo problema — este bucket es privado, solo staff:
drop policy if exists academia_evidencias_staff_all on storage.objects;
create policy academia_evidencias_staff_all on storage.objects
  for all
  to authenticated
  using (bucket_id = 'academia-evidencias' and academia_es_staff())
  with check (bucket_id = 'academia-evidencias' and academia_es_staff());

-- ============================================================================
-- Cómo verificar que ya quedó bien, sin depender de la app:
-- 1. En el dashboard de Supabase → Storage → Policies, deberías ver las
--    políticas de arriba listadas contra `storage.objects`.
-- 2. En la app: abre una ficha, dale "Regenerar PDF" a la constancia que
--    falló (NOI11-GMAY26-PM-005-8ZJ) y confirma que esta vez sí aparece el
--    botón "Descargar PDF" en vez de "Regenerar".
-- ============================================================================
