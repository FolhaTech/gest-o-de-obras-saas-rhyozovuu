-- Add metadata column to expenses to store line items extracted from OCR
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Ensure the storage bucket "receipts" exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the "receipts" bucket
DROP POLICY IF EXISTS "Receipts Public Access" ON storage.objects;
CREATE POLICY "Receipts Public Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Receipts Authenticated Inserts" ON storage.objects;
CREATE POLICY "Receipts Authenticated Inserts" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts');
  
DROP POLICY IF EXISTS "Receipts Authenticated Updates" ON storage.objects;
CREATE POLICY "Receipts Authenticated Updates" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Receipts Authenticated Deletes" ON storage.objects;
CREATE POLICY "Receipts Authenticated Deletes" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'receipts');
