-- ============================================================
-- Fase 1: Sistema de Suscripciones - DentalDash
-- ============================================================

-- ============================================================
-- 1.1 NUEVAS TABLAS
-- ============================================================

-- Planes de suscripcion disponibles (el Admin puede modificarlos)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL,
  description  text,
  price_monthly numeric(10,2) NOT NULL,
  price_yearly  numeric(10,2),
  currency      text DEFAULT 'ARS',
  features      jsonb DEFAULT '[]',
  is_active     boolean DEFAULT true,
  sort_order    int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- Sin RLS: lectura publica para la landing de precios, escritura solo via service role
COMMENT ON TABLE public.subscription_plans IS 'Planes de suscripcion disponibles. Lectura publica, escritura solo via service role.';

-- Estado de suscripcion de cada tenant
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id               uuid REFERENCES public.subscription_plans(id),
  status                text DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','cancelled','free')),
  mercadopago_sub_id    text,
  mercadopago_payer_id  text,
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.subscriptions IS 'Estado de suscripcion activa de cada dentista/tenant.';

-- Permisos por feature por usuario (el Admin puede sobreescribir los defaults del plan)
CREATE TABLE IF NOT EXISTS public.feature_permissions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled     boolean DEFAULT true,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, feature_key)
);

ALTER TABLE public.feature_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_permissions" ON public.feature_permissions
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.feature_permissions IS 'Permisos granulares por feature por usuario. Permite override manual del Admin.';

-- Super-administradores del sistema
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  created_at timestamptz DEFAULT now()
);
-- Sin RLS: acceso solo via service role desde Edge Functions
COMMENT ON TABLE public.admin_users IS 'Usuarios con rol de super-administrador. Sin RLS, acceso via service role.';

-- Log de eventos de pago de MercadoPago (auditoria)
CREATE TABLE IF NOT EXISTS public.payment_events (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type     text NOT NULL,
  mp_resource_id text,
  user_id        uuid REFERENCES auth.users(id),
  payload        jsonb,
  processed      boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
-- Sin RLS: solo admin/service role
COMMENT ON TABLE public.payment_events IS 'Log de webhooks y eventos de pago recibidos de MercadoPago.';

-- ============================================================
-- 1.2 MODIFICAR public.profiles
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'dentist'
  CHECK (role IN ('dentist', 'admin'));

COMMENT ON COLUMN public.profiles.role IS 'Rol del usuario: dentist (default) o admin.';

-- ============================================================
-- 1.3 DATOS INICIALES - Planes
-- ============================================================

INSERT INTO public.subscription_plans (name, description, price_monthly, price_yearly, features, sort_order)
VALUES
  (
    'Trial',
    'Prueba gratuita 14 dias',
    0,
    0,
    '["Gestion de pacientes (hasta 20)", "Agenda de turnos", "Odontograma", "Historial clinico basico"]',
    0
  ),
  (
    'Basico',
    'Para consultorios pequeños',
    15000,
    150000,
    '["Pacientes ilimitados", "Agenda de turnos", "Odontograma", "Historial clinico completo", "Obras sociales", "Consentimientos digitales", "Exportacion de datos"]',
    1
  ),
  (
    'Pro',
    'Para consultorios en crecimiento',
    25000,
    250000,
    '["Todo lo del Basico", "Chatbot WhatsApp con IA", "Sincronizacion Google Calendar", "Configuracion de FAQs para el bot", "Soporte prioritario"]',
    2
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- INSTRUCCIONES PARA CREAR EL USUARIO ADMIN
-- ============================================================
-- Ejecutar DESPUES de crear el usuario info@intux.solutions en Supabase Auth:
--
-- INSERT INTO public.admin_users (user_id) VALUES ('<UUID_DEL_USUARIO>');
-- UPDATE public.profiles SET role = 'admin' WHERE id = '<UUID_DEL_USUARIO>';
--
-- Para asignar suscripcion de tipo 'free' sin vencimiento al admin:
-- INSERT INTO public.subscriptions (user_id, status)
--   VALUES ('<UUID_DEL_USUARIO>', 'free');
-- ============================================================
