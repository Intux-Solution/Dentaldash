-- ============================================================
-- pg_net en public: excepcion aceptada, documentada en la propia DB
-- ============================================================
-- El advisor marca pg_net en el schema public (lint 0014, extension_in_public).
-- La migracion 20260610000002 ya documenta por que se queda ahi, pero ese comentario
-- vive en el historial de migraciones: quien audite la base lo ve como un hallazgo
-- abierto y vuelve a investigarlo. Con un COMMENT ON EXTENSION la justificacion
-- viaja con el objeto.
--
-- Alternativa para cerrarlo del todo (requiere ventana de mantenimiento):
--   DROP EXTENSION pg_net; CREATE EXTENSION pg_net SCHEMA extensions;
--   ... y recrear el cron job cleanup-orphaned-files.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    COMMENT ON EXTENSION pg_net IS
      'Excepcion aceptada al lint 0014 (extension_in_public): pg_net no soporta '
      'SET SCHEMA (verificado en v0.19.5). Sus funciones viven en el schema net; '
      'el unico consumidor es el cron job cleanup-orphaned-files via net.http_post. '
      'Revisar si una version futura habilita el movimiento de schema.';
  ELSE
    RAISE NOTICE 'pg_net no instalado: nada que comentar.';
  END IF;
END;
$$;
