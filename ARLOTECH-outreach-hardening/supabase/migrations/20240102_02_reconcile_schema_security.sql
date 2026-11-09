-- Reconcile the existing core schema, ownership policies, and timestamp protections.
-- This migration preserves existing records and refuses unexpected schema or data.

BEGIN;

-- PostgreSQL deparses both existing and expected expressions consistently.
-- This transaction-scoped fixture is dropped on commit and never touches public schema.
CREATE TEMP TABLE reconcile_expected_constraint_definitions (
  role TEXT,
  overall_score NUMERIC,
  performance_score NUMERIC,
  accessibility_score NUMERIC,
  seo_score NUMERIC,
  best_practices_score NUMERIC,
  analysis_status TEXT,
  priority TEXT,
  status TEXT,
  CONSTRAINT expected_profiles_role CHECK (role IN ('admin', 'member')),
  CONSTRAINT expected_website_scores CHECK (
    (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100)) AND
    (performance_score IS NULL OR (performance_score >= 0 AND performance_score <= 100)) AND
    (accessibility_score IS NULL OR (accessibility_score >= 0 AND accessibility_score <= 100)) AND
    (seo_score IS NULL OR (seo_score >= 0 AND seo_score <= 100)) AND
    (best_practices_score IS NULL OR (best_practices_score >= 0 AND best_practices_score <= 100))
  ),
  CONSTRAINT expected_website_scores_legacy_order CHECK (
    (performance_score IS NULL OR (performance_score >= 0 AND performance_score <= 100)) AND
    (accessibility_score IS NULL OR (accessibility_score >= 0 AND accessibility_score <= 100)) AND
    (seo_score IS NULL OR (seo_score >= 0 AND seo_score <= 100)) AND
    (best_practices_score IS NULL OR (best_practices_score >= 0 AND best_practices_score <= 100)) AND
    (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100))
  ),
  CONSTRAINT expected_website_status CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed', 'blocked')),
  CONSTRAINT expected_website_status_legacy CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed', 'blocked', 'queued', 'running')),
  CONSTRAINT expected_tasks_priority CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  CONSTRAINT expected_tasks_priority_legacy CHECK (priority IN ('Low', 'Medium', 'High', 'Critical', 'low', 'medium', 'high', 'critical')),
  CONSTRAINT expected_tasks_status CHECK (status IN ('Todo', 'In Progress', 'Done', 'Blocked')),
  CONSTRAINT expected_tasks_status_legacy CHECK (status IN ('Todo', 'In Progress', 'Done', 'Blocked', 'pending', 'completed'))
) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- 1. Preflight: verify the core schema and known policy inventory before changes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing_tables TEXT;
  missing_columns TEXT;
  unexpected_policies TEXT;
  unexpected_constraints TEXT;
  misplaced_constraints TEXT;
  invalid_named_constraints TEXT;
  score_column TEXT;
  invalid_count BIGINT;
  invalid_role BOOLEAN;
BEGIN
  SELECT string_agg(required.table_name, ', ' ORDER BY required.table_name)
  INTO missing_tables
  FROM (VALUES
    ('profiles'), ('prospects'), ('campaigns'), ('website_analyses'),
    ('email_templates'), ('email_drafts'), ('email_messages'),
    ('follow_up_sequences'), ('suppression_list'), ('activity_logs'),
    ('dashboard_metrics'), ('campaign_prospects'), ('prospect_notes'), ('tasks')
  ) AS required(table_name)
  WHERE to_regclass(format('public.%I', required.table_name)) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Reconciliation migration requires core tables: %', missing_tables;
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Reconciliation migration requires auth.users';
  END IF;

  -- These columns must already exist in the core schema. Contract columns
  -- intentionally added later are listed with their ALTER TABLE statements.
  SELECT string_agg(required.table_name || '.' || required.column_name, ', ' ORDER BY required.table_name, required.column_name)
  INTO missing_columns
  FROM (VALUES
    ('profiles', 'id'), ('profiles', 'full_name'), ('profiles', 'company_name'), ('profiles', 'created_at'), ('profiles', 'updated_at'),
    ('prospects', 'id'), ('prospects', 'user_id'), ('prospects', 'status'), ('prospects', 'normalized_domain'), ('prospects', 'updated_at'),
    ('campaigns', 'id'), ('campaigns', 'user_id'), ('campaigns', 'updated_at'),
    ('website_analyses', 'id'), ('website_analyses', 'user_id'), ('website_analyses', 'prospect_id'),
    ('website_analyses', 'website_url'), ('website_analyses', 'overall_score'), ('website_analyses', 'category_scores'),
    ('website_analyses', 'findings'), ('website_analyses', 'positive_observations'), ('website_analyses', 'analysis_status'),
    ('website_analyses', 'error_message'), ('website_analyses', 'analysis_provider'), ('website_analyses', 'analyzed_at'), ('website_analyses', 'created_at'),
    ('email_templates', 'user_id'), ('email_templates', 'updated_at'),
    ('email_drafts', 'user_id'), ('email_drafts', 'prospect_id'), ('email_drafts', 'campaign_id'), ('email_drafts', 'updated_at'),
    ('email_messages', 'user_id'), ('email_messages', 'prospect_id'), ('email_messages', 'campaign_id'),
    ('follow_up_sequences', 'user_id'), ('follow_up_sequences', 'prospect_id'), ('follow_up_sequences', 'campaign_id'), ('follow_up_sequences', 'next_action_at'), ('follow_up_sequences', 'updated_at'),
    ('suppression_list', 'user_id'),
    ('activity_logs', 'user_id'), ('activity_logs', 'prospect_id'), ('activity_logs', 'campaign_id'), ('activity_logs', 'created_at'),
    ('dashboard_metrics', 'user_id'),
    ('campaign_prospects', 'user_id'), ('campaign_prospects', 'campaign_id'), ('campaign_prospects', 'prospect_id'),
    ('prospect_notes', 'user_id'), ('prospect_notes', 'prospect_id'), ('prospect_notes', 'created_at'),
    ('tasks', 'user_id'), ('tasks', 'prospect_id'), ('tasks', 'title'), ('tasks', 'description'),
    ('tasks', 'priority'), ('tasks', 'status'), ('tasks', 'due_at'), ('tasks', 'completed_at'), ('tasks', 'created_at'),
    ('auth.users', 'id'), ('auth.users', 'email'), ('auth.users', 'raw_user_meta_data')
  ) AS required(table_name, column_name)
  LEFT JOIN information_schema.columns AS present
    ON present.table_schema = CASE
      WHEN position('.' IN required.table_name) > 0 THEN split_part(required.table_name, '.', 1)
      ELSE 'public'
    END
    AND present.table_name = CASE
      WHEN position('.' IN required.table_name) > 0 THEN split_part(required.table_name, '.', 2)
      ELSE required.table_name
    END
    AND present.column_name = required.column_name
  WHERE present.column_name IS NULL;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Reconciliation migration is missing required core columns: %', missing_columns;
  END IF;

  SELECT string_agg(format('%I.%I has unexpected constraint %I', relation.relname, constraint_check.conname, constraint_check.conname), ', ')
  INTO unexpected_constraints
  FROM pg_constraint AS constraint_check
  JOIN pg_class AS relation ON relation.oid = constraint_check.conrelid
  JOIN pg_namespace AS schema_info ON schema_info.oid = relation.relnamespace
  JOIN pg_attribute AS attribute_info
    ON attribute_info.attrelid = constraint_check.conrelid
    AND attribute_info.attnum = ANY(constraint_check.conkey)
  JOIN (VALUES
    ('profiles', 'role'),
    ('website_analyses', 'overall_score'), ('website_analyses', 'performance_score'),
    ('website_analyses', 'accessibility_score'), ('website_analyses', 'seo_score'),
    ('website_analyses', 'best_practices_score'), ('website_analyses', 'analysis_status'),
    ('tasks', 'priority'), ('tasks', 'status')
  ) AS protected_column(table_name, column_name)
    ON protected_column.table_name = relation.relname
    AND protected_column.column_name = attribute_info.attname
  WHERE schema_info.nspname = 'public'
    AND constraint_check.contype = 'c'
    AND constraint_check.conname NOT IN (
      'profiles_role_check', 'profiles_role_contract_check',
      'website_analyses_scores_range', 'website_analyses_scores_range_contract_check',
      'website_analyses_status_check', 'website_analyses_status_contract_check',
      'tasks_priority_check', 'tasks_priority_contract_check',
      'tasks_status_check', 'tasks_status_contract_check'
    );

  IF unexpected_constraints IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected CHECK constraints overlap managed columns; review manually before reconciliation: %', unexpected_constraints;
  END IF;

  SELECT string_agg(format('%I.%I is named for %I', schema_info.nspname, relation.relname, expected.table_name), ', ')
  INTO misplaced_constraints
  FROM pg_constraint AS constraint_check
  JOIN pg_class AS relation ON relation.oid = constraint_check.conrelid
  JOIN pg_namespace AS schema_info ON schema_info.oid = relation.relnamespace
  JOIN (VALUES
    ('profiles_role_check', 'profiles'),
    ('profiles_role_contract_check', 'profiles'),
    ('website_analyses_scores_range', 'website_analyses'),
    ('website_analyses_scores_range_contract_check', 'website_analyses'),
    ('website_analyses_status_check', 'website_analyses'),
    ('website_analyses_status_contract_check', 'website_analyses'),
    ('tasks_priority_check', 'tasks'),
    ('tasks_priority_contract_check', 'tasks'),
    ('tasks_status_check', 'tasks'),
    ('tasks_status_contract_check', 'tasks')
  ) AS expected(constraint_name, table_name)
    ON expected.constraint_name = constraint_check.conname
  WHERE schema_info.nspname <> 'public'
    OR relation.relname <> expected.table_name;

  IF misplaced_constraints IS NOT NULL THEN
    RAISE EXCEPTION 'Managed CHECK constraint name exists on an unexpected table; review manually: %', misplaced_constraints;
  END IF;

  SELECT string_agg(format('%I.%I is not a validated CHECK on the expected column %I', relation.relname, constraint_check.conname, expected.column_name), ', ')
  INTO invalid_named_constraints
  FROM pg_constraint AS constraint_check
  JOIN pg_class AS relation ON relation.oid = constraint_check.conrelid
  JOIN pg_namespace AS schema_info ON schema_info.oid = relation.relnamespace
  JOIN (VALUES
    ('profiles_role_check', 'profiles', 'role'),
    ('profiles_role_contract_check', 'profiles', 'role'),
    ('website_analyses_scores_range', 'website_analyses', 'overall_score'),
    ('website_analyses_scores_range', 'website_analyses', 'performance_score'),
    ('website_analyses_scores_range', 'website_analyses', 'accessibility_score'),
    ('website_analyses_scores_range', 'website_analyses', 'seo_score'),
    ('website_analyses_scores_range', 'website_analyses', 'best_practices_score'),
    ('website_analyses_scores_range_contract_check', 'website_analyses', 'overall_score'),
    ('website_analyses_scores_range_contract_check', 'website_analyses', 'performance_score'),
    ('website_analyses_scores_range_contract_check', 'website_analyses', 'accessibility_score'),
    ('website_analyses_scores_range_contract_check', 'website_analyses', 'seo_score'),
    ('website_analyses_scores_range_contract_check', 'website_analyses', 'best_practices_score'),
    ('website_analyses_status_check', 'website_analyses', 'analysis_status'),
    ('website_analyses_status_contract_check', 'website_analyses', 'analysis_status'),
    ('tasks_priority_check', 'tasks', 'priority'),
    ('tasks_priority_contract_check', 'tasks', 'priority'),
    ('tasks_status_check', 'tasks', 'status'),
    ('tasks_status_contract_check', 'tasks', 'status')
  ) AS expected(constraint_name, table_name, column_name)
    ON expected.constraint_name = constraint_check.conname
    AND expected.table_name = relation.relname
  LEFT JOIN pg_attribute AS attribute_info
    ON attribute_info.attrelid = constraint_check.conrelid
    AND attribute_info.attname = expected.column_name
    AND attribute_info.attnum = ANY(constraint_check.conkey)
  WHERE schema_info.nspname = 'public'
    AND (constraint_check.contype <> 'c' OR NOT constraint_check.convalidated OR attribute_info.attnum IS NULL);

  IF invalid_named_constraints IS NOT NULL THEN
    RAISE EXCEPTION 'Managed CHECK constraint name has an unexpected type, column set, or validation state; review manually: %', invalid_named_constraints;
  END IF;

  SELECT string_agg(
    format('%I.%I definition differs from expected; review manually', relation.relname, constraint_check.conname),
    ', ' ORDER BY relation.relname, constraint_check.conname
  )
  INTO invalid_named_constraints
  FROM pg_constraint AS constraint_check
  JOIN pg_class AS relation ON relation.oid = constraint_check.conrelid
  JOIN pg_namespace AS schema_info ON schema_info.oid = relation.relnamespace
  JOIN (VALUES
    ('profiles_role_check', 'profiles', 'expected_profiles_role'),
    ('profiles_role_contract_check', 'profiles', 'expected_profiles_role'),
    ('website_analyses_scores_range', 'website_analyses', 'expected_website_scores_legacy_order'),
    ('website_analyses_scores_range_contract_check', 'website_analyses', 'expected_website_scores'),
    ('website_analyses_status_check', 'website_analyses', 'expected_website_status_legacy'),
    ('website_analyses_status_contract_check', 'website_analyses', 'expected_website_status'),
    ('tasks_priority_check', 'tasks', 'expected_tasks_priority_legacy'),
    ('tasks_priority_contract_check', 'tasks', 'expected_tasks_priority'),
    ('tasks_status_check', 'tasks', 'expected_tasks_status_legacy'),
    ('tasks_status_contract_check', 'tasks', 'expected_tasks_status')
  ) AS expected(constraint_name, table_name, reference_constraint)
    ON expected.constraint_name = constraint_check.conname
    AND expected.table_name = relation.relname
  JOIN pg_constraint AS reference
    ON reference.conrelid = 'pg_temp.reconcile_expected_constraint_definitions'::regclass
    AND reference.conname = expected.reference_constraint
  WHERE schema_info.nspname = 'public'
    AND pg_catalog.pg_get_constraintdef(constraint_check.oid, false)
      <> pg_catalog.pg_get_constraintdef(reference.oid, false);

  IF invalid_named_constraints IS NOT NULL THEN
    RAISE EXCEPTION 'Managed CHECK constraint definition differs from the expected definition; manual review required before reconciliation: %', invalid_named_constraints;
  END IF;

  SELECT string_agg(
    format('%I.%I [%s %s TO %s]', policy.tablename, policy.policyname, policy.permissive, policy.cmd, array_to_string(policy.roles, ',')),
    ', ' ORDER BY policy.tablename, policy.policyname
  )
  INTO unexpected_policies
  FROM pg_policies AS policy
  WHERE policy.schemaname = 'public'
    AND policy.tablename IN (
      'profiles', 'email_templates', 'prospects', 'campaigns', 'website_analyses',
      'email_drafts', 'email_messages', 'follow_up_sequences', 'suppression_list',
      'activity_logs', 'dashboard_metrics', 'campaign_prospects', 'prospect_notes', 'tasks'
    )
    AND (
      policy.permissive = 'RESTRICTIVE'
      OR policy.policyname NOT IN (
        policy.tablename || '_owner_policy',
        policy.tablename || '_select', policy.tablename || '_insert',
        policy.tablename || '_update', policy.tablename || '_delete',
        'Users can insert own profile', 'Users can read own profile',
        'Users can update own profile',
        'profiles_owner_insert', 'profiles_owner_select', 'profiles_owner_update',
        'profiles_select', 'profiles_insert', 'profiles_update', 'profiles_delete'
      )
    );

  IF unexpected_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected or restrictive policies require manual review before reconciliation: %', unexpected_policies;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.website_analyses
    WHERE analysis_status IS NULL
      OR lower(btrim(analysis_status)) NOT IN ('pending', 'processing', 'completed', 'failed', 'blocked', 'queued', 'running')
  ) THEN
    RAISE EXCEPTION 'website_analyses contains an unrecognized analysis_status; inspect values before reconciliation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE (priority IS NOT NULL AND lower(btrim(priority)) NOT IN ('low', 'medium', 'high', 'critical'))
       OR (status IS NOT NULL AND lower(btrim(status)) NOT IN ('todo', 'pending', 'in progress', 'in_progress', 'done', 'completed', 'blocked'))
  ) THEN
    RAISE EXCEPTION 'tasks contains an unrecognized priority or status; inspect values before reconciliation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.profiles WHERE role IS NOT NULL AND role NOT IN (''admin'', ''member''))'
      INTO invalid_role;
  ELSE
    invalid_role := FALSE;
  END IF;

  IF invalid_role THEN
    RAISE EXCEPTION 'profiles contains a role outside the application contract (admin, member); inspect values before reconciliation';
  END IF;

  FOREACH score_column IN ARRAY ARRAY[
    'overall_score', 'performance_score', 'accessibility_score', 'seo_score', 'best_practices_score'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'website_analyses' AND column_name = score_column
    ) THEN
      EXECUTE format(
        'SELECT count(*) FROM public.website_analyses WHERE %I IS NOT NULL AND (%I < 0 OR %I > 100)',
        score_column, score_column, score_column
      ) INTO invalid_count;
      IF invalid_count > 0 THEN
        RAISE EXCEPTION 'website_analyses.% has % value(s) outside the allowed range 0..100', score_column, invalid_count;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Add only contract columns absent from the expected core tables
-- ---------------------------------------------------------------------------
-- Intentional additions: profiles.email/avatar_url/role; website_analyses score
-- breakdowns, ai_analysis, updated_at; and prospect_notes.updated_at. These are
-- added before any backfill, policy, constraint, index, or trigger references them.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
ALTER TABLE public.website_analyses ADD COLUMN IF NOT EXISTS performance_score NUMERIC;
ALTER TABLE public.website_analyses ADD COLUMN IF NOT EXISTS accessibility_score NUMERIC;
ALTER TABLE public.website_analyses ADD COLUMN IF NOT EXISTS seo_score NUMERIC;
ALTER TABLE public.website_analyses ADD COLUMN IF NOT EXISTS best_practices_score NUMERIC;
ALTER TABLE public.website_analyses ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE public.website_analyses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.prospect_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.profiles AS profile
SET email = auth_user.email
FROM auth.users AS auth_user
WHERE profile.id = auth_user.id AND profile.email IS NULL;

UPDATE public.profiles SET role = 'member' WHERE role IS NULL;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;

UPDATE public.website_analyses
SET analysis_status = CASE lower(btrim(analysis_status))
  WHEN 'queued' THEN 'pending'
  WHEN 'running' THEN 'processing'
  ELSE lower(btrim(analysis_status))
END
WHERE analysis_status IS DISTINCT FROM lower(btrim(analysis_status))
   OR lower(btrim(analysis_status)) IN ('queued', 'running');

UPDATE public.tasks
SET priority = CASE lower(btrim(priority))
  WHEN 'low' THEN 'Low'
  WHEN 'medium' THEN 'Medium'
  WHEN 'high' THEN 'High'
  WHEN 'critical' THEN 'Critical'
END
WHERE priority IS NOT NULL;

UPDATE public.tasks
SET status = CASE lower(btrim(status))
  WHEN 'todo' THEN 'Todo'
  WHEN 'pending' THEN 'Todo'
  WHEN 'in progress' THEN 'In Progress'
  WHEN 'in_progress' THEN 'In Progress'
  WHEN 'done' THEN 'Done'
  WHEN 'completed' THEN 'Done'
  WHEN 'blocked' THEN 'Blocked'
END
WHERE status IS NOT NULL;

UPDATE public.tasks SET priority = 'Medium' WHERE priority IS NULL;
UPDATE public.tasks SET status = 'Todo' WHERE status IS NULL;
ALTER TABLE public.tasks ALTER COLUMN priority SET DEFAULT 'Medium';
ALTER TABLE public.tasks ALTER COLUMN priority SET NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'Todo';
ALTER TABLE public.tasks ALTER COLUMN status SET NOT NULL;

UPDATE public.website_analyses
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;
UPDATE public.prospect_notes
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Constraints: add intended checks only when their names are absent
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_contract_check' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_contract_check CHECK (role IN ('admin', 'member'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'website_analyses_scores_range_contract_check' AND conrelid = 'public.website_analyses'::regclass) THEN
    ALTER TABLE public.website_analyses ADD CONSTRAINT website_analyses_scores_range_contract_check CHECK (
      (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100)) AND
      (performance_score IS NULL OR (performance_score >= 0 AND performance_score <= 100)) AND
      (accessibility_score IS NULL OR (accessibility_score >= 0 AND accessibility_score <= 100)) AND
      (seo_score IS NULL OR (seo_score >= 0 AND seo_score <= 100)) AND
      (best_practices_score IS NULL OR (best_practices_score >= 0 AND best_practices_score <= 100))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'website_analyses_status_contract_check' AND conrelid = 'public.website_analyses'::regclass) THEN
    ALTER TABLE public.website_analyses ADD CONSTRAINT website_analyses_status_contract_check
      CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed', 'blocked'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_contract_check' AND conrelid = 'public.tasks'::regclass) THEN
    ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_contract_check
      CHECK (priority IN ('Low', 'Medium', 'High', 'Critical'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_contract_check' AND conrelid = 'public.tasks'::regclass) THEN
    ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_contract_check
      CHECK (status IN ('Todo', 'In Progress', 'Done', 'Blocked'));
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Idempotent indexes for dashboard, prospect, and relationship queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_prospects_user_id ON public.prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_user_status ON public.prospects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_prospects_user_domain ON public.prospects(user_id, normalized_domain);
CREATE INDEX IF NOT EXISTS idx_website_analyses_user_id ON public.website_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_website_analyses_user_status ON public.website_analyses(user_id, analysis_status);
CREATE INDEX IF NOT EXISTS idx_website_analyses_prospect_id ON public.website_analyses(prospect_id);
CREATE INDEX IF NOT EXISTS idx_website_analyses_analyzed_at ON public.website_analyses(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_user_id ON public.email_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_user_prospect ON public.email_drafts(user_id, prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_campaign ON public.email_drafts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_user_id ON public.email_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_prospect ON public.email_messages(prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_campaign ON public.email_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_user_id ON public.follow_up_sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user_next_action ON public.follow_up_sequences(user_id, next_action_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON public.activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_prospects_user_id ON public.campaign_prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_prospects_campaign ON public.campaign_prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_prospects_prospect ON public.campaign_prospects(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_notes_prospect ON public.prospect_notes(prospect_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_due ON public.tasks(user_id, status, due_at);

-- ---------------------------------------------------------------------------
-- 5. RLS: replace only known legacy policies, then recreate owner policies
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'email_templates', 'prospects', 'campaigns', 'website_analyses',
    'email_drafts', 'email_messages', 'follow_up_sequences',
    'suppression_list', 'activity_logs', 'dashboard_metrics',
    'campaign_prospects', 'prospect_notes', 'tasks'
  ] LOOP
    FOREACH policy_name IN ARRAY ARRAY[
      table_name || '_owner_policy', table_name || '_select', table_name || '_insert',
      table_name || '_update', table_name || '_delete'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    END LOOP;
  END LOOP;

  FOREACH policy_name IN ARRAY ARRAY[
    'Users can insert own profile', 'Users can read own profile', 'Users can update own profile',
    'profiles_owner_insert', 'profiles_owner_select', 'profiles_owner_update',
    'profiles_owner_policy', 'profiles_select', 'profiles_insert', 'profiles_update', 'profiles_delete'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_name);
  END LOOP;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'email_templates', 'prospects', 'campaigns', 'suppression_list', 'dashboard_metrics'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', table_name || '_select', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', table_name || '_update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', table_name || '_delete', table_name);
  END LOOP;
END;
$$;

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY website_analyses_select ON public.website_analyses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY website_analyses_insert ON public.website_analyses FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = website_analyses.prospect_id AND prospect.user_id = auth.uid()))
);
CREATE POLICY website_analyses_update ON public.website_analyses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = website_analyses.prospect_id AND prospect.user_id = auth.uid()))
);
CREATE POLICY website_analyses_delete ON public.website_analyses FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY email_drafts_select ON public.email_drafts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY email_drafts_insert ON public.email_drafts FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = email_drafts.prospect_id AND prospect.user_id = auth.uid())) AND
  (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = email_drafts.campaign_id AND campaign.user_id = auth.uid()))
);
CREATE POLICY email_drafts_update ON public.email_drafts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = email_drafts.prospect_id AND prospect.user_id = auth.uid())) AND
  (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = email_drafts.campaign_id AND campaign.user_id = auth.uid()))
);
CREATE POLICY email_drafts_delete ON public.email_drafts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY email_messages_select ON public.email_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY email_messages_insert ON public.email_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = email_messages.prospect_id AND prospect.user_id = auth.uid())) AND
  (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = email_messages.campaign_id AND campaign.user_id = auth.uid()))
);
CREATE POLICY email_messages_update ON public.email_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = email_messages.prospect_id AND prospect.user_id = auth.uid())) AND
  (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = email_messages.campaign_id AND campaign.user_id = auth.uid()))
);
CREATE POLICY email_messages_delete ON public.email_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY follow_up_sequences_select ON public.follow_up_sequences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY follow_up_sequences_insert ON public.follow_up_sequences FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = follow_up_sequences.prospect_id AND prospect.user_id = auth.uid())) AND
  (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = follow_up_sequences.campaign_id AND campaign.user_id = auth.uid()))
);
CREATE POLICY follow_up_sequences_update ON public.follow_up_sequences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = follow_up_sequences.prospect_id AND prospect.user_id = auth.uid())) AND
  (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = follow_up_sequences.campaign_id AND campaign.user_id = auth.uid()))
);
CREATE POLICY follow_up_sequences_delete ON public.follow_up_sequences FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY activity_logs_insert ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = activity_logs.prospect_id AND prospect.user_id = auth.uid())) AND
  (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = activity_logs.campaign_id AND campaign.user_id = auth.uid()))
);
CREATE POLICY activity_logs_update ON public.activity_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = activity_logs.prospect_id AND prospect.user_id = auth.uid())) AND
  (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = activity_logs.campaign_id AND campaign.user_id = auth.uid()))
);
CREATE POLICY activity_logs_delete ON public.activity_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY campaign_prospects_select ON public.campaign_prospects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY campaign_prospects_insert ON public.campaign_prospects FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = campaign_prospects.campaign_id AND campaign.user_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = campaign_prospects.prospect_id AND prospect.user_id = auth.uid())
);
CREATE POLICY campaign_prospects_update ON public.campaign_prospects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.campaigns AS campaign WHERE campaign.id = campaign_prospects.campaign_id AND campaign.user_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = campaign_prospects.prospect_id AND prospect.user_id = auth.uid())
);
CREATE POLICY campaign_prospects_delete ON public.campaign_prospects FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY prospect_notes_select ON public.prospect_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY prospect_notes_insert ON public.prospect_notes FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = prospect_notes.prospect_id AND prospect.user_id = auth.uid())
);
CREATE POLICY prospect_notes_update ON public.prospect_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = prospect_notes.prospect_id AND prospect.user_id = auth.uid())
);
CREATE POLICY prospect_notes_delete ON public.prospect_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = tasks.prospect_id AND prospect.user_id = auth.uid()))
);
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND
  (prospect_id IS NULL OR EXISTS (SELECT 1 FROM public.prospects AS prospect WHERE prospect.id = tasks.prospect_id AND prospect.user_id = auth.uid()))
);
CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. Timestamp and profile-role triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  jwt_role TEXT := auth.role();
  jwt_user_id UUID := auth.uid();
BEGIN
  IF jwt_role = 'service_role'
     OR (
       jwt_role IS NULL
       AND jwt_user_id IS NULL
       AND session_user IN ('postgres', 'supabase_admin', 'service_role')
       AND current_user IN ('postgres', 'supabase_admin', 'service_role')
     ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'member';
  ELSE
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
CREATE TRIGGER protect_profile_role
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'profiles', 'prospects', 'campaigns', 'website_analyses',
    'email_templates', 'email_drafts', 'follow_up_sequences', 'prospect_notes'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND information_schema.columns.table_name = target_table
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'update_' || target_table || '_updated_at', target_table);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        'update_' || target_table || '_updated_at', target_table
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, company_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), ''),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'company_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    'member'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
