INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'website-audit-screenshots',
  'website-audit-screenshots',
  FALSE,
  750000,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Users can view their website audit screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'website-audit-screenshots'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
);

CREATE POLICY "Users can upload their website audit screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'website-audit-screenshots'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
);

CREATE POLICY "Users can delete their website audit screenshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'website-audit-screenshots'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
);
