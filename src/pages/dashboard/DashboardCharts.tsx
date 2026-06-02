import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { Area, AreaChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Despesa } from '@/types'

export default function DashboardCharts({ despesas }: { despesas: Despesa[] }) {
  const evolutionData = [
    { month: 'Jan', planned: 10, realized: 12 },
    { month: 'Fev', planned: 25, realized: 22 },
    { month: 'Mar', planned: 40, realized: 35 },
    { month: 'Abr', planned: 55, realized: 50 },
    { month: 'Mai', planned: 70, realized: 65 },
    { month: 'Jun', planned: 85, realized: 80 },
  ]

  const chartConfig = {
    planned: { label: 'Planejado (%)', color: 'hsl(var(--chart-5))' },
    realized: { label: 'Realizado (%)', color: 'hsl(var(--primary))' },
  }

  const expensesByCategory = despesas.reduce(
    (acc, curr) => {
      const cat = curr.category || 'Outros'
      acc[cat] = (acc[cat] || 0) + Number(curr.value)
      return acc
    },
    {} as Record<string, number>,
  )

  const pieData = Object.entries(expensesByCategory).map(([name, value], index) => ({
    name,
    value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }))

  const pieConfig = pieData.reduce(
    (acc, item) => ({ ...acc, [item.name]: { label: item.name, color: item.color } }),
    {},
  )

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Evolução Física (Média)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <AreaChart data={evolutionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="planned"
                stroke="var(--color-planned)"
                fill="var(--color-planned)"
                fillOpacity={0.2}
              />
              <Area
                type="monotone"
                dataKey="realized"
                stroke="var(--color-realized)"
                fill="var(--color-realized)"
                fillOpacity={0.4}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Despesas por Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground">
              Nenhuma despesa registrada.
            </div>
          ) : (
            <ChartContainer config={pieConfig} className="h-[250px] w-full">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
