-- ============================================================
-- apply_pending_plan_changes(): derivar las feature keys de la DB
-- ============================================================
-- La lista de las 11 feature keys estaba escrita literalmente en cuatro lugares:
-- el frontend (src/config/featureKeys.ts), dos Edge Functions y esta funcion.
-- Agregar una feature exigia tocar los cuatro y recordar redeployar dos funciones;
-- si alguno quedaba desactualizado el usuario recibia permisos incompletos segun
-- que camino disparo la actualizacion (admin manual, webhook de pago o este cron).
--
-- Las Edge Functions ahora comparten supabase/functions/_shared/feature-keys.ts.
-- Del lado SQL, la lista se deriva de los datos en vez de duplicarse:
--   - las keys declaradas por CUALQUIER plan (subscription_plans.feature_keys), y
--   - las que ya existen en feature_permissions.
--
-- La UNION con feature_permissions no es cosmetica: si una key dejara de figurar
-- en todos los planes, sin ella nunca volveria a revocarse en un downgrade y el
-- usuario la conservaria para siempre.

CREATE OR REPLACE FUNCTION public.apply_pending_plan_changes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_all_features text[];
  v_sub     record;
  v_keys    text[];
  v_key     text;
  v_applied integer := 0;
BEGIN
  -- Universo de features a escribir. Se resuelve una vez por ejecucion.
  SELECT COALESCE(array_agg(DISTINCT fk), ARRAY[]::text[])
    INTO v_all_features
  FROM (
    SELECT unnest(COALESCE(sp.feature_keys, '{}')) AS fk
    FROM public.subscription_plans sp
    UNION
    SELECT DISTINCT fp.feature_key AS fk
    FROM public.feature_permissions fp
  ) AS keys;

  FOR v_sub IN
    SELECT s.id, s.user_id, s.pending_plan_id
    FROM public.subscriptions s
    WHERE s.pending_plan_id IS NOT NULL
      AND s.pending_plan_effective_at IS NOT NULL
      AND s.pending_plan_effective_at <= now()
    FOR UPDATE
  LOOP
    SELECT COALESCE(feature_keys, '{}')
      INTO v_keys
    FROM public.subscription_plans
    WHERE id = v_sub.pending_plan_id;

    -- Si el plan destino ya no existe, descartar el cambio pendiente.
    IF NOT FOUND THEN
      UPDATE public.subscriptions
      SET pending_plan_id = NULL,
          pending_plan_effective_at = NULL,
          updated_at = now()
      WHERE id = v_sub.id;
      CONTINUE;
    END IF;

    UPDATE public.subscriptions
    SET plan_id = v_sub.pending_plan_id,
        pending_plan_id = NULL,
        pending_plan_effective_at = NULL,
        updated_at = now()
    WHERE id = v_sub.id;

    FOREACH v_key IN ARRAY v_all_features LOOP
      INSERT INTO public.feature_permissions (user_id, feature_key, enabled, updated_at)
      VALUES (v_sub.user_id, v_key, v_key = ANY(v_keys), now())
      ON CONFLICT (user_id, feature_key)
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at;
    END LOOP;

    v_applied := v_applied + 1;
  END LOOP;

  RETURN v_applied;
END;
$$;

-- CREATE OR REPLACE preserva los grants, pero los repetimos para que esta
-- migracion sea autosuficiente si se aplica sobre una base recreada.
REVOKE EXECUTE ON FUNCTION public.apply_pending_plan_changes() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_pending_plan_changes() TO service_role;

COMMENT ON FUNCTION public.apply_pending_plan_changes() IS
  'Aplica los downgrades programados vencidos (subscriptions.pending_plan_id). '
  'Las feature keys se derivan de subscription_plans.feature_keys UNION '
  'feature_permissions: no hay lista hardcodeada. La corre el cron '
  'apply-pending-plan-changes (04:00 UTC) y mp-webhook via RPC.';
