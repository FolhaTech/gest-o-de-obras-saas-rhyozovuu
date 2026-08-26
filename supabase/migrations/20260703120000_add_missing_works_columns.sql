-- Migration to ensure all works columns (client, contracted_value, notes, address, total_area, budget_planned) exist on public.works
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS client TEXT;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS manager TEXT;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS total_area NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS end_date_planned DATE;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS contracted_value NUMERIC(14, 2) DEFAULT 0;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS budget_planned NUMERIC(14, 2) DEFAULT 0;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS progress_percentage NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'planning';
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS notes TEXT;
