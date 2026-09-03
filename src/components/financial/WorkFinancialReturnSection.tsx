import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Hourglass,
  Info,
  DollarSign,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { FinancialMetrics } from '@/lib/financial-calculator'
import { Obra } from '@/types'

interface WorkFinancialReturnSectionProps {
  obra: Obra
  metrics: FinancialMetrics
  onNavigateToRevenues?: () => void
}

export function WorkFinancialReturnSection({
  obra,
  metrics,
  onNavigateToRevenues,
}: WorkFinancialReturnSectionProps) {
  const {
    totalExpenses,
    investmentBasis,
    isUsingBudgetFallback,
    totalRevenues,
    revenueBasis,
    isUsingContractFallback,
    netProfit,
    roiPercentage,
    roiStatus,
    breakEvenValue,
    breakEvenPercentage,
    breakEvenRemainingValue,
    hasReachedBreakEven,
    monthsToPayback,
    estimatedPaybackDate,
    paybackStatus,
    paybackMessage,
  } = metrics

  // Cores do ROI
  const getRoiColorClasses = () => {
    switch (roiStatus) {
      case 'positive':
        return {
          badge:
            'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400',
          text: 'text-emerald-600 dark:text-emerald-400',
          icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
        }
      case 'negative':
        return {
          badge: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400',
          text: 'text-red-600 dark:text-red-400',
          icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />,
        }
      case 'neutral':
        return {
          badge: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400',
          text: 'text-blue-600 dark:text-blue-400',
          icon: <Scale className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
        }
      default:
        return {
          badge: 'bg-muted text-muted-foreground border-muted-foreground/20',
          text: 'text-muted-foreground',
          icon: <HelpCircle className="h-5 w-5 text-muted-foreground" />,
        }
    }
  }

  const roiStyle = getRoiColorClasses()
  const cappedBreakEvenPercent =
    breakEvenPercentage !== null ? Math.min(Math.max(0, breakEvenPercentage), 100) : 0

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Retorno sobre o Investimento da Obra
            </h3>
            <p className="text-sm text-muted-foreground">
              Acompanhamento de ROI, Ponto de Equilíbrio (Break-Even) e Payback em tempo real.
            </p>
          </div>
          {(isUsingBudgetFallback || isUsingContractFallback) && (
            <Badge
              variant="outline"
              className="text-xs bg-amber-50 text-amber-800 border-amber-200 w-fit"
            >
              <Info className="h-3.5 w-3.5 mr-1" />
              {isUsingBudgetFallback && isUsingContractFallback
                ? 'Baseado em orçamento e contrato (sem lançamentos)'
                : isUsingBudgetFallback
                  ? 'Despesas baseadas no orçamento previsto'
                  : 'Receitas baseadas no contrato'}
            </Badge>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: ROI */}
          <Card className="relative overflow-hidden border-border/60 hover:shadow-sm transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium">ROI da Obra</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <p className="font-semibold mb-1">Retorno sobre o Investimento</p>
                    <p>Fórmula: (Receita Total − Investimento) ÷ Investimento × 100.</p>
                    <p className="mt-1 text-muted-foreground">
                      Considera as receitas acumuladas vs. despesas reais lançadas (ou orçamento
                      planejado).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="p-2 rounded-md bg-muted/60">{roiStyle.icon}</div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold tracking-tight ${roiStyle.text}`}>
                  {roiPercentage !== null
                    ? `${roiPercentage > 0 ? '+' : ''}${roiPercentage.toFixed(1)}%`
                    : '—'}
                </span>
                {roiPercentage !== null && (
                  <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${roiStyle.badge}`}>
                    {roiStatus === 'positive'
                      ? 'Lucro'
                      : roiStatus === 'negative'
                        ? 'Déficit'
                        : 'Equilíbrio'}
                  </Badge>
                )}
              </div>

              <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t">
                <div className="flex justify-between">
                  <span>Receita considerada:</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(revenueBasis)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Investimento considerado:</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(investmentBasis)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Resultado Líquido:</span>
                  <span className={netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {netProfit >= 0 ? '+' : ''}
                    {formatCurrency(netProfit)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Ponto de Equilíbrio (Break-Even) */}
          <Card className="relative overflow-hidden border-border/60 hover:shadow-sm transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium">Ponto de Equilíbrio</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <p className="font-semibold mb-1">Break-Even Point</p>
                    <p>
                      Valor exato de receita necessário para cobrir todos os custos/investimentos da
                      obra.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Atingido quando a receita acumulada iguala ou supera as despesas registradas.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="p-2 rounded-md bg-muted/60">
                <Scale className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold tracking-tight">
                    {formatCurrency(breakEvenValue)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {breakEvenPercentage !== null ? `${breakEvenPercentage.toFixed(0)}%` : '—'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hasReachedBreakEven ? (
                    <span className="text-emerald-600 font-medium">
                      ✓ Coberto ({formatCurrency(revenueBasis)} recebidos)
                    </span>
                  ) : (
                    <span>Faltam {formatCurrency(breakEvenRemainingValue)} para empatar</span>
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Receita: {formatCurrency(revenueBasis)}</span>
                  <span>Meta: {formatCurrency(breakEvenValue)}</span>
                </div>
                <Progress
                  value={cappedBreakEvenPercent}
                  className={`h-2.5 ${
                    hasReachedBreakEven
                      ? '[&>div]:bg-emerald-500'
                      : cappedBreakEvenPercent > 60
                        ? '[&>div]:bg-primary'
                        : '[&>div]:bg-amber-500'
                  }`}
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Payback (Prazo de Retorno) */}
          <Card className="relative overflow-hidden border-border/60 hover:shadow-sm transition-shadow sm:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium">Prazo de Retorno (Payback)</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <p className="font-semibold mb-1">Payback Estimado</p>
                    <p>
                      Tempo estimado para que a receita acumulada cubra integralmente o
                      investimento.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Calculado por interpolação linear da receita média mensal ou cronograma
                      contratual.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="p-2 rounded-md bg-muted/60">
                <Hourglass className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight">
                  {paybackStatus === 'achieved'
                    ? 'Atingido!'
                    : monthsToPayback !== null
                      ? `${monthsToPayback < 1 ? '< 1' : monthsToPayback.toFixed(1)} ${
                          monthsToPayback === 1 ? 'mês' : 'meses'
                        }`
                      : '—'}
                </span>
                {paybackStatus === 'achieved' && (
                  <Badge className="bg-emerald-500 text-white text-[11px] px-1.5 py-0 hover:bg-emerald-600">
                    Recuperado
                  </Badge>
                )}
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                {estimatedPaybackDate && paybackStatus !== 'achieved' ? (
                  <div className="flex justify-between items-center py-0.5">
                    <span>Data prevista:</span>
                    <span className="font-medium text-foreground">
                      {formatDate(estimatedPaybackDate)}
                    </span>
                  </div>
                ) : null}
                <p className="line-clamp-2 text-[11px] leading-relaxed">{paybackMessage}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detalhes de apoio e dicas financeiras */}
        <div className="rounded-lg border bg-muted/30 p-3 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4 text-primary shrink-0" />
            <span>
              <strong>Lançamentos Reais:</strong> Receitas R${' '}
              {totalRevenues.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Despesas R${' '}
              {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Saldo em Caixa
              R${' '}
              {(totalRevenues - totalExpenses).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          {onNavigateToRevenues && (
            <button
              type="button"
              onClick={onNavigateToRevenues}
              className="text-primary hover:underline font-medium text-xs shrink-0 self-end md:self-auto"
            >
              Ver e registrar receitas →
            </button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
