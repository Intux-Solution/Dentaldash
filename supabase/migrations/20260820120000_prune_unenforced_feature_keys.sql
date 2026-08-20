-- ============================================================
-- Retirar las feature keys que no aplicaban ningun control
-- ============================================================
-- De las once claves originales, seis no bloqueaban nada: se escribian en
-- feature_permissions en cada cambio de plan y no las consultaba ni el frontend
-- ni ninguna Edge Function. Una clave que promete un control inexistente es peor
-- que no tenerla: aparece en el panel de admin, se tilda al armar un plan, y no
-- cambia el comportamiento del producto.
--
-- Se retiran:
--   appointments, odontogram, clinical_records, consent_forms
--       -> son el producto base; gatearlas no define un plan mas barato.
--   patients_unlimited
--       -> nunca existio un limite de pacientes en UI, RLS ni Edge Function.
--   google_calendar
--       -> los dos planes vigentes ya la otorgan, asi que no distinguia nada.
--
-- Quedan las cinco que si bloquean algo hoy: insurance_management,
-- services_config, export_data (UI) y whatsapp_bot, faqs_config (UI + el
-- refuerzo server-side que agrega esta misma tanda de cambios).
--
-- Sincronizado con:
--   src/config/featureKeys.ts
--   supabase/functions/_shared/feature-keys.ts

BEGIN;

-- 1) Sacar las claves retiradas de los planes.
UPDATE public.subscription_plans
SET    feature_keys = ARRAY(
         SELECT k
         FROM   unnest(COALESCE(feature_keys, '{}')) AS k
         WHERE  k IN ('insurance_management', 'services_config',
                      'export_data', 'whatsapp_bot', 'faqs_config')
       ),
       updated_at = now()
WHERE  feature_keys IS NOT NULL
  AND  EXISTS (
         SELECT 1
         FROM   unnest(feature_keys) AS k
         WHERE  k NOT IN ('insurance_management', 'services_config',
                          'export_data', 'whatsapp_bot', 'faqs_config')
       );

-- 2) Borrar las filas huerfanas de feature_permissions.
--
-- No es cosmetico: apply_pending_plan_changes() deriva el universo de claves
-- como (subscription_plans.feature_keys UNION feature_permissions.feature_key).
-- Si estas filas quedaran, la funcion las reviviria en cada downgrade y las
-- claves retiradas volverian a escribirse para siempre.
DELETE FROM public.feature_permissions
WHERE  feature_key NOT IN ('insurance_management', 'services_config',
                           'export_data', 'whatsapp_bot', 'faqs_config');

COMMIT;
