-- ============================================================
-- Fix condición de carrera: doble reserva en los RPCs de turnos
-- ============================================================
-- Los tres RPCs hacían check-then-insert (SELECT COUNT(*) de solapamiento,
-- luego INSERT/UPDATE) sin ningún lock. Bajo READ COMMITTED, dos requests
-- concurrentes para el mismo horario podían ver ambos COUNT=0 y reservar
-- el mismo turno dos veces (link público + bot de WhatsApp + app, en
-- cualquier combinación).
--
-- Fix: pg_advisory_xact_lock por dentista como primera sentencia de cada
-- función. El lock se retiene hasta el COMMIT/ROLLBACK de la transacción
-- de la función (RPC = una transacción), así que el segundo request espera
-- y ve el turno ya insertado por el primero.
--
-- La clave del lock ('appt:' || user_id) es la MISMA en las tres funciones
-- a propósito: serializa entre sí a confirm_appointment_safe (app),
-- update_appointment_safe (app) y confirm_public_appointment_safe (link
-- público / bot de WhatsApp) para el mismo dentista, no solo cada función
-- contra sí misma.
--
-- confirm_appointment_safe y update_appointment_safe no estaban versionadas
-- en el repo (solo vivían en la DB de producción); esta migración también
-- las vuelca al historial de migraciones con sus cuerpos reales.

CREATE OR REPLACE FUNCTION public.confirm_appointment_safe(
  p_title text,
  p_start_time timestamp with time zone,
  p_end_time timestamp with time zone,
  p_duration integer,
  p_appointment_type text,
  p_patient_id uuid,
  p_notes text,
  p_status text DEFAULT 'confirmed'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_conflict_count INT;
    v_new_appt_id UUID;
BEGIN
    -- Serializa las reservas/actualizaciones de este dentista dentro de la
    -- transacción (mismo espacio de claves que las otras dos funciones).
    PERFORM pg_advisory_xact_lock(hashtext('appt:' || auth.uid()::text));

    -- Verificar solapamiento de turnos para el mismo usuario
    SELECT COUNT(*) INTO v_conflict_count
    FROM appointments
    WHERE user_id = auth.uid()
      AND status != 'cancelled'
      AND status != 'Cancelado'
      AND (p_start_time < end_time AND p_end_time > start_time);

    IF v_conflict_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'id', NULL, 'error', 'El horario ya está ocupado.');
    END IF;

    -- Inserción segura (incorporando explícitamente el user_id del usuario autenticado)
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

CREATE OR REPLACE FUNCTION public.update_appointment_safe(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_title text,
  p_start_time timestamp with time zone,
  p_end_time timestamp with time zone,
  p_duration integer,
  p_appointment_type text,
  p_notes text,
  p_status text
)
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
    -- Serializa las reservas/actualizaciones de este dentista dentro de la transacción.
    PERFORM pg_advisory_xact_lock(hashtext('appt:' || auth.uid()::text));

    -- Verificar propiedad del turno
    SELECT user_id INTO v_user_id
    FROM appointments
    WHERE id = p_appointment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'data', NULL, 'error', 'Turno no encontrado');
    END IF;

    IF v_user_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'data', NULL, 'error', 'No tienes permiso para modificar este turno');
    END IF;

    -- Verificar solapamientos (excluyendo este mismo turno)
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

    -- Actualizar
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

CREATE OR REPLACE FUNCTION public.confirm_public_appointment_safe(
  p_user_id uuid,
  p_patient_id uuid,
  p_title text,
  p_start_time timestamp with time zone,
  p_end_time timestamp with time zone,
  p_duration integer,
  p_appointment_type text,
  p_notes text,
  p_status text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conflict_count int;
  v_new_id         uuid;
BEGIN
  -- Mismo espacio de claves que confirm_appointment_safe / update_appointment_safe:
  -- serializa TODAS las reservas del dentista sin importar el punto de entrada
  -- (app autenticada, link público, bot de WhatsApp).
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
