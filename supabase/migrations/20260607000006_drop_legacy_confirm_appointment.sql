-- ============================================================
-- Eliminar la funcion legacy confirm_appointment
-- ============================================================
-- confirm_appointment (SECURITY DEFINER) NO filtra por tenant en el chequeo de
-- solapamiento y NO setea user_id en el INSERT. Quedo obsoleta: ningun consumidor
-- de DentalDash la usa.
--   - El frontend usa confirm_appointment_safe (AppointmentRepository.ts).
--   - El chat-webhook (bot WhatsApp) hace INSERT directo a appointments.
--   - public-booking usa confirm_public_appointment_safe.
--   - DentalDash no usa n8n (su stack es Edge Functions); el bot corre en chat-webhook.
-- Por eso es segura de eliminar.

DROP FUNCTION IF EXISTS public.confirm_appointment(
  uuid, text, timestamptz, timestamptz, integer, text, text, text
);
