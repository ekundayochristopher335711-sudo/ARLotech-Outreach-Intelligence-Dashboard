ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

WITH ranked_outbound AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY
        user_id,
        COALESCE(prospect_id, id),
        lower(COALESCE(recipient_email, ''))
      ORDER BY sent_at ASC NULLS LAST, created_at ASC NULLS LAST, id ASC
    ) AS root_id
  FROM public.email_messages
  WHERE direction = 'outbound'
    AND status IN ('sent', 'replied')
)
UPDATE public.email_messages AS message
SET thread_id = ranked_outbound.root_id,
    read_at = COALESCE(message.read_at, message.sent_at, message.created_at)
FROM ranked_outbound
WHERE message.id = ranked_outbound.id
  AND message.thread_id IS NULL;

WITH inbound_threads AS (
  SELECT
    message.id,
    COALESCE((
      SELECT COALESCE(outbound.thread_id, outbound.id)
      FROM public.email_messages AS outbound
      WHERE outbound.user_id = message.user_id
        AND outbound.direction = 'outbound'
        AND outbound.status IN ('sent', 'replied')
        AND lower(COALESCE(outbound.recipient_email, '')) = lower(COALESCE(message.sender_email, ''))
      ORDER BY
        (outbound.sent_at <= message.received_at) DESC NULLS LAST,
        outbound.sent_at DESC NULLS LAST,
        outbound.created_at DESC NULLS LAST
      LIMIT 1
    ), message.id) AS thread_id
  FROM public.email_messages AS message
  WHERE message.direction = 'inbound'
    AND message.thread_id IS NULL
)
UPDATE public.email_messages AS message
SET thread_id = inbound_threads.thread_id
FROM inbound_threads
WHERE message.id = inbound_threads.id;

UPDATE public.email_messages
SET thread_id = id
WHERE thread_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_user_thread_created
  ON public.email_messages(user_id, thread_id, created_at DESC);
