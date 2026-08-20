-- ============================================================
-- Mensajes de soporte: el odontologo deja un mensaje al admin
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_messages (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject     text        NOT NULL,
  body        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'new', -- new | read
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

CREATE INDEX IF NOT EXISTS support_messages_created_at_idx
  ON public.support_messages (created_at DESC);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- El dentista puede crear sus propios mensajes
DROP POLICY IF EXISTS "users insert own support messages" ON public.support_messages;
CREATE POLICY "users insert own support messages"
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- El dentista puede ver solo sus propios mensajes
-- (el admin lee todos via service role desde la Edge Function admin-api, bypassea RLS)
DROP POLICY IF EXISTS "users read own support messages" ON public.support_messages;
CREATE POLICY "users read own support messages"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.support_messages IS
  'Mensajes de soporte enviados por los odontologos al administrador del sistema.';
