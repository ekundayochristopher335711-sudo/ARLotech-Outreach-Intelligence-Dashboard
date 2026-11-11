-- Prospect relationship management: track proposals independently from email drafts.
CREATE TABLE IF NOT EXISTS public.prospect_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scope_summary TEXT,
  amount NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'Draft',
  sent_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prospect_proposals_status_check CHECK (status IN ('Draft', 'Sent', 'Accepted', 'Declined', 'Expired')),
  CONSTRAINT prospect_proposals_amount_check CHECK (amount IS NULL OR amount >= 0)
);

ALTER TABLE public.prospect_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospect_proposals_select ON public.prospect_proposals;
DROP POLICY IF EXISTS prospect_proposals_insert ON public.prospect_proposals;
DROP POLICY IF EXISTS prospect_proposals_update ON public.prospect_proposals;
DROP POLICY IF EXISTS prospect_proposals_delete ON public.prospect_proposals;
CREATE POLICY prospect_proposals_select ON public.prospect_proposals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY prospect_proposals_insert ON public.prospect_proposals FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.prospects p WHERE p.id = prospect_id AND p.user_id = auth.uid()
  )
);
CREATE POLICY prospect_proposals_update ON public.prospect_proposals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.prospects p WHERE p.id = prospect_id AND p.user_id = auth.uid()
  )
);
CREATE POLICY prospect_proposals_delete ON public.prospect_proposals FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_prospect_proposals_user_prospect ON public.prospect_proposals(user_id, prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_proposals_follow_up ON public.prospect_proposals(user_id, follow_up_at) WHERE follow_up_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_prospect_proposals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prospect_proposals_updated_at ON public.prospect_proposals;
CREATE TRIGGER prospect_proposals_updated_at BEFORE UPDATE ON public.prospect_proposals
FOR EACH ROW EXECUTE FUNCTION public.set_prospect_proposals_updated_at();
