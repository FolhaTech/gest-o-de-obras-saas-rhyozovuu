import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Despesa } from '@/types'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { useMemo } from 'react'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

interface DashboardChartsProps {
  despesas: Despesa[]
  /** Obras que entram (filtros do Dashboard); nulo = todas. Vale para os contratos de terceiros. */
  workIds?: string[] | null
}

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export default function DashboardCharts({ despesas, workIds = null }: DashboardChartsProps) {
  const [laborCost, setLaborCost] = useState(0)
  // chave estável das obras filtradas (vazio = nenhuma; nulo = todas): refaz a soma só quando elas mudam
  const workKey = workIds ? workIds.join(',') : null

  useEffect(() => {
    let isMounted = true
    const fetchLabor = async () => {
      try {
        const { data, error } = await supabase.from('external_contracts').select('total_value, work_id')
        if (!error && data && isMounted) {
          const only = workKey !== null ? new Set(workKey.split(',').filter(Boolean)) : null
          const rows = only ? data.filter((c: any) => c.work_id && only.has(c.work_id)) : data
          setLaborCost(rows.reduce((acc, curr) => acc + Number(curr.total_value || 0), 0))
        }
      } catch (err) {
        console.warn('[DashboardCharts] Error loading labor costs:', err)
      }
    }
    fetchLabor()
    return () => {
      isMounted = false
    }
  }, [workKey])
  const chartData = useMemo(() => {
    const expensesByCategory = despesas.reduce(
      (acc, despesa) => {
        const category = despesa.category || 'Outros'
        acc[category] = (acc[category] || 0) + Number(despesa.value)
        return acc
      },
      {} as Record<string, number>,
    )

    return Object.entries(expensesByCategory)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [despesas])

  const chartConfig = {
    total: {
      label: 'Total Gasto',
      color: 'hsl(var(--primary))',
    },
  }

  return (
    <Card className="col-span-4 hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Despesas por Categoria</CardTitle>
        <div className="text-sm font-medium text-muted-foreground flex flex-col items-end">
          <span>Custos Contratos Terceiros:</span>
          <span className="text-primary">{formatCurrency(laborCost)}</span>
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        {chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Nenhuma despesa registrada.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                fontSize={12}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `R$ ${value}`}
                fontSize={12}
              />
              <ChartTooltip
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                content={
                  <ChartTooltipContent
                    payload={[]}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                }
              />
              <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
