-- ============================================================
-- Trial = Basico: ambos planes habilitan todas las features
-- excepto whatsapp_bot y faqs_config (9 features, incluye google_calendar).
-- Ademas:
--   * Re-sincroniza los feature_permissions de usuarios existentes en Trial/Basico.
--   * Hace dinamico el trigger de alta para que lea feature_keys del plan Trial
--     en vez de hardcodearlos.
-- ============================================================

-- 1) Actualizar feature_keys de los planes Trial y Basico
UPDATE public.subscription_plans
SET feature_keys = ARRAY[
  'appointments', 'odontogram', 'clinical_records', 'consent_forms',
  'patients_unlimited', 'insurance_management', 'services_config', 'export_data',
  'google_calendar'
]
WHERE name IN ('Trial', 'Basico');

-- 2) Retroactivo: re-sincronizar feature_permissions de los usuarios cuyo plan
--    sea Trial o Basico, segun los feature_keys actuales del plan.
UPDATE public.feature_permissions fp
SET enabled = (fp.feature_key = ANY(sp.feature_keys)),
    updated_at = now()
FROM public.subscriptions s
JOIN public.subscription_plans sp ON sp.id = s.plan_id
WHERE fp.user_id = s.user_id
  AND sp.name IN ('Trial', 'Basico');

-- 3) Trigger dinamico: lee feature_keys del plan Trial desde la DB.
--    Asi, futuros cambios al plan Trial impactan a los nuevos usuarios sin tocar codigo.
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_plan_id      uuid;
  v_trial_feature_keys text[];
  v_trial_days         int := 14;
  v_all_features       text[] := ARRAY[
    'appointments', 'odontogram', 'clinical_records', 'consent_forms',
    'patients_unlimited', 'insurance_management', 'services_config', 'export_data',
    'whatsapp_bot', 'google_calendar', 'faqs_config'
  ];
  v_key text;
BEGIN
  -- Buscar el plan Trial activo y sus feature_keys
  SELECT id, feature_keys
    INTO v_trial_plan_id, v_trial_feature_keys
  FROM public.subscription_plans
  WHERE name = 'Trial' AND is_active = true
  LIMIT 1;

  -- Crear suscripcion trial por 14 dias
  INSERT INTO public.subscriptions (
    user_id,
    plan_id,
    status,
    trial_ends_at
  ) VALUES (
    NEW.id,
    v_trial_plan_id,
    'trial',
    now() + (v_trial_days || ' days')::interval
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Crear feature_permissions segun los feature_keys del plan Trial
  FOREACH v_key IN ARRAY v_all_features LOOP
    INSERT INTO public.feature_permissions (user_id, feature_key, enabled)
    VALUES (NEW.id, v_key, v_key = ANY(COALESCE(v_trial_feature_keys, '{}')))
    ON CONFLICT (user_id, feature_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;
