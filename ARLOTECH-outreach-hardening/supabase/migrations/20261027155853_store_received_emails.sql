ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS sender_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_provider_message_direction
  ON public.email_messages(provider, provider_message_id, direction)
  WHERE provider_message_id IS NOT NULL;
