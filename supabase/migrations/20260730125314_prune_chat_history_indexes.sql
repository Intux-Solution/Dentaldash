-- ============================================================
-- chat_history: consolidar cuatro indices solapados en uno
-- ============================================================
-- El advisor de performance reporta los cuatro indices de chat_history como nunca
-- usados. No los crea ninguna migracion: se agregaron a mano desde el dashboard.
--
-- chat_history es la tabla que mas crece del sistema (un registro por mensaje de
-- WhatsApp, ida y vuelta), asi que cada indice de mas encarece los INSERT del
-- webhook y ocupa espacio sin devolver nada.
--
-- Se deja UN indice que cubre el patron real de consulta de chat-webhook:
-- busca el historial por jid + instancia, filtra por status y ordena por fecha.
--
-- Nota: los otros indices que el advisor marca sin uso (idx_patients_user_id,
-- idx_appointments_user_id, etc.) NO se tocan. Figuran sin uso solo porque con el
-- volumen actual el planner prefiere seq scan; con mas datos se van a necesitar.

DROP INDEX IF EXISTS public.idx_chat_history_instance;
DROP INDEX IF EXISTS public.idx_chat_history_jid_created_at;
DROP INDEX IF EXISTS public.idx_chat_history_jid_tenant;
DROP INDEX IF EXISTS public.idx_chat_history_created_at;

CREATE INDEX IF NOT EXISTS idx_chat_history_lookup
  ON public.chat_history (jid, whatsapp_instance, status, created_at DESC);

COMMENT ON INDEX public.idx_chat_history_lookup IS
  'Cubre el acceso de chat-webhook: historial por (jid, whatsapp_instance), '
  'filtrado por status y ordenado por created_at. Reemplaza a cuatro indices '
  'solapados que el advisor reportaba sin uso.';
