-- ============================================================
-- Eliminar plan Trial: nuevos usuarios reciben plan Basico
-- con periodo de prueba gratis configurable via trial_days.
-- ============================================================

-- 1) Mover trial_days al plan Basico
UPDATE public.subscription_plans
SET trial_days = 14
WHERE name = 'Basico';

-- 2) Migrar usuarios existentes en trial al plan Basico
UPDATE public.subscriptions s
SET plan_id = (SELECT id FROM public.subscription_plans WHERE name = 'Basico' LIMIT 1),
    updated_at = now()
FROM public.subscription_plans sp
WHERE s.plan_id = sp.id
  AND sp.name = 'Trial'
  AND s.status = 'trial';

-- 3) Re-sincronizar feature_permissions de usuarios migrados
-- (les damos las features del Basico)
UPDATE public.feature_permissions fp
SET enabled = (fp.feature_key = ANY(sp.feature_keys)),
    updated_at = now()
FROM public.subscriptions s
JOIN public.subscription_plans sp ON sp.id = s.plan_id
WHERE fp.user_id = s.user_id
  AND sp.name = 'Basico'
  AND s.status = 'trial';

-- 4) Desactivar el plan Trial
UPDATE public.subscription_plans
SET is_active = false, trial_days = NULL, updated_at = now()
WHERE name = 'Trial';

-- 5) Recrear trigger: busca plan por trial_days IS NOT NULL
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id            uuid;
  v_plan_feature_keys  text[];
  v_trial_days         int;
  v_all_features       text[] := ARRAY[
    'appointments', 'odontogram', 'clinical_records', 'consent_forms',
    'patients_unlimited', 'insurance_management', 'services_config', 'export_data',
    'whatsapp_bot', 'google_calendar', 'faqs_config'
  ];
  v_key text;
BEGIN
  -- Buscar el plan activo que tenga trial_days configurado
  SELECT id, feature_keys, trial_days
    INTO v_plan_id, v_plan_feature_keys, v_trial_days
  FROM public.subscription_plans
  WHERE trial_days IS NOT NULL
    AND is_active = true
  ORDER BY sort_order
  LIMIT 1;

  -- Fallback: si no hay plan con trial_days, usar 14 dias
  IF v_trial_days IS NULL THEN
    v_trial_days := 14;
  END IF;

  -- Crear suscripcion con status trial
  INSERT INTO public.subscriptions (
    user_id,
    plan_id,
    status,
    trial_ends_at
  ) VALUES (
    NEW.id,
    v_plan_id,
    'trial',
    now() + (v_trial_days || ' days')::interval
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Crear feature_permissions segun las features del plan
  FOREACH v_key IN ARRAY v_all_features LOOP
    INSERT INTO public.feature_permissions (user_id, feature_key, enabled)
    VALUES (NEW.id, v_key, v_key = ANY(COALESCE(v_plan_feature_keys, '{}')))
    ON CONFLICT (user_id, feature_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;
