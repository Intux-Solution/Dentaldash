-- ============================================================
-- Busqueda de pacientes insensible a acentos
-- ============================================================
-- PacientesView filtraba dos veces: el servidor con `ilike` (sensible a acentos) y
-- el cliente con una normalizacion NFD (insensible). Eso hacia que "Perez" y
-- "perez" matchearan en el cliente pero nunca llegaran desde el servidor, y que un
-- paciente inactivo fuera imposible de encontrar.
--
-- Al pasar el filtrado 100% al servidor hace falta que el servidor sepa ignorar
-- acentos. Se resuelve con una columna generada normalizada + indice trigram.
--
-- Las extensiones van al schema `extensions` (convencion de Supabase) para no
-- reincidir en el lint 0014 (extension_in_public).

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- `unaccent(text)` es STABLE, no IMMUTABLE: depende del search_path para resolver
-- el diccionario, asi que Postgres no la acepta en una columna generada. La forma
-- de dos argumentos recibe el diccionario explicito y si es determinista, por lo
-- que este wrapper puede declararse IMMUTABLE sin mentir.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = extensions, pg_temp
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

COMMENT ON FUNCTION public.immutable_unaccent(text) IS
  'unaccent() IMMUTABLE (diccionario explicito), para usar en columnas generadas '
  'e indices. La forma de un argumento es solo STABLE y Postgres la rechaza ahi.';

-- Version normalizada del nombre: sin acentos y en minusculas.
-- STORED (no VIRTUAL): se indexa y se consulta en cada busqueda.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS nombre_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(nombre))) STORED;

COMMENT ON COLUMN public.patients.nombre_norm IS
  'Derivada de `nombre`: minusculas y sin acentos. La usa la busqueda del listado '
  'de pacientes (PatientService.fetchPatientsPaginated). No escribir a mano.';

-- gin_trgm_ops soporta `ILIKE '%texto%'`, que un btree no puede usar.
CREATE INDEX IF NOT EXISTS idx_patients_nombre_norm_trgm
  ON public.patients USING gin (nombre_norm extensions.gin_trgm_ops);

-- El DNI se guarda ya sanitizado (solo digitos), asi que un trigram simple alcanza.
CREATE INDEX IF NOT EXISTS idx_patients_dni_trgm
  ON public.patients USING gin (dni extensions.gin_trgm_ops);
