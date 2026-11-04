
-- Fix storage RLS policies for patient-photos bucket to allow anon and authenticated uploads
CREATE POLICY "Allow public uploads to patient-photos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'patient-photos');

CREATE POLICY "Allow public reads from patient-photos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'patient-photos');

CREATE POLICY "Allow public updates to patient-photos"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'patient-photos');

CREATE POLICY "Allow public deletes from patient-photos"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'patient-photos');
