-- Financeiro: passa a CONSULTAR (só leitura) as áreas financeiras do sistema, além do Faturamento.
--  * Dashboard, Obras (com serviços, materiais alocados, receitas, metas e premiações), Despesas, Equipes (presença,
--    contratos, grupos e prestadores), Materiais e Relatórios.
--  * Leitura para o Financeiro nas tabelas que eram só do Admin ou da equipe interna. Nenhuma política de escrita muda:
--    o Financeiro continua sem criar, editar nem excluir fora do Faturamento.
--  * Continuam fechados para o Financeiro: documentos pessoais da equipe, Planner, Veículos, Manutenção das casas e
--    Airbnb. Usuários e Configurações seguem do Admin.
--  * Os valores (R$) dessas áreas deixam de ser removidos das respostas para o Financeiro (server/mask.ts).
-- Idempotente.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'expenses', 'revenues',                                   -- despesas e receitas (só do Admin)
    'work_extra_material_values',                             -- valores dos itens alocados nas obras
    'work_goals', 'work_goal_members',                        -- metas e premiações das obras
    'attendance_records', 'attendance_extras',                -- presença e extra semanal
    'external_contracts', 'worker_groups', 'service_providers' -- contratos, grupos e prestadores
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_financeiro_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO obras_authenticated USING (public.is_financeiro())',
      t || '_financeiro_read', t);
  END LOOP;
END $$;
