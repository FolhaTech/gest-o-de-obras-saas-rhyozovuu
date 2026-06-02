import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/formatters'
import { useData } from '@/hooks/use-data'
import { Equipe } from '@/types'
import { Plus, UserCheck, UserMinus } from 'lucide-react'

export default function EquipesList() {
  const { data: equipes, loading } = useData<Equipe>('team_members')

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipes e Mão de Obra</h1>
          <p className="text-muted-foreground">Gestão de equipes próprias e terceirizadas.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Nova Equipe
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome da Equipe</TableHead>
              <TableHead>Especialidade</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Custo Diário</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma equipe cadastrada.
                </TableCell>
              </TableRow>
            )}
            {equipes.map((equipe) => (
              <TableRow key={equipe.id}>
                <TableCell className="font-medium">{equipe.name}</TableCell>
                <TableCell className="text-muted-foreground">{equipe.role}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      equipe.type === 'internal'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-orange-50 text-orange-700'
                    }
                  >
                    {equipe.type === 'internal' ? 'Própria' : 'Terceirizada'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(equipe.daily_cost)}
                </TableCell>
                <TableCell className="text-center">
                  {equipe.status === 'active' ? (
                    <div className="flex items-center justify-center gap-1 text-emerald-600 text-sm font-medium">
                      <UserCheck className="h-4 w-4" /> Ativo
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm font-medium">
                      <UserMinus className="h-4 w-4" /> Inativo
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
