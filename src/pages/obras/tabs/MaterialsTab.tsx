import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import useAppStore from '@/stores/use-app-store'

export default function MaterialsTab() {
  const { materiais } = useAppStore()

  // For simulation, we show all general materials here. In a real app, these would be filtered by obra.

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
            const isLow = item.quantity <= item.minQuantity
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell className={`text-right font-semibold ${isLow ? 'text-red-600' : ''}`}>
                  {item.quantity}
                </TableCell>
                <TableCell className="text-muted-foreground">{item.unit}</TableCell>
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
