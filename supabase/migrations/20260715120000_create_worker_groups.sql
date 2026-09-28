-- Migration: 20260715120000_create_worker_groups.sql
-- Adiciona suporte a Grupos de Funcionários em /equipes

CREATE TABLE IF NOT EXISTS public.worker_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'team_members' 
      AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.team_members 
      ADD COLUMN group_id UUID REFERENCES public.worker_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'workers'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'workers' 
        AND column_name = 'group_id'
    ) THEN
      ALTER TABLE public.workers 
        ADD COLUMN group_id UUID REFERENCES public.worker_groups(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_worker_groups_name ON public.worker_groups(name);
CREATE INDEX IF NOT EXISTS idx_team_members_group_id ON public.team_members(group_id);

ALTER TABLE public.worker_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow authenticated full access" ON public.worker_groups;
  DROP POLICY IF EXISTS "Allow auth all on worker_groups" ON public.worker_groups;
  CREATE POLICY "Allow authenticated full access" ON public.worker_groups 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow anon full access" ON public.worker_groups;
  CREATE POLICY "Allow anon full access" ON public.worker_groups 
    FOR ALL TO anon USING (true) WITH CHECK (true);
END $$;
