CREATE OR REPLACE FUNCTION public.log_workspace_record_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row JSONB;
  v_old JSONB;
  v_user_id UUID;
  v_record_id TEXT;
  v_prospect_id UUID;
  v_campaign_id UUID;
  v_label TEXT;
  v_action TEXT;
  v_event_type TEXT;
  v_description TEXT;
  v_change_summary TEXT;
  v_changed_fields JSONB := '[]'::JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := TO_JSONB(OLD);
  ELSE
    v_row := TO_JSONB(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := TO_JSONB(OLD);
    SELECT COALESCE(JSONB_AGG(column_name ORDER BY column_name), '[]'::JSONB)
    INTO v_changed_fields
    FROM JSONB_OBJECT_KEYS(v_row) AS columns(column_name)
    WHERE column_name <> 'updated_at'
      AND v_old -> column_name IS DISTINCT FROM v_row -> column_name;

    IF v_changed_fields = '[]'::JSONB THEN
      RETURN NEW;
    END IF;
    SELECT STRING_AGG(INITCAP(REPLACE(changed_field, '_', ' ')), ', ' ORDER BY changed_field)
    INTO v_change_summary
    FROM JSONB_ARRAY_ELEMENTS_TEXT(v_changed_fields) AS changed_fields(changed_field);
  END IF;

  v_user_id := COALESCE(
    NULLIF(v_row ->> 'user_id', '')::UUID,
    CASE WHEN TG_TABLE_NAME = 'profiles' THEN NULLIF(v_row ->> 'id', '')::UUID END
  );
  IF v_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_record_id := v_row ->> 'id';
  v_prospect_id := NULLIF(v_row ->> 'prospect_id', '')::UUID;
  v_campaign_id := NULLIF(v_row ->> 'campaign_id', '')::UUID;
  IF TG_TABLE_NAME = 'prospects' THEN
    v_prospect_id := NULLIF(v_row ->> 'id', '')::UUID;
  ELSIF TG_TABLE_NAME = 'campaigns' THEN
    v_campaign_id := NULLIF(v_row ->> 'id', '')::UUID;
  END IF;

  IF v_prospect_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.prospects WHERE id = v_prospect_id AND user_id = v_user_id
  ) THEN
    v_prospect_id := NULL;
  END IF;
  IF v_campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.campaigns WHERE id = v_campaign_id AND user_id = v_user_id
  ) THEN
    v_campaign_id := NULL;
  END IF;

  v_label := CASE TG_TABLE_NAME
    WHEN 'prospects' THEN COALESCE(NULLIF(v_row ->> 'business_name', ''), 'Prospect')
    WHEN 'campaigns' THEN COALESCE(NULLIF(v_row ->> 'name', ''), 'Campaign')
    WHEN 'website_analyses' THEN COALESCE(NULLIF(v_row ->> 'website_url', ''), 'Website')
    WHEN 'email_drafts' THEN COALESCE(NULLIF(v_row ->> 'subject', ''), 'Email draft')
    WHEN 'email_messages' THEN COALESCE(NULLIF(v_row ->> 'subject', ''), 'Email message')
    WHEN 'email_templates' THEN COALESCE(NULLIF(v_row ->> 'name', ''), 'Email template')
    WHEN 'tasks' THEN COALESCE(NULLIF(v_row ->> 'title', ''), 'Task')
    WHEN 'profiles' THEN 'Workspace profile'
    WHEN 'suppression_list' THEN 'Email suppression entry'
    WHEN 'prospect_notes' THEN 'Prospect note'
    WHEN 'campaign_prospects' THEN 'Campaign prospect'
    WHEN 'follow_up_sequences' THEN 'Follow-up sequence'
    ELSE 'Workspace record'
  END;

  IF TG_TABLE_NAME = 'email_messages'
    AND TG_OP = 'INSERT'
    AND v_row ->> 'direction' = 'outbound'
    AND v_row ->> 'status' = 'sent' THEN
    RETURN NEW;
  END IF;

  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'created'
    WHEN 'UPDATE' THEN 'updated'
    ELSE 'deleted'
  END;

  v_event_type := CASE TG_TABLE_NAME
    WHEN 'prospects' THEN 'prospect_' || v_action
    WHEN 'campaigns' THEN 'campaign_' || v_action
    WHEN 'website_analyses' THEN
      CASE
        WHEN TG_OP = 'DELETE' THEN 'website_analysis_deleted'
        WHEN v_row ->> 'analysis_status' = 'failed' THEN 'website_analysis_failed'
        WHEN v_row ->> 'analysis_status' = 'completed' AND (
          TG_OP = 'INSERT' OR v_old ->> 'analysis_status' IS DISTINCT FROM v_row ->> 'analysis_status'
        ) THEN 'website_analyzed'
        WHEN TG_OP = 'INSERT' THEN 'website_analysis_started'
        ELSE 'website_analysis_updated'
      END
    WHEN 'email_drafts' THEN 'email_draft_' || v_action
    WHEN 'email_messages' THEN
      CASE WHEN TG_OP = 'INSERT' AND v_row ->> 'direction' = 'inbound'
        THEN 'email_replied'
        ELSE 'email_message_' || v_action
      END
    WHEN 'email_templates' THEN 'email_template_' || v_action
    WHEN 'follow_up_sequences' THEN 'follow_up_sequence_' || v_action
    WHEN 'prospect_notes' THEN 'prospect_note_' || v_action
    WHEN 'campaign_prospects' THEN 'campaign_prospect_' || v_action
    WHEN 'tasks' THEN 'task_' || v_action
    WHEN 'suppression_list' THEN 'suppression_entry_' || v_action
    WHEN 'profiles' THEN 'profile_' || v_action
    ELSE 'record_' || v_action
  END;

  v_description := CASE
    WHEN TG_TABLE_NAME = 'website_analyses' AND TG_OP = 'DELETE'
      THEN 'Website analysis deleted for ' || v_label || '.'
    WHEN TG_TABLE_NAME = 'website_analyses' AND v_row ->> 'analysis_status' = 'failed'
      THEN 'Website analysis failed for ' || v_label || '.'
    WHEN TG_TABLE_NAME = 'website_analyses' AND v_row ->> 'analysis_status' = 'completed'
      THEN 'Website analysis completed for ' || v_label || '.'
    WHEN TG_TABLE_NAME = 'email_messages' AND TG_OP = 'INSERT' AND v_row ->> 'direction' = 'inbound'
      THEN 'Reply received: ' || v_label || '.'
    WHEN TG_TABLE_NAME = 'prospects' AND TG_OP = 'INSERT'
      THEN 'Prospect added: ' || v_label || '.'
    WHEN TG_TABLE_NAME = 'prospects' AND TG_OP = 'UPDATE'
      THEN 'Prospect updated: ' || v_label || '.'
    WHEN TG_TABLE_NAME = 'prospects' AND TG_OP = 'DELETE'
      THEN 'Prospect deleted: ' || v_label || '.'
    ELSE INITCAP(REPLACE(TG_TABLE_NAME, '_', ' ')) || ' ' ||
      CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END ||
      ': ' || v_label || '.'
  END;
  IF TG_OP = 'UPDATE' AND v_change_summary IS NOT NULL THEN
    v_description := v_description || ' Changed: ' || v_change_summary || '.';
  END IF;

  INSERT INTO public.activity_logs (
    user_id,
    prospect_id,
    campaign_id,
    event_type,
    description,
    metadata
  ) VALUES (
    v_user_id,
    v_prospect_id,
    v_campaign_id,
    v_event_type,
    v_description,
    JSONB_BUILD_OBJECT(
      'table', TG_TABLE_NAME,
      'action', LOWER(TG_OP),
      'record_id', v_record_id,
      'changed_fields', v_changed_fields
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_workspace_record_activity() FROM PUBLIC;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'prospects',
    'campaigns',
    'website_analyses',
    'email_drafts',
    'email_messages',
    'email_templates',
    'follow_up_sequences',
    'prospect_notes',
    'campaign_prospects',
    'tasks',
    'suppression_list',
    'profiles'
  ] LOOP
    EXECUTE FORMAT(
      'DROP TRIGGER IF EXISTS workspace_activity_log ON public.%I',
      table_name
    );
    EXECUTE FORMAT(
      'CREATE TRIGGER workspace_activity_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_workspace_record_activity()',
      table_name
    );
  END LOOP;
END;
$$;
