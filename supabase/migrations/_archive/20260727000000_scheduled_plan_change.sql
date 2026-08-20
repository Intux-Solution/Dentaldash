-- ============================================================
-- Cambio de plan programado (downgrade diferido al vencimiento)
-- ============================================================
-- Al bajar de plan no se cobra nada nuevo ni se pierde el periodo ya pagado:
-- se guarda el plan destino en pending_plan_id con la fecha de vencimiento del
-- periodo actual. Hasta esa fecha el usuario conserva su plan_id y sus
-- feature_permissions intactos. El cron diario aplica los cambios vencidos.
--
-- El upgrade NO usa este mecanismo: sigue yendo por checkout de MercadoPago
-- con cobro inmediato (subir el monto de un preapproval exige re-autorizacion
-- del pagador; bajarlo no).

-- 1) Columnas del cambio programado
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamptz;

COMMENT ON COLUMN public.subscriptions.pending_plan_id IS
  'Plan al que se migra cuando vence el periodo actual (downgrade programado). NULL = sin cambio pendiente.';
COMMENT ON COLUMN public.subscriptions.pending_plan_effective_at IS
  'Fecha en que se aplica pending_plan_id. Se setea a current_period_end al programar el downgrade.';

-- Indice parcial: el cron solo mira las pocas filas con cambio pendiente.
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_plan
  ON public.subscriptions (pending_plan_effective_at)
  WHERE pending_plan_id IS NOT NULL;

-- 2) Aplicador de cambios vencidos
-- Se aplica cualquiera sea el status: plan_id refleja el plan contratado,
-- el acceso lo sigue determinando status (ProtectedRoute) y las permissions.
CREATE OR REPLACE FUNCTION public.apply_pending_plan_changes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_all_features text[] := ARRAY[
    'appointments', 'odontogram', 'clinical_records', 'consent_forms',
    'patients_unlimited', 'insurance_management', 'services_config', 'export_data',
    'whatsapp_bot', 'google_calendar', 'faqs_config'
  ];
  v_sub     record;
  v_keys    text[];
  v_key     text;
  v_applied integer := 0;
BEGIN
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

-- Solo el cron (postgres) y el service role la ejecutan. Ver 20260607000004.
REVOKE EXECUTE ON FUNCTION public.apply_pending_plan_changes() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_pending_plan_changes() TO service_role;

-- 3) Cron diario (04:00 UTC). Tolerante a que pg_cron no este instalado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('apply-pending-plan-changes')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'apply-pending-plan-changes');

    PERFORM cron.schedule(
      'apply-pending-plan-changes',
      '0 4 * * *',
      $cron$SELECT public.apply_pending_plan_changes()$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron no instalado: programar apply_pending_plan_changes() manualmente.';
  END IF;
END;
$$;
