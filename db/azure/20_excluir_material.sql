-- Excluir material: o histórico de composição das obras (compositions_history) travava a exclusão
-- (ON DELETE RESTRICT) e a tela dizia "Material excluído" mesmo sem excluir.
-- Esse histórico é só o "retrato" dos materiais planejados de cada serviço da obra (como compositions, que já
-- apaga em cascata), então passa a sair junto com o material.
-- Fica TRAVADO (de propósito) o material com consumo real registrado (consumption_tracking): excluí-lo apagaria
-- o que foi consumido nas obras; a tela explica o motivo. Idempotente.

ALTER TABLE public.compositions_history DROP CONSTRAINT IF EXISTS compositions_history_material_id_fkey;
ALTER TABLE public.compositions_history
  ADD CONSTRAINT compositions_history_material_id_fkey
  FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;
