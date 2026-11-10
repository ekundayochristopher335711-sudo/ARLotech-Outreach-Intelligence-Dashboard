ALTER TABLE public.website_analyses
ADD COLUMN IF NOT EXISTS analysis_details JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'website_analyses'
      AND column_name = 'ai_analysis'
  ) THEN
    EXECUTE $migration$
      UPDATE public.website_analyses
      SET analysis_details = jsonb_strip_nulls(jsonb_build_object(
        'score_explanation', ai_analysis -> 'score_explanation',
        'technical_score', ai_analysis -> 'technical_score',
        'audit_completeness', ai_analysis -> 'audit_completeness',
        'html_inspection', ai_analysis -> 'html_inspection',
        'optimization_opportunities', ai_analysis -> 'optimization_opportunities',
        'diagnostics', ai_analysis -> 'diagnostics',
        'lighthouse_page_results', ai_analysis -> 'lighthouse_page_results',
        'screenshot_review', CASE
          WHEN jsonb_typeof(ai_analysis -> 'visual_audit') = 'object'
            THEN (ai_analysis -> 'visual_audit') - 'observations'
          ELSE NULL
        END
      ))
      WHERE ai_analysis IS NOT NULL
        AND analysis_details IS NULL
    $migration$;

    ALTER TABLE public.website_analyses
    DROP COLUMN ai_analysis;
  END IF;
END $$;
