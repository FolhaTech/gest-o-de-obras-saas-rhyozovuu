-- Create table for team member documents
CREATE TABLE IF NOT EXISTS public.team_member_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_member_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.team_member_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.team_member_documents;
CREATE POLICY "allow_all_authenticated" ON public.team_member_documents 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create bucket for team documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('team-documents', 'team-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for bucket
DROP POLICY IF EXISTS "team_documents_bucket_policy" ON storage.objects;
CREATE POLICY "team_documents_bucket_policy" ON storage.objects 
  FOR ALL TO authenticated 
  USING (bucket_id = 'team-documents') 
  WITH CHECK (bucket_id = 'team-documents');
