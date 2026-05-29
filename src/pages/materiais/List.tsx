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
import { Input } from '@/components/ui/input'
import { Plus, ArrowRightLeft, Search } from 'lucide-react'
import useAppStore from '@/stores/use-app-store'
import { useToast } from '@/hooks/use-toast'

export default function MateriaisList() {
  const { materiais, updateMaterialQuantity } = useAppStore()
  const { toast } = useToast()

  const handleSimulateMovement = (id: string, name: string) => {
    updateMaterialQuantity(id, -10)
    toast({
      title: 'Saída de estoque registrada',
      description: `10 unidades de ${name} foram removidas do estoque.`,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estoque e Materiais</h1>
          <p className="text-muted-foreground">Controle de inventário e movimentações.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Movimentação
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Novo Material
          </Button>
        </div>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Buscar material..." className="pl-9" />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Qtd Atual</TableHead>
              <TableHead className="text-right">Estoque Min.</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materiais.map((item) => {
              const isLow = item.quantity <= item.minQuantity
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.name}
                    <span className="block text-xs text-muted-foreground">{item.unit}</span>
                  </TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell
                    className={`text-right font-bold text-lg ${isLow ? 'text-red-600' : ''}`}
                  >
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {item.minQuantity}
                  </TableCell>
                  <TableCell className="text-center">
                    {isLow ? (
                      <Badge variant="destructive" className="bg-red-500">
                        Atenção
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                        Normal
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSimulateMovement(item.id, item.name)}
                    >
                      Simular Saída
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
