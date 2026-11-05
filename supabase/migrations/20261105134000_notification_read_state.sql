ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notification_events_unread
  ON public.notification_events(user_id, event_type, created_at DESC)
  WHERE read_at IS NULL;

DROP POLICY IF EXISTS notification_events_update ON public.notification_events;
CREATE POLICY notification_events_update
  ON public.notification_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_events_delete ON public.notification_events;
CREATE POLICY notification_events_delete
  ON public.notification_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT UPDATE, DELETE ON public.notification_events TO authenticated;
