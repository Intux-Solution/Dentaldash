-- ============================================================
-- profiles.bot_enabled: kill-switch del chatbot de WhatsApp
-- ============================================================
-- Permite apagar las respuestas automáticas SIN desconectar la instancia de
-- Evolution: desconectar destruye la sesión de WhatsApp y obliga al dentista a
-- volver a escanear el QR, así que hoy no hay forma de "atender a mano un rato".
--
-- `chat-webhook` lo lee en el tramo síncrono y descarta el mensaje ANTES de
-- marcarlo como leído, para que los no-leídos le queden visibles al dentista.
--
-- NOT NULL + DEFAULT constante no reescribe la tabla en PG >= 11.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bot_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.bot_enabled IS
  'Kill-switch del chatbot de WhatsApp. false = chat-webhook ignora los mensajes '
  'entrantes de esta instancia sin desconectarla de Evolution API.';
