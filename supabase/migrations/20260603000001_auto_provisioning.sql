-- ============================================================
-- Auto-provisioning de suscripcion trial + permisos basicos
-- al registrarse un nuevo usuario
-- ============================================================

-- Funcion que se ejecuta cuando se crea un nuevo usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_plan_id uuid;
  v_trial_days    int := 14;
BEGIN
  -- Buscar el plan Trial activo
  SELECT id INTO v_trial_plan_id
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

  -- Crear feature_permissions para el plan Trial
  -- Solo las features basicas habilitadas
  INSERT INTO public.feature_permissions (user_id, feature_key, enabled)
  VALUES
    (NEW.id, 'appointments',         true),
    (NEW.id, 'odontogram',            true),
    (NEW.id, 'clinical_records',      true),
    (NEW.id, 'consent_forms',         true),
    (NEW.id, 'patients_unlimited',    false),
    (NEW.id, 'insurance_management',  false),
    (NEW.id, 'services_config',       false),
    (NEW.id, 'export_data',           false),
    (NEW.id, 'whatsapp_bot',          false),
    (NEW.id, 'google_calendar',       false),
    (NEW.id, 'faqs_config',           false)
  ON CONFLICT (user_id, feature_key) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Disparar la funcion AFTER INSERT en auth.users
-- (el trigger se crea en el schema auth para capturar el INSERT de Supabase Auth)
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();

COMMENT ON FUNCTION public.handle_new_user_subscription() IS
  'Auto-provisiona suscripcion trial de 14 dias y feature_permissions basicos al registrarse.';
