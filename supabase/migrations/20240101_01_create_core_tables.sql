CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES TABLE
-- ============================================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  company_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read own profile
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Policy: Insert own profile on signup
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- EMAIL TEMPLATES TABLE
-- ============================================================

CREATE TABLE email_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  template_type TEXT CHECK (template_type IN ('website_improvement', 'website_redesign', 'performance', 'follow_up', 'interested', 'call')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can CRUD own email templates
CREATE POLICY "Users can read own email templates" ON email_templates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email templates" ON email_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email templates" ON email_templates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own email templates" ON email_templates
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_email_templates_user_id ON email_templates(user_id);

-- ============================================================
-- OUTREACH CORE TABLES
-- ============================================================

CREATE TABLE prospects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  website TEXT,
  normalized_domain TEXT,
  business_category TEXT,
  city TEXT,
  country TEXT,
  phone TEXT,
  linkedin_url TEXT,
  notes TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'New',
  do_not_contact BOOLEAN NOT NULL DEFAULT false,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE website_analyses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  website_url TEXT NOT NULL,
  overall_score NUMERIC,
  category_scores JSONB,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  positive_observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  analysis_provider TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  industry TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_drafts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'custom',
  generation_source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'draft',
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  provider TEXT,
  provider_message_id TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE follow_up_sequences (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  current_step INTEGER DEFAULT 0,
  next_action_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE suppression_list (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, normalized_email)
);

CREATE TABLE activity_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dashboard_metrics (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  total_prospects INTEGER NOT NULL DEFAULT 0,
  prospects_contacted INTEGER NOT NULL DEFAULT 0,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  replies_received INTEGER NOT NULL DEFAULT 0,
  interested_prospects INTEGER NOT NULL DEFAULT 0,
  follow_ups_due INTEGER NOT NULL DEFAULT 0,
  meetings_booked INTEGER NOT NULL DEFAULT 0,
  clients_won INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE campaign_prospects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, prospect_id)
);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'prospects', 'website_analyses', 'campaigns', 'email_drafts',
    'email_messages', 'follow_up_sequences', 'suppression_list',
    'activity_logs', 'dashboard_metrics', 'campaign_prospects'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      table_name || '_owner_policy', table_name
    );
  END LOOP;
END $$;

CREATE INDEX idx_prospects_user_id ON prospects(user_id);
CREATE INDEX idx_website_analyses_user_id ON website_analyses(user_id);
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_email_drafts_user_id ON email_drafts(user_id);
CREATE INDEX idx_email_messages_user_id ON email_messages(user_id);
CREATE INDEX idx_follow_up_sequences_user_id ON follow_up_sequences(user_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_campaign_prospects_user_id ON campaign_prospects(user_id);

-- ============================================================
-- ============================================================
-- UPDATE TRIGGERS for updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Apply triggers to tables with updated_at
CREATE TRIGGER update_prospects_updated_at BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_website_analyses_updated_at BEFORE UPDATE ON website_analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_drafts_updated_at BEFORE UPDATE ON email_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- PROSPECT NOTES TABLE
-- ============================================================

CREATE TABLE prospect_notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE prospect_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can CRUD own prospect notes
CREATE POLICY "Users can read own prospect notes" ON prospect_notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prospect notes" ON prospect_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prospect notes" ON prospect_notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prospect notes" ON prospect_notes
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_prospect_notes_user_id ON prospect_notes(user_id);
CREATE INDEX idx_prospect_notes_prospect_id ON prospect_notes(prospect_id);
-- TASKS TABLE
-- ============================================================

CREATE TABLE tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'archived')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can CRUD own tasks
CREATE POLICY "Users can read own tasks" ON tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks" ON tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks" ON tasks
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_prospect_id ON tasks(prospect_id);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);