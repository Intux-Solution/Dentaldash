-- handle_new_user_subscription(): derivar las feature keys de la DB
--
-- La funcion tenia la lista de las once claves escrita literalmente. Tras podar
-- las seis que no aplicaban ningun control (migracion 20260820161405), este
-- trigger las habria vuelto a crear en cada alta: un usuario nuevo arrancaria
-- con filas de claves que ya no existen en ningun plan, y
-- apply_pending_plan_changes() —que deriva su universo de
-- (subscription_plans.feature_keys UNION feature_permissions)— las habria
-- resucitado para todos en el siguiente cambio de plan.
--
-- Ahora se resuelve igual que apply_pending_plan_changes(): a partir de los
-- datos, sin lista propia. Agregar o quitar una feature deja de requerir tocar
-- SQL.

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id            uuid;
  v_plan_feature_keys  text[];
  v_trial_days         int;
  v_all_features       text[];
  v_key                text;
BEGIN
  -- Plan de alta: el primer plan activo con trial_days configurado.
  SELECT id, feature_keys, trial_days
    INTO v_plan_id, v_plan_feature_keys, v_trial_days
  FROM public.subscription_plans
  WHERE trial_days IS NOT NULL
    AND is_active = true
  ORDER BY sort_order
  LIMIT 1;

  -- Sin ningun plan con trial_days la suscripcion quedaria sin plan_id y el
  -- usuario sin permisos. Es un error de configuracion, no un caso de negocio:
  -- conviene que quede en los logs en vez de pasar desapercibido.
  IF v_plan_id IS NULL THEN
    RAISE WARNING 'handle_new_user_subscription: ningun plan activo tiene trial_days; el alta % queda sin plan.', NEW.id;
  END IF;

  IF v_trial_days IS NULL THEN
    v_trial_days := 14;
  END IF;

  INSERT INTO public.subscriptions (user_id, plan_id, status, trial_ends_at)
  VALUES (NEW.id, v_plan_id, 'trial', now() + (v_trial_days || ' days')::interval)
  ON CONFLICT (user_id) DO NOTHING;

  -- Universo de features derivado de los datos, no de una lista hardcodeada.
  SELECT COALESCE(array_agg(DISTINCT fk), ARRAY[]::text[])
    INTO v_all_features
  FROM (
    SELECT unnest(COALESCE(sp.feature_keys, '{}')) AS fk
    FROM public.subscription_plans sp
    UNION
    SELECT DISTINCT fp.feature_key AS fk
    FROM public.feature_permissions fp
  ) AS keys;

  FOREACH v_key IN ARRAY v_all_features LOOP
    INSERT INTO public.feature_permissions (user_id, feature_key, enabled)
    VALUES (NEW.id, v_key, v_key = ANY(COALESCE(v_plan_feature_keys, '{}')))
    ON CONFLICT (user_id, feature_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user_subscription() TO service_role;

COMMENT ON FUNCTION public.handle_new_user_subscription() IS
  'Auto-provisiona la suscripcion trial y las feature_permissions al registrarse. '
  'Las claves se derivan de subscription_plans.feature_keys UNION feature_permissions: '
  'no hay lista hardcodeada (igual criterio que apply_pending_plan_changes).';
