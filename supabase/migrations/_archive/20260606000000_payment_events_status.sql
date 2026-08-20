-- ============================================================
-- payment_events: estado real reportado por MercadoPago
-- ============================================================
-- El campo `processed` solo indica que el webhook ejecuto su flujo,
-- no si el pago fue exitoso. Agregamos `mp_status` para guardar el
-- estado real del preapproval consultado a MercadoPago.

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS mp_status text;

COMMENT ON COLUMN public.payment_events.mp_status IS
  'Estado real reportado por MercadoPago para el preapproval (authorized, pending, paused, cancelled). null = aun no resuelto.';
