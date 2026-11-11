-- Equipamentos: quantidade de unidades que existem do item (ao cadastrar, informa-se quantos há).
-- Os cadastros que já existiam ficam com 1 unidade. Idempotente.
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);
