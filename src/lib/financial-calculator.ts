import { Obra, Despesa, Receita } from '@/types'

export interface FinancialMetrics {
  // Investimento total considerado
  totalExpenses: number // despesas reais somadas
  investmentBasis: number // totalExpenses > 0 ? totalExpenses : budget_planned
  isUsingBudgetFallback: boolean

  // Receita total considerada
  totalRevenues: number // receitas reais somadas
  revenueBasis: number // totalRevenues > 0 ? totalRevenues : contracted_value
  isUsingContractFallback: boolean

  // Lucro / Saldo
  netProfit: number // revenueBasis - investmentBasis
  currentCashFlow: number // totalRevenues - totalExpenses

  // 1. ROI (%) = (Receita acumulada - Investimento) / Investimento * 100
  roiPercentage: number | null // null se investmentBasis <= 0
  roiStatus: 'positive' | 'negative' | 'neutral' | 'indeterminate'

  // 2. Break-Even Point
  breakEvenValue: number // R$ necessário para cobrir o investimento (= investmentBasis)
  breakEvenPercentage: number | null // (revenue / breakEvenValue) * 100
  breakEvenRemainingValue: number // Math.max(0, breakEvenValue - revenueBasis)
  hasReachedBreakEven: boolean

  // 3. Payback (Prazo de retorno)
  monthlyAverageRevenue: number // média mensal calculada com base no histórico
  monthlyAverageNet: number // média de lucro mensal
  monthsToPayback: number | null // meses estimados a partir do início ou da data atual
  estimatedPaybackDate: string | null // ISO Date string (YYYY-MM-DD)
  paybackStatus: 'achieved' | 'estimated' | 'insufficient_data' | 'negative_trend'
  paybackMessage: string
}

export interface CalculateMetricsParams {
  obra: Partial<Obra>
  expenses?: Despesa[] | null
  revenues?: Receita[] | null
}

/**
 * Calcula ROI, Ponto de Equilíbrio (Break-Even) e Payback para uma obra.
 */
export function calculateWorkFinancialMetrics({
  obra,
  expenses = [],
  revenues = [],
}: CalculateMetricsParams): FinancialMetrics {
  const safeExpenses = expenses || []
  const safeRevenues = revenues || []

  // Total de despesas registradas
  const totalExpenses = safeExpenses.reduce((acc, exp) => acc + (Number(exp.value) || 0), 0)
  const budgetPlanned = Number(obra.budget_planned) || 0
  const isUsingBudgetFallback = totalExpenses <= 0 && budgetPlanned > 0
  const investmentBasis = totalExpenses > 0 ? totalExpenses : budgetPlanned

  // Total de receitas registradas
  const totalRevenues = safeRevenues.reduce((acc, rev) => acc + (Number(rev.value) || 0), 0)
  const contractedValue = Number(obra.contracted_value) || 0
  const isUsingContractFallback = totalRevenues <= 0 && contractedValue > 0
  const revenueBasis = totalRevenues > 0 ? totalRevenues : contractedValue

  // Lucro Líquido
  const netProfit = revenueBasis - investmentBasis
  const currentCashFlow = totalRevenues - totalExpenses

  // 1. ROI (%)
  let roiPercentage: number | null = null
  let roiStatus: FinancialMetrics['roiStatus'] = 'indeterminate'

  if (investmentBasis > 0) {
    roiPercentage = ((revenueBasis - investmentBasis) / investmentBasis) * 100
    if (roiPercentage > 0.01) {
      roiStatus = 'positive'
    } else if (roiPercentage < -0.01) {
      roiStatus = 'negative'
    } else {
      roiStatus = 'neutral'
    }
  }

  // 2. Break-Even
  const breakEvenValue = investmentBasis
  let breakEvenPercentage: number | null = null
  let breakEvenRemainingValue = 0
  let hasReachedBreakEven = false

  if (breakEvenValue > 0) {
    breakEvenPercentage = (revenueBasis / breakEvenValue) * 100
    breakEvenRemainingValue = Math.max(0, breakEvenValue - revenueBasis)
    hasReachedBreakEven = revenueBasis >= breakEvenValue
  } else if (revenueBasis > 0) {
    // Sem investimento cadastrado, mas com receita
    breakEvenPercentage = 100
    hasReachedBreakEven = true
  }

  // 3. Payback
  let monthlyAverageRevenue = 0
  let monthlyAverageNet = 0
  let monthsToPayback: number | null = null
  let estimatedPaybackDate: string | null = null
  let paybackStatus: FinancialMetrics['paybackStatus'] = 'insufficient_data'
  let paybackMessage = 'Cadastre receitas e despesas para estimar o prazo de retorno.'

  if (hasReachedBreakEven) {
    paybackStatus = 'achieved'
    paybackMessage = 'Ponto de equilíbrio atingido! O investimento já foi recuperado.'
    monthsToPayback = 0
  } else if (investmentBasis <= 0) {
    paybackStatus = 'insufficient_data'
    paybackMessage = 'Informe o orçamento planejado ou lance despesas para calcular o payback.'
  } else {
    // Analisar histórico de receitas com datas válidas
    const datedRevenues = safeRevenues
      .filter((r) => r.date && !isNaN(new Date(r.date).getTime()) && Number(r.value) > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const remainingToRecover = breakEvenRemainingValue

    if (datedRevenues.length > 0) {
      // Calcular intervalo temporal entre a data inicial (início da obra ou 1ª receita/despesa) e a data atual/última receita
      const firstRevDate = new Date(datedRevenues[0].date)
      const startDateStr = obra.start_date || datedRevenues[0].date
      const effectiveStartDate = new Date(startDateStr)
      const referenceStartDate = !isNaN(effectiveStartDate.getTime())
        ? effectiveStartDate
        : firstRevDate

      const today = new Date()
      // Diferença em meses entre início e hoje (mínimo 1 mês para não explodir taxa)
      const diffDays = Math.max(
        15,
        Math.floor((today.getTime() - referenceStartDate.getTime()) / (1000 * 60 * 60 * 24)),
      )
      const elapsedMonths = Math.max(0.5, diffDays / 30.4375)

      monthlyAverageRevenue = totalRevenues / elapsedMonths

      // Analisar também ritmo de despesas para lucro líquido mensal médio
      const expensePerMonth = totalExpenses > 0 ? totalExpenses / elapsedMonths : 0
      monthlyAverageNet = monthlyAverageRevenue - expensePerMonth

      // Usamos a receita média mensal projetada para cobrir o saldo remanescente do investimento
      const paceMonthly =
        monthlyAverageRevenue > 0
          ? monthlyAverageRevenue
          : contractedValue > 0
            ? contractedValue / 12
            : 0

      if (paceMonthly > 0) {
        const estimatedMonthsNeeded = remainingToRecover / paceMonthly
        monthsToPayback = Math.max(0.1, Number(estimatedMonthsNeeded.toFixed(1)))

        const targetDate = new Date(today)
        const daysToAdd = Math.round(estimatedMonthsNeeded * 30.4375)
        targetDate.setDate(targetDate.getDate() + daysToAdd)
        estimatedPaybackDate = targetDate.toISOString().split('T')[0]

        paybackStatus = 'estimated'
        paybackMessage = `Retorno previsto em aproximadamente ${monthsToPayback < 1 ? '< 1' : monthsToPayback.toFixed(1)} ${monthsToPayback === 1 ? 'mês' : 'meses'}.`
      } else {
        paybackStatus = 'insufficient_data'
        paybackMessage = 'Receita mensal média não identificada para projetar o payback.'
      }
    } else if (contractedValue > 0 && investmentBasis > 0) {
      // Projeção baseada em valor contratado e prazo planejado da obra
      let durationMonths = 12
      if (obra.start_date && obra.end_date_planned) {
        const start = new Date(obra.start_date).getTime()
        const end = new Date(obra.end_date_planned).getTime()
        if (!isNaN(start) && !isNaN(end) && end > start) {
          durationMonths = Math.max(1, (end - start) / (1000 * 60 * 60 * 24 * 30.4375))
        }
      }

      const projectedMonthly = contractedValue / durationMonths
      monthlyAverageRevenue = projectedMonthly
      const estimatedMonthsNeeded = remainingToRecover / projectedMonthly
      monthsToPayback = Number(estimatedMonthsNeeded.toFixed(1))

      const today = new Date()
      const targetDate = new Date(today)
      targetDate.setDate(targetDate.getDate() + Math.round(estimatedMonthsNeeded * 30.4375))
      estimatedPaybackDate = targetDate.toISOString().split('T')[0]

      paybackStatus = 'estimated'
      paybackMessage = `Estimativa com base no contrato: ~${monthsToPayback.toFixed(1)} meses.`
    } else {
      paybackStatus = 'insufficient_data'
      paybackMessage = 'Nenhuma receita registrada ainda nesta obra.'
    }
  }

  return {
    totalExpenses,
    investmentBasis,
    isUsingBudgetFallback,
    totalRevenues,
    revenueBasis,
    isUsingContractFallback,
    netProfit,
    currentCashFlow,
    roiPercentage,
    roiStatus,
    breakEvenValue,
    breakEvenPercentage,
    breakEvenRemainingValue,
    hasReachedBreakEven,
    monthlyAverageRevenue,
    monthlyAverageNet,
    monthsToPayback,
    estimatedPaybackDate,
    paybackStatus,
    paybackMessage,
  }
}
