-- Additive migration: add AI analysis and category score columns to website_analyses.
-- Preserves all existing columns, rows, and constraints. Safe to re-run.
BEGIN;

DO $$
DECLARE
  col TEXT;
BEGIN
  -- ai_analysis JSONB (stores structured OpenAI findings, visual audit, completeness)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'website_analyses' AND column_name = 'ai_analysis'
  ) THEN
    ALTER TABLE public.website_analyses ADD COLUMN ai_analysis JSONB;
  END IF;

  -- performance_score NUMERIC (0-100)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'website_analyses' AND column_name = 'performance_score'
  ) THEN
    ALTER TABLE public.website_analyses ADD COLUMN performance_score NUMERIC;
  END IF;

  -- accessibility_score NUMERIC (0-100)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'website_analyses' AND column_name = 'accessibility_score'
  ) THEN
    ALTER TABLE public.website_analyses ADD COLUMN accessibility_score NUMERIC;
  END IF;

  -- seo_score NUMERIC (0-100)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'website_analyses' AND column_name = 'seo_score'
  ) THEN
    ALTER TABLE public.website_analyses ADD COLUMN seo_score NUMERIC;
  END IF;

  -- best_practices_score NUMERIC (0-100)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'website_analyses' AND column_name = 'best_practices_score'
  ) THEN
    ALTER TABLE public.website_analyses ADD COLUMN best_practices_score NUMERIC;
  END IF;
END $$;

-- Helpful indexes (additive, idempotent).
CREATE INDEX IF NOT EXISTS idx_website_analyses_analysis_provider
  ON public.website_analyses(analysis_provider);

CREATE INDEX IF NOT EXISTS idx_website_analyses_analyzed_at
  ON public.website_analyses(analyzed_at DESC);

COMMIT;