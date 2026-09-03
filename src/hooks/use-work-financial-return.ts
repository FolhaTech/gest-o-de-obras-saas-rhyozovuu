import { useMemo } from 'react'
import { Obra, Despesa, Receita } from '@/types'
import { useDataFilter } from '@/hooks/use-data'
import { calculateWorkFinancialMetrics, FinancialMetrics } from '@/lib/financial-calculator'

export interface UseWorkFinancialReturnResult {
  metrics: FinancialMetrics
  loading: boolean
  isTableMissing: boolean
  isNetworkError: boolean
  expenses: Despesa[]
  revenues: Receita[]
  refetch: () => Promise<void>
}

/**
 * Hook para carregar receitas e despesas de uma obra específica e calcular automaticamente
 * ROI, Ponto de Equilíbrio (Break-Even) e Payback.
 */
export function useWorkFinancialReturn(obra: Obra | undefined): UseWorkFinancialReturnResult {
  const workId = obra?.id

  const {
    data: expenses,
    loading: loadingExpenses,
    isTableMissing: missingExpenses,
    isNetworkError: netErrorExpenses,
    refetch: refetchExpenses,
  } = useDataFilter<Despesa>('expenses', 'work_id', workId)

  const {
    data: revenues,
    loading: loadingRevenues,
    isTableMissing: missingRevenues,
    isNetworkError: netErrorRevenues,
    refetch: refetchRevenues,
  } = useDataFilter<Receita>('revenues', 'work_id', workId)

  const metrics = useMemo(() => {
    return calculateWorkFinancialMetrics({
      obra: obra || {},
      expenses,
      revenues,
    })
  }, [obra, expenses, revenues])

  const refetch = async () => {
    await Promise.allSettled([refetchExpenses(), refetchRevenues()])
  }

  return {
    metrics,
    loading: loadingExpenses || loadingRevenues,
    isTableMissing: missingExpenses || missingRevenues,
    isNetworkError: netErrorExpenses || netErrorRevenues,
    expenses,
    revenues,
    refetch,
  }
}
