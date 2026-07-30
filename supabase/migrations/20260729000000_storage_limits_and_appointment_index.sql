-- ============================================================
-- Correcciones de auditoria: limites de Storage + indice de agenda
-- ============================================================

-- 1) Limites de subida server-side.
-- Hasta ahora el unico control era client-side (PatientService.assertUploadableFile),
-- trivial de saltear llamando a Storage directo con la anon key.

-- clinical-records: espeja MAX_FILE_SIZE = 5MB.
-- Se incluye application/octet-stream a proposito: assertUploadableFile acepta
-- MIME no concluyente cayendo a la extension (en Windows un PDF sin asociacion
-- registrada llega con file.type vacio). Sin el, romperiamos subidas legitimas.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ]
WHERE id = 'clinical-records';

-- avatars: solo imagenes. Aca el navegador si resuelve el MIME de forma fiable
-- (ProfileTab usa accept="image/*"), asi que no hace falta el escape anterior.
UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif']
WHERE id = 'avatars';

-- 2) Policy DELETE faltante en avatars.
-- El bucket tenia INSERT y UPDATE pero no DELETE: los avatares reemplazados
-- quedaban huerfanos sin forma de borrarlos desde la app.
DROP POLICY IF EXISTS "avatars: owner delete" ON storage.objects;
CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE ((SELECT auth.uid())::text || '-%')
  );

-- 3) Indice de agenda.
-- useTurnos filtra por dueño + rango de start_time y no habia ningun indice
-- sobre start_time. El compuesto cubre ambos; idx_appointments_user_id queda
-- estrictamente redundante al ser prefijo del nuevo.
CREATE INDEX IF NOT EXISTS idx_appointments_user_start
  ON public.appointments (user_id, start_time);

DROP INDEX IF EXISTS public.idx_appointments_user_id;
