-- ============================================================
-- Idempotencia de webhooks de MercadoPago
-- ============================================================
-- MercadoPago reintenta los webhooks que fallan o tardan. Sin idempotencia,
-- el mismo evento (mismo preapproval + mismo estado) se reprocesaria y, ademas
-- de generar filas duplicadas en payment_events, dispararia upserts innecesarios.
--
-- Esta tabla registra cada (preapproval, estado) ya aplicado. El webhook intenta
-- insertar la clave antes de actuar; si choca con la PK (unique_violation 23505),
-- responde 200 OK sin reprocesar.

CREATE TABLE IF NOT EXISTS public.processed_mp_events (
  event_key  text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.processed_mp_events ENABLE ROW LEVEL SECURITY;
-- Sin politicas: solo el service role (Edge Function mp-webhook) accede.

COMMENT ON TABLE public.processed_mp_events IS
  'Claves (preapproval:estado) de eventos de MercadoPago ya procesados. Garantiza idempotencia del webhook.';
