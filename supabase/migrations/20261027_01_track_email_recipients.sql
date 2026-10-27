ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS recipient_email TEXT;

UPDATE public.email_messages AS message
SET recipient_email = lower(btrim(prospect.email))
FROM public.prospects AS prospect
WHERE message.prospect_id = prospect.id
  AND message.user_id = prospect.user_id
  AND message.direction = 'outbound'
  AND message.recipient_email IS NULL
  AND prospect.email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_user_recipient_sent
  ON public.email_messages(user_id, recipient_email)
  WHERE direction = 'outbound' AND status = 'sent' AND recipient_email IS NOT NULL;
