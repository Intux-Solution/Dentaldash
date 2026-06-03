-- ============================================================
-- Securizar debug_payloads: habilitar RLS sin politicas publicas
-- Solo el service role (Edge Functions) puede acceder.
-- ============================================================

ALTER TABLE public.debug_payloads ENABLE ROW LEVEL SECURITY;

-- Sin politicas: ningun usuario autenticado ni anonimo puede
-- hacer SELECT, INSERT, UPDATE ni DELETE desde el cliente.
-- Las Edge Functions usan SUPABASE_SERVICE_ROLE_KEY que bypasea RLS.
