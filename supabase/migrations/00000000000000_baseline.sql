-- ============================================================================
-- BASELINE DEL ESQUEMA — public + storage policies
-- ============================================================================
-- Extraido del catalogo de produccion (proyecto dzpvvfhrcadmhppnyqcp) el
-- 2026-08-20. Reemplaza a las 25 migraciones sueltas que vivian en este
-- directorio: sus numeros de version no coincidian con las 62 aplicadas en la
-- base, asi que el repo no servia para reconstruir nada.
--
-- Que resuelve: hasta ahora las tablas mas viejas y mas sensibles —patients,
-- appointments, profiles, odontograms, treatment_history— existian unicamente
-- dentro de Supabase. Sus politicas de RLS, que son lo unico que impide que un
-- odontologo vea las historias clinicas de otro, tampoco estaban versionadas:
-- no eran revisables en un diff ni recuperables desde el codigo.
--
-- Este archivo NO se aplica sobre produccion (ya esta ahi). Sirve para levantar
-- staging, desarrollo local y recuperacion ante desastre. Se marca como
-- aplicado con:
--     supabase migration repair --status applied 00000000000000
--
-- Verificacion:
--     supabase db diff --schema public     # no debe imprimir nada
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONES
-- ============================================================================
-- pg_net queda en public: la extension no soporta SET SCHEMA (probado con
-- v0.19.5). El lint 0014 de Supabase se asume como excepcion conocida; sus
-- funciones viven en el schema `net` y el cron job (net.http_post) no se ve
-- afectado.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


-- ============================================================================
-- 2. FUNCIONES AUXILIARES QUE USAN LAS TABLAS
-- ============================================================================
-- Va antes de las tablas: patients.nombre_norm la usa como DEFAULT.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'extensions', 'pg_temp'
AS $function$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$function$;


-- ============================================================================
-- 3. TABLAS
-- ============================================================================
-- Orden por dependencias: patients y profiles antes que quienes las referencian.

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    updated_at timestamp with time zone,
    full_name text,
    avatar_url text,
    website text,
    accepted_insurances text[] DEFAULT '{}'::text[],
    services jsonb DEFAULT '[]'::jsonb,
    chatbot_context_url text,
    google_refresh_token text,
    contact_phone text,
    business_name text,
    whatsapp_instance text,
    whatsapp_status text,
    system_prompt text,
    apikey_evolution text,
    notification_phone text,
    role text DEFAULT 'dentist'::text,
    booking_slug text,
    onboarding_completed_at timestamp with time zone,
    bot_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_booking_slug_key UNIQUE (booking_slug),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['dentist'::text, 'admin'::text]))),
    CONSTRAINT username_length CHECK ((char_length(full_name) >= 3)),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.patients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    nombre text NOT NULL,
    dni text,
    telefono text,
    email text,
    obra_social text,
    numero_afiliado text,
    fecha_nacimiento date,
    alergias text DEFAULT 'Ninguna'::text,
    antecedentes text DEFAULT 'Ninguno'::text,
    notas text,
    historia_clinica_url text,
    ultima_visita timestamp with time zone,
    estado text DEFAULT 'Activo'::text,
    user_id uuid DEFAULT auth.uid(),
    deleted_at timestamp with time zone,
    consentimiento_url text,
    nombre_norm text DEFAULT lower(immutable_unaccent(nombre)),
    CONSTRAINT patients_pkey PRIMARY KEY (id),
    CONSTRAINT patients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    title text NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    duration integer,
    appointment_type text,
    patient_id uuid,
    status text DEFAULT 'pending'::text,
    notes text,
    google_event_id text,
    user_id uuid DEFAULT auth.uid(),
    CONSTRAINT appointments_pkey PRIMARY KEY (id),
    CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT appointments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid DEFAULT auth.uid(),
    CONSTRAINT schedules_pkey PRIMARY KEY (id),
    CONSTRAINT schedules_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.odontograms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid DEFAULT auth.uid(),
    CONSTRAINT odontograms_pkey PRIMARY KEY (id),
    CONSTRAINT odontograms_patient_id_key UNIQUE (patient_id),
    CONSTRAINT odontograms_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT odontograms_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.treatment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid,
    tooth_number integer,
    procedure_type text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid DEFAULT auth.uid(),
    diagnostico text,
    tratamiento text,
    archivo_url text,
    fecha timestamp with time zone,
    CONSTRAINT treatment_history_pkey PRIMARY KEY (id),
    CONSTRAINT treatment_history_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT treatment_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.tenant_faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    tenant_id uuid NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    CONSTRAINT tenant_faqs_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_faqs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.chat_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid,
    jid text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    whatsapp_instance text,
    status text DEFAULT 'processed'::text,
    CONSTRAINT chat_history_pkey PRIMARY KEY (id),
    CONSTRAINT chat_history_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);
-- Sin CHECK sobre `status`: chat-webhook usa 'pending', 'processed' y 'failed'.
-- 'failed' deja auditable un envio que Evolution rechazo, en vez de borrarlo.

CREATE TABLE IF NOT EXISTS public.debug_payloads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    function_name text,
    payload jsonb,
    CONSTRAINT debug_payloads_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    price_monthly numeric(10,2) NOT NULL,
    price_yearly numeric(10,2),
    currency text DEFAULT 'ARS'::text,
    features jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    feature_keys text[] DEFAULT '{}'::text[],
    trial_days integer,
    CONSTRAINT subscription_plans_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_id uuid,
    status text DEFAULT 'trial'::text,
    mercadopago_sub_id text,
    mercadopago_payer_id text,
    trial_ends_at timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pending_plan_id uuid,
    pending_plan_effective_at timestamp with time zone,
    CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT subscriptions_user_id_key UNIQUE (user_id),
    CONSTRAINT subscriptions_pending_plan_id_fkey FOREIGN KEY (pending_plan_id) REFERENCES subscription_plans(id),
    CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
    CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT subscriptions_user_id_profiles_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.feature_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    feature_key text NOT NULL,
    enabled boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT feature_permissions_pkey PRIMARY KEY (id),
    CONSTRAINT feature_permissions_user_id_feature_key_key UNIQUE (user_id, feature_key),
    CONSTRAINT feature_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admin_users_pkey PRIMARY KEY (id),
    CONSTRAINT admin_users_user_id_key UNIQUE (user_id),
    CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    mp_resource_id text,
    user_id uuid,
    payload jsonb,
    processed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    mp_status text,
    CONSTRAINT payment_events_pkey PRIMARY KEY (id),
    CONSTRAINT payment_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.processed_mp_events (
    event_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT processed_mp_events_pkey PRIMARY KEY (event_key)
);

CREATE TABLE IF NOT EXISTS public.public_booking_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_hash text NOT NULL,
    user_id uuid,
    dni text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT public_booking_attempts_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT support_messages_pkey PRIMARY KEY (id),
    CONSTRAINT support_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);


-- ============================================================================
-- 4. INDICES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user_start ON public.appointments USING btree (user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_chat_history_lookup ON public.chat_history USING btree (jid, whatsapp_instance, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_odontograms_user_id ON public.odontograms USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_patients_dni_trgm ON public.patients USING gin (dni gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_nombre_norm_trgm ON public.patients USING gin (nombre_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON public.patients USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_user_id ON public.payment_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_pba_ip_time ON public.public_booking_attempts USING btree (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_booking_slug ON public.profiles USING btree (booking_slug);
CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON public.schedules USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_plan ON public.subscriptions USING btree (pending_plan_effective_at) WHERE (pending_plan_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_user_id ON public.support_messages USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_faqs_tenant_id ON public.tenant_faqs USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_treatment_history_patient_id ON public.treatment_history USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_history_user_id ON public.treatment_history USING btree (user_id);
CREATE INDEX IF NOT EXISTS support_messages_created_at_idx ON public.support_messages USING btree (created_at DESC);


-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================
-- Todas las tablas tienen RLS habilitado. Las que no declaran politicas
-- (debug_payloads, processed_mp_events, public_booking_attempts, y admin_users /
-- payment_events via deny_all) solo son accesibles con service_role: RLS sin
-- politicas bloquea todo por defecto.
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debug_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odontograms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_mp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_booking_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_history ENABLE ROW LEVEL SECURITY;

-- ── Datos del odontologo: aislamiento por user_id ───────────────────────────
-- auth.uid() va envuelto en (SELECT ...) para que Postgres lo evalue una sola
-- vez por query en vez de una vez por fila (lint 0003, auth_rls_initplan).
CREATE POLICY "Users can CRUD own appointments" ON public.appointments AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can CRUD own odontograms" ON public.odontograms AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can CRUD own patients" ON public.patients AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can CRUD own schedules" ON public.schedules AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can CRUD own treatment history" ON public.treatment_history AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can manage their own faqs" ON public.tenant_faqs AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.uid() AS uid) = tenant_id))
  WITH CHECK (((SELECT auth.uid() AS uid) = tenant_id));

-- ── Perfil ──────────────────────────────────────────────────────────────────
-- Sin politica DELETE a proposito: el perfil se borra con el usuario (cascade).
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((SELECT auth.uid() AS uid) = id));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING (((SELECT auth.uid() AS uid) = id))
  WITH CHECK (((SELECT auth.uid() AS uid) = id));
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING (((SELECT auth.uid() AS uid) = id));

-- ── Soporte ─────────────────────────────────────────────────────────────────
CREATE POLICY "users insert own support messages" ON public.support_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "users read own support messages" ON public.support_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid() AS uid) = user_id));

-- ── Chatbot ─────────────────────────────────────────────────────────────────
CREATE POLICY tenant_can_view_own ON public.chat_history AS PERMISSIVE FOR SELECT TO authenticated
  USING ((tenant_id = (SELECT auth.uid() AS uid)));

-- ── Facturacion: el usuario lee lo suyo, nunca escribe ──────────────────────
-- Todas las escrituras pasan por Edge Functions con service_role.
CREATE POLICY users_see_own_subscription ON public.subscriptions AS PERMISSIVE FOR SELECT TO public
  USING (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY users_see_own_permissions ON public.feature_permissions AS PERMISSIVE FOR SELECT TO public
  USING (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY subscription_plans_public_read ON public.subscription_plans AS PERMISSIVE FOR SELECT TO public
  USING (true);

-- ── Tablas administrativas: negacion explicita ──────────────────────────────
CREATE POLICY deny_all_users ON public.admin_users AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY deny_all_users ON public.debug_payloads AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY deny_all_users ON public.payment_events AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Tablas service-role-only: ademas de RLS sin politicas, se revocan privilegios
-- para sacarlas del schema de GraphQL (lints 0026/0027).
REVOKE ALL ON public.processed_mp_events FROM anon, authenticated;
REVOKE ALL ON public.public_booking_attempts FROM anon, authenticated;


-- ============================================================================
-- 6. FUNCIONES
-- ============================================================================

-- ── Turnos: creacion y edicion atomicas ─────────────────────────────────────
-- Las tres funciones toman el MISMO advisory lock (hashtext('appt:' || user_id))
-- como primera sentencia. No es cosmetico: sin el, dos requests concurrentes
-- para el mismo horario veian ambas COUNT=0 y reservaban el turno dos veces
-- (link publico + bot de WhatsApp + app, en cualquier combinacion). El lock se
-- retiene hasta el COMMIT, asi que el segundo request espera y ve el turno ya
-- insertado por el primero. Compartir la clave las serializa ENTRE SI, no solo
-- a cada una contra si misma.

CREATE OR REPLACE FUNCTION public.confirm_appointment_safe(p_title text, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_duration integer, p_appointment_type text, p_patient_id uuid, p_notes text, p_status text DEFAULT 'confirmed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_conflict_count INT;
    v_new_appt_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('appt:' || auth.uid()::text));

    SELECT COUNT(*) INTO v_conflict_count
    FROM appointments
    WHERE user_id = auth.uid()
      AND status != 'cancelled'
      AND status != 'Cancelado'
      AND (p_start_time < end_time AND p_end_time > start_time);

    IF v_conflict_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'id', NULL, 'error', 'El horario ya está ocupado.');
    END IF;

    INSERT INTO appointments (
        user_id, title, start_time, end_time, duration,
        appointment_type, patient_id, notes, status
    ) VALUES (
        auth.uid(), p_title, p_start_time, p_end_time, p_duration,
        p_appointment_type, p_patient_id, p_notes, p_status
    ) RETURNING id INTO v_new_appt_id;

    RETURN jsonb_build_object('success', true, 'id', v_new_appt_id, 'error', NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_appointment_safe(p_appointment_id uuid, p_patient_id uuid, p_title text, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_duration integer, p_appointment_type text, p_notes text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_overlapping_count int;
    v_result jsonb;
    v_user_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('appt:' || auth.uid()::text));

    SELECT user_id INTO v_user_id
    FROM appointments
    WHERE id = p_appointment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'data', NULL, 'error', 'Turno no encontrado');
    END IF;

    IF v_user_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'data', NULL, 'error', 'No tienes permiso para modificar este turno');
    END IF;

    SELECT count(*)
    INTO v_overlapping_count
    FROM appointments
    WHERE id != p_appointment_id
      AND user_id = auth.uid()
      AND status != 'cancelled'
      AND status != 'Cancelado'
      AND (start_time < p_end_time AND end_time > p_start_time);

    IF v_overlapping_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'data', NULL, 'error', 'El horario seleccionado ya no está disponible');
    END IF;

    UPDATE appointments
    SET
        patient_id = p_patient_id,
        title = p_title,
        start_time = p_start_time,
        end_time = p_end_time,
        duration = p_duration,
        appointment_type = p_appointment_type,
        notes = p_notes,
        status = p_status
    WHERE id = p_appointment_id AND user_id = auth.uid()
    RETURNING to_jsonb(appointments.*) INTO v_result;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'data', NULL, 'error', 'Error al actualizar el turno');
    END IF;

    RETURN jsonb_build_object('success', true, 'data', v_result, 'error', NULL);
END;
$function$;

-- Acepta p_user_id explicito porque la llaman el link publico y el bot, sin
-- sesion de auth. Por eso su EXECUTE queda SOLO en service_role: si
-- `authenticated` pudiera ejecutarla, cualquier odontologo registrado meteria
-- turnos en la agenda de otro.
CREATE OR REPLACE FUNCTION public.confirm_public_appointment_safe(p_user_id uuid, p_patient_id uuid, p_title text, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_duration integer, p_appointment_type text, p_notes text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conflict_count int;
  v_new_id         uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('appt:' || p_user_id::text));

  SELECT COUNT(*) INTO v_conflict_count
  FROM appointments
  WHERE user_id = p_user_id
    AND status NOT IN ('cancelled')
    AND tstzrange(start_time, end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)');

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El horario ya está ocupado.');
  END IF;

  INSERT INTO appointments (
    user_id, patient_id, title, start_time, end_time,
    duration, appointment_type, notes, status
  )
  VALUES (
    p_user_id, p_patient_id, p_title, p_start_time, p_end_time,
    p_duration, p_appointment_type, p_notes, p_status
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_unique_insurances()
 RETURNS TABLE(obra_social text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT p.obra_social
    FROM patients p
    WHERE p.obra_social IS NOT NULL 
      AND p.obra_social != ''
      AND p.user_id = auth.uid()
    ORDER BY p.obra_social ASC;
END;
$function$;

-- ── Alta de usuario ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    full_name_val text;
    avatar_url_val text;
    d int;
BEGIN
    full_name_val := COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
    avatar_url_val := COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '');

    INSERT INTO public.profiles (
        id, full_name, avatar_url, accepted_insurances, business_name, whatsapp_status
    )
    VALUES (
        new.id, full_name_val, avatar_url_val, ARRAY['Particular'], 'Mi Consultorio', 'disconnected'
    );

    -- Horario por defecto: lunes a viernes, mañana y tarde.
    FOR d IN 1..5 LOOP
        INSERT INTO public.schedules (user_id, day_of_week, start_time, end_time, is_active)
        VALUES 
            (new.id, d, '09:00:00', '13:00:00', true),
            (new.id, d, '17:00:00', '20:00:00', true);
    END LOOP;

    RETURN new;
END;
$function$;

-- Las feature keys se derivan de los datos, no de una lista hardcodeada: si no,
-- podar una clave del sistema la revive en la siguiente alta.
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
  SELECT id, feature_keys, trial_days
    INTO v_plan_id, v_plan_feature_keys, v_trial_days
  FROM public.subscription_plans
  WHERE trial_days IS NOT NULL
    AND is_active = true
  ORDER BY sort_order
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE WARNING 'handle_new_user_subscription: ningun plan activo tiene trial_days; el alta % queda sin plan.', NEW.id;
  END IF;

  IF v_trial_days IS NULL THEN
    v_trial_days := 14;
  END IF;

  INSERT INTO public.subscriptions (user_id, plan_id, status, trial_ends_at)
  VALUES (NEW.id, v_plan_id, 'trial', now() + (v_trial_days || ' days')::interval)
  ON CONFLICT (user_id) DO NOTHING;

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

-- Un usuario no puede promoverse a admin editando su propio perfil.
CREATE OR REPLACE FUNCTION public.prevent_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;
  RETURN NEW;
END;
$function$;

-- ── Cambios de plan programados (downgrade diferido) ────────────────────────
-- El UNION con feature_permissions no es cosmetico: si una key dejara de
-- figurar en todos los planes, sin el nunca volveria a revocarse en un
-- downgrade y el usuario la conservaria para siempre.
CREATE OR REPLACE FUNCTION public.apply_pending_plan_changes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_all_features text[];
  v_sub     record;
  v_keys    text[];
  v_key     text;
  v_applied integer := 0;
BEGIN
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
$function$;


-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS trg_prevent_role_change ON public.profiles;
CREATE TRIGGER trg_prevent_role_change BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_change();

-- Sobre auth.users: es donde se auto-provisiona el tenant al registrarse.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_subscription();


-- ============================================================================
-- 8. PERMISOS DE EJECUCION
-- ============================================================================
-- El EXECUTE de una funcion viene del grant por defecto a PUBLIC. Por eso hay
-- que REVOKE ... FROM PUBLIC: revocar solo de anon/authenticated deja el
-- privilegio heredado. Despues se re-otorga a quien si debe ejecutarla.

REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_pending_plan_changes()   FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user()              TO service_role;
GRANT  EXECUTE ON FUNCTION public.handle_new_user_subscription() TO service_role;
GRANT  EXECUTE ON FUNCTION public.prevent_role_change()          TO service_role;
GRANT  EXECUTE ON FUNCTION public.apply_pending_plan_changes()   TO service_role;

REVOKE EXECUTE ON FUNCTION public.confirm_appointment_safe(text,timestamptz,timestamptz,integer,text,uuid,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirm_appointment_safe(text,timestamptz,timestamptz,integer,text,uuid,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_appointment_safe(uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_appointment_safe(uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_unique_insurances() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_unique_insurances() TO authenticated, service_role;

-- Solo service_role: acepta un p_user_id arbitrario (ver comentario arriba).
REVOKE EXECUTE ON FUNCTION public.confirm_public_appointment_safe(uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_public_appointment_safe(uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text) TO service_role;

GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO anon, authenticated, service_role;


-- ============================================================================
-- 9. STORAGE
-- ============================================================================
-- Los buckets se crean desde el panel de Supabase; aca van sus limites y
-- politicas, que son lo que el repo tiene que poder reconstruir.

-- clinical-records (privado): espeja el limite client-side de PatientService.
-- Se incluye application/octet-stream a proposito: en Windows un PDF sin
-- asociacion registrada llega con file.type vacio, y sin esa entrada se
-- rechazarian subidas legitimas.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
      'application/pdf', 'image/jpeg', 'image/png', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ]
WHERE id = 'clinical-records';

UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif']
WHERE id = 'avatars';

-- avatars es publico: no necesita politica SELECT para servir URLs, y tenerla
-- permitia listar todos los archivos a cualquier usuario autenticado. El
-- ownership se expresa como prefijo del filename ("{userId}-{random}.{ext}").
DROP POLICY IF EXISTS "avatars: owner insert" ON storage.objects;
CREATE POLICY "avatars: owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND name LIKE ((SELECT auth.uid())::text || '-%'));

DROP POLICY IF EXISTS "avatars: owner update" ON storage.objects;
CREATE POLICY "avatars: owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND name LIKE ((SELECT auth.uid())::text || '-%'))
  WITH CHECK (bucket_id = 'avatars' AND name LIKE ((SELECT auth.uid())::text || '-%'));

DROP POLICY IF EXISTS "avatars: owner delete" ON storage.objects;
CREATE POLICY "avatars: owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND name LIKE ((SELECT auth.uid())::text || '-%'));


-- ============================================================================
-- 10. CRON
-- ============================================================================
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

-- NOTA: el job `cleanup-orphaned-files` (domingos 03:00 UTC) hace net.http_post
-- a la Edge Function homonima con el anon key. No se reproduce aca porque lleva
-- la URL y la clave del proyecto: se recrea a mano por entorno.
