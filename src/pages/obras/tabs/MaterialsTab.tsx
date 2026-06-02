import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useDataFilter } from '@/hooks/use-data'
import { Material } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'

export default function MaterialsTab({ obraId }: { obraId: string }) {
  const { data: materiais, loading } = useDataFilter<Material>('materials', 'work_id', obraId)

  if (loading) return <Skeleton className="h-48 w-full" />

  if (materiais.length === 0) {
    return (
      <p className="text-muted-foreground p-4">
        Nenhum material alocado especificamente para esta obra.
      </p>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Quantidade Atual</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead>Status Estoque</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {materiais.map((item) => {
            const isLow = item.stock_quantity <= item.min_quantity
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell className={`text-right font-semibold ${isLow ? 'text-red-600' : ''}`}>
                  {item.stock_quantity}
                </TableCell>
                <TableCell className="text-muted-foreground">{item.unit_of_measure}</TableCell>
                <TableCell>
                  {isLow ? (
                    <Badge variant="destructive" className="bg-red-500">
                      Estoque Baixo
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                    >
                      Normal
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
