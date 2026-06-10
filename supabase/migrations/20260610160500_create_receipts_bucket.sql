-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Set up policies for the receipts bucket
DO $$
BEGIN
  -- Drop existing policies if any
  DROP POLICY IF EXISTS "Public Access" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can delete receipts" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can update receipts" ON storage.objects;
END $$;

-- Create policies
CREATE POLICY "Public Access" ON storage.objects 
  FOR SELECT USING (bucket_id = 'receipts');

CREATE POLICY "Authenticated users can upload receipts" ON storage.objects 
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Authenticated users can update receipts" ON storage.objects 
  FOR UPDATE TO authenticated USING (bucket_id = 'receipts');

CREATE POLICY "Authenticated users can delete receipts" ON storage.objects 
  FOR DELETE TO authenticated USING (bucket_id = 'receipts');
