-- Add receipt_url to expenses table
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Create receipts bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Set up Storage RLS policies for receipts bucket
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
CREATE POLICY "Authenticated users can upload receipts" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;
CREATE POLICY "Authenticated users can view receipts" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Authenticated users can update receipts" ON storage.objects;
CREATE POLICY "Authenticated users can update receipts" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Authenticated users can delete receipts" ON storage.objects;
CREATE POLICY "Authenticated users can delete receipts" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'receipts');
