-- Ensure the private screenshot bucket has owner-scoped policies. The bucket
-- restore migration may have recreated it without restoring object policies.
DROP POLICY IF EXISTS "Users can view their website audit screenshots" ON storage.objects;
CREATE POLICY "Users can view their website audit screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'website-audit-screenshots' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT);

DROP POLICY IF EXISTS "Users can upload their website audit screenshots" ON storage.objects;
CREATE POLICY "Users can upload their website audit screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'website-audit-screenshots' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT);

DROP POLICY IF EXISTS "Users can delete their website audit screenshots" ON storage.objects;
CREATE POLICY "Users can delete their website audit screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'website-audit-screenshots' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT);

CREATE INDEX IF NOT EXISTS website_analyses_visual_audit_status_idx
ON public.website_analyses ((analysis_details -> 'visual_audit' ->> 'status'))
WHERE analysis_details ? 'visual_audit';
