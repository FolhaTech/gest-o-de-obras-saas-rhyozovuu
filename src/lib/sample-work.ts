import { supabase } from '@/lib/supabase/client'
import { TablesInsert } from '@/lib/supabase/types'

export interface CreateSampleWorkResult {
  success: boolean
  workId?: string
  workName?: string
  error?: string
  warning?: string
}

/**
 * Auxiliar para calcular datas relativas no formato YYYY-MM-DD
 */
function getDateOffset(daysOffset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysOffset)
  return date.toISOString().split('T')[0]
}

/**
 * Cria uma obra de demonstração completa com etapas, despesas e receitas distribuídas
 * no tempo para permitir o cálculo real de métricas financeiras (ROI, Break-Even, Payback).
 */
export async function createSampleWork(userId?: string | null): Promise<CreateSampleWorkResult> {
  const timestamp = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
  const sampleWorkName = `Residência Exemplo — Teste (${timestamp})`

  // 1. Inserir a Obra principal
  // Orçamento: R$ 320.000,00 | Contrato: R$ 410.000,00 | Área: 285 m²
  const workPayload: TablesInsert<'works'> = {
    name: sampleWorkName,
    client: 'Carlos & Mariana Albuquerque',
    address: 'Alameda dos Ipês, 450 - Condomínio Bosque Real',
    manager: 'Eng. Roberto Vasconcelos',
    budget_planned: 320000,
    contracted_value: 410000,
    total_area: 285,
    status: 'in_progress',
    progress_percentage: 35,
    start_date: getDateOffset(-60), // Iniciada há 2 meses
    end_date_planned: getDateOffset(180), // Término previsto em 6 meses
    notes:
      'Obra residencial unifamiliar de alto padrão criada como demonstração do sistema. Contempla sala com pé direito duplo, 4 suítes e área gourmet com piscina.',
  }

  const { data: workData, error: workError } = await supabase
    .from('works')
    .insert(workPayload)
    .select('id, name')
    .single()

  if (workError || !workData) {
    return {
      success: false,
      error: workError?.message || 'Falha ao inserir a obra no banco de dados.',
    }
  }

  const workId = workData.id

  // 2. Inserir Etapas da Obra (work_stages)
  // 3 etapas realistas com diferentes progressos
  const stagesPayload: TablesInsert<'work_stages'>[] = [
    {
      work_id: workId,
      name: '1. Fundação e Infraestrutura',
      manager: 'Eng. Roberto Vasconcelos',
      start_date: getDateOffset(-60),
      end_date_planned: getDateOffset(-20),
      end_date_real: getDateOffset(-18),
      progress_percentage: 100,
      status: 'completed',
      notes: 'Sapatas isoladas, vigas baldrames e impermeabilização concluídas com teste de carga.',
    },
    {
      work_id: workId,
      name: '2. Estrutura e Alvenaria',
      manager: 'Mestre Gilberto',
      start_date: getDateOffset(-20),
      end_date_planned: getDateOffset(40),
      end_date_real: null,
      progress_percentage: 60,
      status: 'in_progress',
      notes: 'Pilares do pavimento térreo concretados; alvenaria de vedação em andamento.',
    },
    {
      work_id: workId,
      name: '3. Instalações Hidrossanitárias e Elétricas',
      manager: 'Téc. Anderson Lima',
      start_date: getDateOffset(25),
      end_date_planned: getDateOffset(90),
      end_date_real: null,
      progress_percentage: 0,
      status: 'pending',
      notes: 'Tubulações e passagens prontas para assentamento na laje.',
    },
  ]

  // Inserir etapas sem travar se der erro (resiliente)
  const { error: stagesError } = await supabase.from('work_stages').insert(stagesPayload)
  if (stagesError) {
    console.warn('[createSampleWork] Aviso ao criar etapas:', stagesError.message)
  }

  // 3. Inserir Despesas da Obra (expenses)
  // Valores somados: R$ 52.000 + R$ 38.500 + R$ 24.200 = R$ 114.700,00
  // Distribuídas ao longo dos últimos meses
  const expensesPayload: TablesInsert<'expenses'>[] = [
    {
      work_id: workId,
      manager_id: userId || null,
      category: 'Materiais',
      description: 'Aço CA-50, blocos cerâmicos e cimento CP-II estrutural',
      merchant_name: 'Distribuidora Central da Construção',
      merchant_cnpj: '12.345.678/0001-90',
      value: 52000,
      date: getDateOffset(-50),
      payment_method: 'Boleto',
    },
    {
      work_id: workId,
      manager_id: userId || null,
      category: 'Mão de Obra',
      description: 'Medição quinzenal 01 — Equipe de fundação e formas',
      merchant_name: 'Empreiteira Silva & Filhos',
      value: 38500,
      date: getDateOffset(-30),
      payment_method: 'Pix',
    },
    {
      work_id: workId,
      manager_id: userId || null,
      category: 'Equipamentos',
      description: 'Locação de betoneiras, escoramentos metálicos e caçambas',
      merchant_name: 'LocMais Equipamentos',
      value: 24200,
      date: getDateOffset(-10),
      payment_method: 'Pix',
    },
  ]

  const { error: expensesError } = await supabase.from('expenses').insert(expensesPayload)
  if (expensesError) {
    console.warn('[createSampleWork] Aviso ao criar despesas:', expensesError.message)
  }

  // 4. Inserir Receitas da Obra (revenues)
  // Valores somados: R$ 80.000 + R$ 65.000 + R$ 50.000 = R$ 195.000,00
  // Com isso: Receita acumulada (195k) > Despesas (114.7k) => ROI positivo (+69.9%) e Ponto de equilíbrio coberto
  const revenuesPayload: TablesInsert<'revenues'>[] = [
    {
      work_id: workId,
      source: 'Entrada / Sinal',
      description: 'Aporte inicial do cliente conforme cláusula 3 do contrato',
      value: 80000,
      date: getDateOffset(-55),
      status: 'received',
    },
    {
      work_id: workId,
      source: 'Medição de Obra',
      description: '1ª Medição — Conclusão integral da fundação',
      value: 65000,
      date: getDateOffset(-25),
      status: 'received',
    },
    {
      work_id: workId,
      source: 'Medição de Obra',
      description: '2ª Medição parcial — Pilares e vigas do térreo',
      value: 50000,
      date: getDateOffset(-5),
      status: 'received',
    },
  ]

  const { error: revenuesError } = await supabase.from('revenues').insert(revenuesPayload)
  if (revenuesError) {
    console.warn('[createSampleWork] Aviso ao criar receitas:', revenuesError.message)
  }

  return {
    success: true,
    workId,
    workName: workData.name,
  }
}
