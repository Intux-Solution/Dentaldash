-- Agregar columna trial_days a subscription_plans para que el admin
-- pueda configurar la duracion del periodo de prueba desde el panel.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS trial_days int DEFAULT NULL;

-- Setear 14 dias en el plan Trial existente
UPDATE public.subscription_plans
SET trial_days = 14
WHERE name = 'Trial';

-- Recrear el trigger para que lea trial_days del plan Trial dinamicamente
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_plan_id      uuid;
  v_trial_feature_keys text[];
  v_trial_days         int;
  v_all_features       text[] := ARRAY[
    'appointments', 'odontogram', 'clinical_records', 'consent_forms',
    'patients_unlimited', 'insurance_management', 'services_config', 'export_data',
    'whatsapp_bot', 'google_calendar', 'faqs_config'
  ];
  v_key text;
BEGIN
  -- Buscar el plan Trial activo, sus feature_keys y trial_days
  SELECT id, feature_keys, COALESCE(trial_days, 14)
    INTO v_trial_plan_id, v_trial_feature_keys, v_trial_days
  FROM public.subscription_plans
  WHERE name = 'Trial' AND is_active = true
  LIMIT 1;

  -- Crear suscripcion trial
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
