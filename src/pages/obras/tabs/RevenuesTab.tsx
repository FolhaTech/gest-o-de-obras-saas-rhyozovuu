import { useState } from 'react'
import { Plus, Trash2, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDataFilter } from '@/hooks/use-data'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Receita, Despesa, Obra } from '@/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Database, RefreshCw, WifiOff } from 'lucide-react'
import { calculateWorkFinancialMetrics } from '@/lib/financial-calculator'
import { WorkFinancialReturnSection } from '@/components/financial/WorkFinancialReturnSection'

export default function RevenuesTab({ obraId, obra }: { obraId: string; obra?: Obra }) {
  const {
    data: receitas,
    loading,
    isTableMissing,
    isNetworkError,
    refetch,
  } = useDataFilter<Receita>('revenues', 'work_id', obraId)

  const { data: despesas, refetch: refetchDespesas } = useDataFilter<Despesa>(
    'expenses',
    'work_id',
    obraId,
  )

  const { toast } = useToast()

  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState<Partial<Receita>>({
    date: new Date().toISOString().split('T')[0],
    source: 'Airbnb',
    value: 0,
    description: '',
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  const total = receitas?.reduce((acc, curr) => acc + Number(curr.value), 0) || 0

  const metrics = obra
    ? calculateWorkFinancialMetrics({
        obra,
        expenses: despesas,
        revenues: receitas,
      })
    : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const { error } = await supabase.from('revenues').insert([
      {
        work_id: obraId,
        source: formData.source,
        value: formData.value,
        date: formData.date,
        description: formData.description,
      },
    ])

    setIsSubmitting(false)

    if (!error) {
      toast({ title: 'Receita registrada com sucesso!' })
      setIsOpen(false)
      setFormData({
        date: new Date().toISOString().split('T')[0],
        source: 'Airbnb',
        value: 0,
        description: '',
      })
      refetch()
    } else {
      toast({ title: 'Erro ao registrar', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta receita?')) return

    const { error } = await supabase.from('revenues').delete().eq('id', id)

    if (!error) {
      toast({ title: 'Receita excluída' })
      refetch()
    } else {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {isTableMissing && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <Database className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">
            Tabela de receitas ainda não configurada
          </AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            A tabela <code className="font-mono">revenues</code> ainda não foi criada no Supabase.
            Execute o script de migração SQL para salvar e gerenciar entradas financeiras.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2 border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
              >
                <RefreshCw className="h-4 w-4" /> Recarregar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isNetworkError && !isTableMissing && (
        <Alert variant="destructive">
          <WifiOff className="h-5 w-5" />
          <AlertTitle className="font-semibold">Erro de conexão</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            Não foi possível carregar as receitas da obra.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2 bg-white text-destructive hover:bg-red-50"
              >
                <RefreshCw className="h-4 w-4" /> Tentar Novamente
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {obra && metrics && <WorkFinancialReturnSection obra={obra} metrics={metrics} />}

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Histórico de Receitas</h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <Button onClick={() => setIsOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Adicionar Receita
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Receita</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => setFormData({ ...formData, source: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Airbnb">Airbnb</SelectItem>
                    <SelectItem value="Locação Direta">Locação Direta</SelectItem>
                    <SelectItem value="Booking">Booking</SelectItem>
                    <SelectItem value="Venda">Venda</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={formData.value || ''}
                  onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  required
                  value={formData.date || ''}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição (Opcional)</Label>
                <Input
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Aluguel mensal referente a Jan/2026"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar Receita'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : receitas?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhuma receita registrada para esta obra.
                </TableCell>
              </TableRow>
            ) : (
              receitas?.map((receita) => (
                <TableRow key={receita.id}>
                  <TableCell>
                    {new Date(receita.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                  </TableCell>
                  <TableCell className="font-medium">{receita.source}</TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[200px]">
                    {receita.description || '-'}
                  </TableCell>
                  <TableCell className="text-right text-green-600 font-medium">
                    {formatCurrency(receita.value)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                      onClick={() => handleDelete(receita.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
