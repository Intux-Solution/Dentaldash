-- Limpieza de objetos legacy (auditoria 2026-06-10)
-- Verificado: sin referencias en frontend, edge functions, triggers ni workflows n8n
-- (todos los workflows n8n son anteriores a la creacion del proyecto, 2026-02-11).

-- RAG legacy: match_tenant_documents referencia una tabla tenant_documents que ya no existe,
-- y pgvector no tiene ningun otro uso en el sistema.
DROP FUNCTION IF EXISTS public.match_tenant_documents(vector, double precision, integer, uuid);
DROP EXTENSION IF EXISTS vector CASCADE;

-- Funciones huerfanas del modelo multi-tenant-por-equipo y del flujo viejo de turnos.
-- Ya tenian EXECUTE revocado (migracion 20260607000004).
DROP FUNCTION IF EXISTS public.reserve_slot(uuid, text, timestamptz, timestamptz, integer, text, text, text);
DROP FUNCTION IF EXISTS public.check_appointment_availability(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.handle_new_tenant();
DROP FUNCTION IF EXISTS public.is_tenant_member(uuid);

-- Tabla huerfana del formulario de contacto de la landing page eliminada (0 filas).
DROP TABLE IF EXISTS public.contact_submissions;

-- pg_net queda en public: la extension no soporta SET SCHEMA
-- ("extension pg_net does not support SET SCHEMA", probado con v0.19.5).
-- El lint 0014 para pg_net se asume como excepcion conocida; sus funciones viven
-- en el schema net y el cron job (net.http_post) no se ve afectado.
