-- ============================================================
-- Endurecimiento: revocar EXECUTE de funciones SECURITY DEFINER
-- ============================================================
-- El advisor de Supabase detecto funciones SECURITY DEFINER ejecutables por
-- los roles anon/authenticated via /rest/v1/rpc/. Acotamos cada una a quien
-- realmente la necesita.
--
-- IMPORTANTE: el EXECUTE de estas funciones viene del grant por defecto a PUBLIC.
-- Por eso hay que REVOKE ... FROM PUBLIC (no alcanza con FROM anon/authenticated,
-- que dejarian el privilegio heredado de PUBLIC). Luego se re-otorga explicitamente
-- a los roles que SI deben ejecutar cada funcion.
--
-- Verificado contra usos reales del frontend (grep ".rpc(" en src/) y contra
-- pg_policies (ninguna usa estas funciones). n8n accede con service_role/postgres.

-- 1) Funciones de TRIGGER: nadie las ejecuta via RPC (los triggers corren sin EXECUTE del caller).
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change()          FROM PUBLIC, anon, authenticated;

-- 2) _safe usadas por el frontend autenticado (y posiblemente n8n con service_role):
--    sacar PUBLIC/anon, re-otorgar a authenticated + service_role.
REVOKE EXECUTE ON FUNCTION public.confirm_appointment_safe(text,timestamptz,timestamptz,integer,text,uuid,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirm_appointment_safe(text,timestamptz,timestamptz,integer,text,uuid,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_appointment_safe(uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_appointment_safe(uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_unique_insurances() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_unique_insurances() TO authenticated, service_role;

-- 3) confirm_public_appointment_safe: solo la Edge Function public-booking con service_role.
REVOKE EXECUTE ON FUNCTION public.confirm_public_appointment_safe(uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_public_appointment_safe(uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text) TO service_role;

-- 4) is_tenant_member: no aparece en politicas RLS ni en el frontend; reservar a service_role.
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO service_role;

-- NOTA: la funcion legacy public.confirm_appointment(...) (sin filtro de tenant)
-- se trata por separado, tras auditar usos externos (n8n/webhooks). Ver SECURITY.md.
