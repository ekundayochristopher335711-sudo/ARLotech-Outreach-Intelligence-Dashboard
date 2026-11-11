ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS website_analysis_id UUID
  REFERENCES public.website_analyses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_website_analysis_id
  ON public.email_drafts(website_analysis_id);

DROP POLICY IF EXISTS email_drafts_insert ON public.email_drafts;
CREATE POLICY email_drafts_insert ON public.email_drafts FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (
    SELECT 1 FROM public.prospects AS prospect
    WHERE prospect.id = email_drafts.prospect_id AND prospect.user_id = auth.uid()
  )) AND
  (campaign_id IS NULL OR EXISTS (
    SELECT 1 FROM public.campaigns AS campaign
    WHERE campaign.id = email_drafts.campaign_id AND campaign.user_id = auth.uid()
  )) AND
  (website_analysis_id IS NULL OR EXISTS (
    SELECT 1 FROM public.website_analyses AS analysis
    WHERE analysis.id = email_drafts.website_analysis_id
      AND analysis.user_id = auth.uid()
      AND (email_drafts.prospect_id IS NULL OR analysis.prospect_id = email_drafts.prospect_id)
  ))
);

DROP POLICY IF EXISTS email_drafts_update ON public.email_drafts;
CREATE POLICY email_drafts_update ON public.email_drafts FOR UPDATE TO authenticated USING (
  auth.uid() = user_id
) WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (
    SELECT 1 FROM public.prospects AS prospect
    WHERE prospect.id = email_drafts.prospect_id AND prospect.user_id = auth.uid()
  )) AND
  (campaign_id IS NULL OR EXISTS (
    SELECT 1 FROM public.campaigns AS campaign
    WHERE campaign.id = email_drafts.campaign_id AND campaign.user_id = auth.uid()
  )) AND
  (website_analysis_id IS NULL OR EXISTS (
    SELECT 1 FROM public.website_analyses AS analysis
    WHERE analysis.id = email_drafts.website_analysis_id
      AND analysis.user_id = auth.uid()
      AND (email_drafts.prospect_id IS NULL OR analysis.prospect_id = email_drafts.prospect_id)
  ))
);

CREATE TABLE IF NOT EXISTS public.outreach_ai_generation_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.outreach_ai_generation_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_outreach_ai_generation()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.outreach_ai_generation_usage (user_id, window_started_at, request_count)
  VALUES (v_user_id, now(), 1)
  ON CONFLICT (user_id)
  DO UPDATE SET
    request_count = CASE
      WHEN public.outreach_ai_generation_usage.window_started_at <= now() - INTERVAL '24 hours' THEN 1
      ELSE public.outreach_ai_generation_usage.request_count + 1
    END,
    window_started_at = CASE
      WHEN public.outreach_ai_generation_usage.window_started_at <= now() - INTERVAL '24 hours' THEN now()
      ELSE public.outreach_ai_generation_usage.window_started_at
    END
  WHERE public.outreach_ai_generation_usage.window_started_at <= now() - INTERVAL '24 hours'
    OR public.outreach_ai_generation_usage.request_count < 40
  RETURNING request_count INTO v_count;

  RETURN v_count IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_outreach_ai_generation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_outreach_ai_generation() TO authenticated;
