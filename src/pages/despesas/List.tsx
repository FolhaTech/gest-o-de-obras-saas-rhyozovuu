import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Filter } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useData } from '@/hooks/use-data'
import { Despesa } from '@/types'

export default function DespesasList() {
  const { data: despesas, loading } = useData<Despesa>('expenses', '*, works(name)')

  if (loading) return <Skeleton className="h-64 w-full" />

  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.value), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Despesas Financeiras</h1>
          <p className="text-muted-foreground">Controle de custos por obra e categoria.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Nova Despesa
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1 bg-primary text-primary-foreground">
          <CardContent className="p-6">
            <h3 className="text-primary-foreground/80 text-sm font-medium mb-2">
              Total Realizado (Geral)
            </h3>
            <p className="text-3xl font-bold">{formatCurrency(totalDespesas)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-2 py-4">
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" /> Filtrar por Obra
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Obra</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor (R$)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {despesas.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma despesa registrada.
                </TableCell>
              </TableRow>
            )}
            {despesas.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="text-muted-foreground">{formatDate(d.date)}</TableCell>
                <TableCell className="font-medium">{d.description}</TableCell>
                <TableCell className="text-sm">{d.works?.name || '-'}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                    {d.category}
                  </span>
                </TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(d.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
