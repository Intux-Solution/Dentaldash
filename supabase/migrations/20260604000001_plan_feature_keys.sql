-- Add feature_keys column to subscription_plans so admin can configure
-- which features each plan enables (replaces hardcoded PLAN_FEATURES in Edge Functions)

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS feature_keys text[] DEFAULT '{}';

-- Backfill existing plans with current hardcoded mapping
UPDATE subscription_plans
SET feature_keys = ARRAY[
  'appointments', 'odontogram', 'clinical_records', 'consent_forms'
]
WHERE name = 'Trial';

UPDATE subscription_plans
SET feature_keys = ARRAY[
  'appointments', 'odontogram', 'clinical_records', 'consent_forms',
  'patients_unlimited', 'insurance_management', 'services_config', 'export_data'
]
WHERE name = 'Basico';

UPDATE subscription_plans
SET feature_keys = ARRAY[
  'appointments', 'odontogram', 'clinical_records', 'consent_forms',
  'patients_unlimited', 'insurance_management', 'services_config', 'export_data',
  'whatsapp_bot', 'google_calendar', 'faqs_config'
]
WHERE name = 'Pro';
