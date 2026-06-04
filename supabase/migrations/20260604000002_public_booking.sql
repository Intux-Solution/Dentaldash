-- Add booking_slug to profiles for shareable booking links
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS booking_slug text UNIQUE;

-- Index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_profiles_booking_slug ON profiles (booking_slug);

-- Public appointment RPC: same overlap-check as confirm_appointment_safe
-- but accepts an explicit p_user_id (used when no auth session exists)
-- SECURITY DEFINER so it runs with elevated privileges and bypasses RLS
CREATE OR REPLACE FUNCTION confirm_public_appointment_safe(
  p_user_id         uuid,
  p_patient_id      uuid,
  p_title           text,
  p_start_time      timestamptz,
  p_end_time        timestamptz,
  p_duration        int,
  p_appointment_type text,
  p_notes           text,
  p_status          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict_count int;
  v_new_id         uuid;
BEGIN
  -- Check for overlapping appointments for this dentist
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
$$;

-- Grant execute to anon and authenticated roles (Edge Function calls with service role but grant for safety)
GRANT EXECUTE ON FUNCTION confirm_public_appointment_safe TO service_role;
