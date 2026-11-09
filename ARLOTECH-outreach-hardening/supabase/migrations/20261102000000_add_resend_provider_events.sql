BEGIN;

CREATE TABLE public.email_provider_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email_message_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'resend' CHECK (provider = 'resend'),
  provider_event_id TEXT NOT NULL,
  provider_message_id TEXT,
  recipient_email TEXT,
  event_type TEXT NOT NULL,
  event_status TEXT,
  suppression_origin TEXT,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_provider_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX email_provider_events_user_occurred_idx
  ON public.email_provider_events(user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.email_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_provider_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.email_provider_events TO authenticated;
CREATE POLICY email_provider_events_owner_select
  ON public.email_provider_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.resend_provider_suppressions (
  normalized_email TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  source_id TEXT,
  provider_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resend_provider_suppressions_normalized_email_check
    CHECK (normalized_email = lower(btrim(normalized_email)) AND normalized_email <> '')
);

ALTER TABLE public.resend_provider_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resend_provider_suppressions FROM anon, authenticated;
REVOKE ALL ON TABLE public.resend_provider_suppressions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.resend_provider_suppressions TO service_role;

CREATE OR REPLACE FUNCTION public.record_resend_provider_event(
  p_provider_event_id TEXT,
  p_event_type TEXT,
  p_provider_message_id TEXT,
  p_recipient_email TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_event_status TEXT,
  p_suppression_origin TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_message public.email_messages%ROWTYPE;
  v_next_status TEXT;
  v_suppression_origin TEXT;
  v_row_count INTEGER;
  v_message_rank INTEGER;
  v_next_rank INTEGER;
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) > 200
    OR p_event_type NOT IN (
      'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
      'email.complained', 'email.failed', 'email.suppressed',
      'suppression.added', 'suppression.removed'
    )
    OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'Invalid Resend event arguments';
  END IF;
  IF p_event_status IS NOT NULL AND p_event_status NOT IN (
    'accepted', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed'
  ) THEN
    RAISE EXCEPTION 'Invalid Resend event status';
  END IF;

  IF p_provider_message_id IS NOT NULL THEN
    SELECT * INTO v_message
    FROM public.email_messages
    WHERE provider = 'resend'
      AND direction = 'outbound'
      AND provider_message_id = p_provider_message_id
      AND (p_recipient_email IS NULL OR lower(btrim(recipient_email)) = lower(btrim(p_recipient_email)))
    ORDER BY sent_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  INSERT INTO public.email_provider_events (
    user_id,
    email_message_id,
    provider,
    provider_event_id,
    provider_message_id,
    recipient_email,
    event_type,
    event_status,
    suppression_origin,
    reason,
    occurred_at
  ) VALUES (
    v_message.user_id,
    v_message.id,
    'resend',
    p_provider_event_id,
    p_provider_message_id,
    lower(btrim(p_recipient_email)),
    p_event_type,
    p_event_status,
    p_suppression_origin,
    left(p_reason, 500),
    p_occurred_at
  )
  ON CONFLICT (provider, provider_event_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('duplicate', TRUE, 'matched', v_message.id IS NOT NULL);
  END IF;

  IF p_event_type = 'suppression.removed' AND p_recipient_email IS NOT NULL THEN
    DELETE FROM public.resend_provider_suppressions
    WHERE normalized_email = lower(btrim(p_recipient_email));

    DELETE FROM public.suppression_list
    WHERE normalized_email = lower(btrim(p_recipient_email))
      AND source = 'resend_webhook';
  END IF;

  v_suppression_origin := COALESCE(
    p_suppression_origin,
    CASE p_event_type
      WHEN 'email.bounced' THEN 'bounce'
      WHEN 'email.complained' THEN 'complaint'
      WHEN 'email.suppressed' THEN 'resend'
      ELSE NULL
    END
  );

  IF v_suppression_origin IS NOT NULL AND p_recipient_email IS NOT NULL
    AND p_event_type <> 'suppression.removed' THEN
    INSERT INTO public.resend_provider_suppressions (
      normalized_email, origin, source_id, provider_event_id
    ) VALUES (
      lower(btrim(p_recipient_email)), v_suppression_origin, p_provider_message_id, p_provider_event_id
    )
    ON CONFLICT (normalized_email) DO UPDATE SET
      origin = CASE
        WHEN public.resend_provider_suppressions.origin IN ('bounce', 'complaint', 'manual')
          THEN public.resend_provider_suppressions.origin
        ELSE EXCLUDED.origin
      END,
      source_id = COALESCE(public.resend_provider_suppressions.source_id, EXCLUDED.source_id),
      provider_event_id = EXCLUDED.provider_event_id,
      updated_at = NOW();

    IF v_message.user_id IS NOT NULL THEN
      INSERT INTO public.suppression_list (
        user_id, email, normalized_email, reason, source
      ) VALUES (
        v_message.user_id,
        lower(btrim(p_recipient_email)),
        lower(btrim(p_recipient_email)),
        'Resend suppression: ' || v_suppression_origin,
        'resend_webhook'
      )
      ON CONFLICT (user_id, normalized_email) DO NOTHING;
    END IF;
  END IF;

  v_next_status := CASE
    WHEN p_event_type = 'email.sent' THEN 'sent'
    WHEN p_event_type = 'email.delivered' THEN 'delivered'
    WHEN p_event_type = 'email.delivery_delayed' THEN 'delivery_delayed'
    WHEN p_event_type = 'email.bounced' THEN 'bounced'
    WHEN p_event_type = 'email.complained' THEN 'complained'
    WHEN p_event_type = 'email.failed' THEN 'failed'
    WHEN p_event_type = 'email.suppressed' THEN 'suppressed'
    WHEN p_event_type = 'suppression.added' AND p_suppression_origin = 'bounce' THEN 'bounced'
    WHEN p_event_type = 'suppression.added' AND p_suppression_origin = 'complaint' THEN 'complained'
    WHEN p_event_type = 'suppression.added' THEN 'suppressed'
    ELSE NULL
  END;

  IF v_message.id IS NOT NULL AND v_next_status IS NOT NULL THEN
    v_message_rank := CASE v_message.status
      WHEN 'sent' THEN 10
      WHEN 'delivery_delayed' THEN 20
      WHEN 'failed' THEN 30
      WHEN 'delivered' THEN 40
      WHEN 'bounced' THEN 50
      WHEN 'complained' THEN 60
      WHEN 'suppressed' THEN 70
      ELSE 0
    END;
    v_next_rank := CASE v_next_status
      WHEN 'sent' THEN 10
      WHEN 'delivery_delayed' THEN 20
      WHEN 'failed' THEN 30
      WHEN 'delivered' THEN 40
      WHEN 'bounced' THEN 50
      WHEN 'complained' THEN 60
      WHEN 'suppressed' THEN 70
      ELSE 0
    END;
    IF v_next_rank > v_message_rank THEN
      UPDATE public.email_messages SET status = v_next_status WHERE id = v_message.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'duplicate', FALSE,
    'matched', v_message.id IS NOT NULL,
    'event_status', v_next_status,
    'user_id', v_message.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_resend_provider_event(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_resend_provider_event(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO service_role;

COMMIT;