-- ============================================================
-- Rate limiting del endpoint publico de reservas (public-booking)
-- ============================================================
-- public-booking es el unico endpoint sin auth que escribe en la DB (crea
-- pacientes y turnos). Sin limite, un atacante puede llenar la agenda de un
-- dentista con turnos basura. Registramos cada intento (por IP hasheada) para
-- aplicar limites por hora/dia. La Edge Function usa service_role (bypassa RLS).

CREATE TABLE IF NOT EXISTS public.public_booking_attempts (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash    text NOT NULL,
  user_id    uuid,
  dni        text,
  created_at timestamptz DEFAULT now()
);

-- Indice para los conteos por IP + ventana de tiempo
CREATE INDEX IF NOT EXISTS idx_pba_ip_time
  ON public.public_booking_attempts (ip_hash, created_at);

ALTER TABLE public.public_booking_attempts ENABLE ROW LEVEL SECURITY;
-- Sin politicas: solo el service role accede (la IP se guarda hasheada, no en claro).

COMMENT ON TABLE public.public_booking_attempts IS
  'Registro de intentos de reserva publica para rate limiting. ip_hash = SHA-256 de la IP.';
