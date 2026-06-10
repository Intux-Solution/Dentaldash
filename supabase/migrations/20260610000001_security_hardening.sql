-- Security hardening (auditoria 2026-06-10)
-- Resuelve advisors: 0025 (public_bucket_allows_listing), 0026/0027 (graphql exposure),
-- 0003 (auth_rls_initplan), 0001 (unindexed_foreign_keys)

-- 1) Tablas service-role-only: quitar todo privilegio a anon/authenticated.
--    RLS sin politicas ya bloquea las filas; el revoke ademas las saca del schema GraphQL.
REVOKE ALL ON public.processed_mp_events FROM anon, authenticated;
REVOKE ALL ON public.public_booking_attempts FROM anon, authenticated;

-- 2) Storage bucket avatars (publico): no necesita politica SELECT para servir URLs,
--    y permitia listar todos los archivos a cualquier usuario autenticado.
DROP POLICY IF EXISTS "authenticated_can_view_avatars" ON storage.objects;

-- El frontend sube avatares a la raiz del bucket con nombre "{userId}-{random}.{ext}"
-- (useSettings.ts), por lo que el ownership se expresa como prefijo del filename.
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "avatars: owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE ((SELECT auth.uid())::text || '-%')
  );

DROP POLICY IF EXISTS "Owner Update" ON storage.objects;
CREATE POLICY "avatars: owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE ((SELECT auth.uid())::text || '-%')
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE ((SELECT auth.uid())::text || '-%')
  );

-- 3) RLS initplan: envolver auth.uid() en (SELECT ...) para evaluarlo una sola vez por query.
DROP POLICY IF EXISTS "users insert own support messages" ON public.support_messages;
CREATE POLICY "users insert own support messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users read own support messages" ON public.support_messages;
CREATE POLICY "users read own support messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "tenant_can_view_own" ON public.chat_history;
CREATE POLICY "tenant_can_view_own" ON public.chat_history
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

-- 4) FK support_messages.user_id sin indice de cobertura.
CREATE INDEX IF NOT EXISTS idx_support_messages_user_id ON public.support_messages(user_id);
