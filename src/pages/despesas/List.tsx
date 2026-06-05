import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, QrCode, Loader2, Edit, Trash } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useData } from '@/hooks/use-data'
import { Despesa, Obra } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Scanner } from '@/components/Scanner'
import { parseReceiptUrl } from '@/services/receipt'
import { useAuth } from '@/hooks/use-auth'

const initialFormState = {
  work_id: '',
  description: '',
  category: 'Materiais',
  value: '',
  date: new Date().toISOString().split('T')[0],
  merchant_name: '',
  merchant_cnpj: '',
  payment_method: 'Pix',
}

export default function DespesasList() {
  const { data: despesas, loading, refetch } = useData<Despesa>('expenses', '*, works(name)')
  const { data: works } = useData<Obra>('works', 'id, name')
  const { toast } = useToast()
  const { user } = useAuth()

  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [formData, setFormData] = useState(initialFormState)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState(initialFormState)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('expenses').insert({
      work_id: formData.work_id === 'none' ? null : formData.work_id,
      manager_id: user?.id,
      description: formData.description,
      category: formData.category,
      value: Number(formData.value),
      date: formData.date,
      merchant_name: formData.merchant_name || null,
      merchant_cnpj: formData.merchant_cnpj || null,
      payment_method: formData.payment_method,
    })
    if (!error) {
      toast({ title: 'Despesa registrada!' })
      setOpen(false)
      setFormData(initialFormState)
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const openEdit = (d: Despesa) => {
    setEditId(d.id)
    setEditData({
      work_id: d.work_id || 'none',
      description: d.description || '',
      category: d.category || 'Outros',
      value: String(d.value),
      date: d.date,
      merchant_name: d.merchant_name || '',
      merchant_cnpj: d.merchant_cnpj || '',
      payment_method: d.payment_method || 'Pix',
    })
    setEditOpen(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    const { error } = await supabase
      .from('expenses')
      .update({
        work_id: editData.work_id === 'none' ? null : editData.work_id,
        description: editData.description,
        category: editData.category,
        value: Number(editData.value),
        date: editData.date,
        merchant_name: editData.merchant_name || null,
        merchant_cnpj: editData.merchant_cnpj || null,
        payment_method: editData.payment_method,
      })
      .eq('id', editId)

    if (!error) {
      toast({ title: 'Despesa atualizada!' })
      setEditOpen(false)
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta despesa?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (!error) {
      toast({ title: 'Despesa excluída' })
      refetch()
    }
  }

  const handleScan = async (scanData: { url?: string; image?: string }) => {
    setScanning(false)
    setParsing(true)
    try {
      const apiData = await parseReceiptUrl(scanData)
      setFormData((prev) => ({
        ...prev,
        value: apiData.totalValue?.toString() || '',
        merchant_cnpj: apiData.merchantCnpj || '',
        merchant_name: apiData.merchantName || '',
        date: apiData.date || new Date().toISOString().split('T')[0],
        description: apiData.merchantName ? `Compra em ${apiData.merchantName}` : 'Despesa (NFC-e)',
      }))
      toast({ title: 'Dados extraídos com sucesso!' })
    } catch (error: any) {
      toast({ title: 'Erro ao processar', description: error.message, variant: 'destructive' })
    } finally {
      setParsing(false)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.value), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Despesas Financeiras</h1>
          <p className="text-muted-foreground">Controle de custos por obra e categoria.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(val) => {
            setOpen(val)
            if (!val) {
              setScanning(false)
              setParsing(false)
              setFormData(initialFormState)
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registrar Despesa</DialogTitle>
            </DialogHeader>
            {scanning ? (
              <Scanner onScan={handleScan} onCancel={() => setScanning(false)} />
            ) : (
              <form onSubmit={handleCreate} className="space-y-4 mt-4 px-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-secondary/50 border-dashed"
                  onClick={() => setScanning(true)}
                  disabled={parsing}
                >
                  {parsing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando comprovante...
                    </>
                  ) : (
                    <>
                      <QrCode className="h-4 w-4 mr-2" /> Ler QR Code ou Imagem
                    </>
                  )}
                </Button>
                <div className="space-y-2">
                  <Label>Obra (Opcional)</Label>
                  <Select
                    value={formData.work_id}
                    onValueChange={(val) => setFormData({ ...formData, work_id: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Geral / Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Geral / Nenhuma</SelectItem>
                      {works?.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fornecedor</Label>
                    <Input
                      value={formData.merchant_name}
                      onChange={(e) => setFormData({ ...formData, merchant_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input
                      value={formData.merchant_cnpj}
                      onChange={(e) => setFormData({ ...formData, merchant_cnpj: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(val) => setFormData({ ...formData, category: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Materiais">Materiais</SelectItem>
                        <SelectItem value="Mão de Obra">Mão de Obra</SelectItem>
                        <SelectItem value="Equipamentos">Equipamentos</SelectItem>
                        <SelectItem value="Administrativo">Administrativo</SelectItem>
                        <SelectItem value="Outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pagamento</Label>
                    <Select
                      value={formData.payment_method}
                      onValueChange={(val) => setFormData({ ...formData, payment_method: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pix">Pix</SelectItem>
                        <SelectItem value="Boleto">Boleto</SelectItem>
                        <SelectItem value="Cartão">Cartão</SelectItem>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={parsing}>
                  {parsing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...
                    </>
                  ) : (
                    'Salvar Despesa'
                  )}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
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

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Obra</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor (R$)</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {despesas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhuma despesa registrada.
                </TableCell>
              </TableRow>
            )}
            {despesas.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="text-muted-foreground">{formatDate(d.date)}</TableCell>
                <TableCell className="font-medium">
                  {d.description}
                  {d.merchant_name && (
                    <span className="block text-xs text-muted-foreground">{d.merchant_name}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{d.works?.name || '-'}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                    {d.category}
                  </span>
                </TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(d.value)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(d.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Despesa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-4 px-1">
            <div className="space-y-2">
              <Label>Obra (Opcional)</Label>
              <Select
                value={editData.work_id}
                onValueChange={(val) => setEditData({ ...editData, work_id: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Geral / Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geral / Nenhuma</SelectItem>
                  {works?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                required
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Input
                  value={editData.merchant_name}
                  onChange={(e) => setEditData({ ...editData, merchant_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input
                  value={editData.merchant_cnpj}
                  onChange={(e) => setEditData({ ...editData, merchant_cnpj: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={editData.category}
                  onValueChange={(val) => setEditData({ ...editData, category: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Materiais">Materiais</SelectItem>
                    <SelectItem value="Mão de Obra">Mão de Obra</SelectItem>
                    <SelectItem value="Equipamentos">Equipamentos</SelectItem>
                    <SelectItem value="Administrativo">Administrativo</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pagamento</Label>
                <Select
                  value={editData.payment_method}
                  onValueChange={(val) => setEditData({ ...editData, payment_method: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pix">Pix</SelectItem>
                    <SelectItem value="Boleto">Boleto</SelectItem>
                    <SelectItem value="Cartão">Cartão</SelectItem>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  required
                  value={editData.date}
                  onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={editData.value}
                  onChange={(e) => setEditData({ ...editData, value: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" className="w-full">
              Atualizar Despesa
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
