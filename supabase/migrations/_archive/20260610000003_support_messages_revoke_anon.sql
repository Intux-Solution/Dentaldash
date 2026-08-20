-- support_messages solo se usa con sesion (authenticated) o service role.
-- Quitar privilegios de anon la saca del schema GraphQL publico (lint 0026).
REVOKE ALL ON public.support_messages FROM anon;
