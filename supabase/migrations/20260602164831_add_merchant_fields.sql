ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS merchant_name TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS merchant_cnpj TEXT;
