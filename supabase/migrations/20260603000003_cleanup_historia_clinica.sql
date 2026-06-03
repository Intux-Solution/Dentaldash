-- Migración: Consolidar campo legacy historia_clinica en historia_clinica_url
-- Los registros que solo tienen el campo legacy se migran al campo actual.
UPDATE public.patients
SET historia_clinica_url = historia_clinica
WHERE historia_clinica_url IS NULL
  AND historia_clinica IS NOT NULL;

-- Eliminar columna legacy
ALTER TABLE public.patients DROP COLUMN IF EXISTS historia_clinica;
