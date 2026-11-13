import React, { useState, useEffect } from 'react'
import { subDays } from 'date-fns'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Equipe, TeamMemberDocument, WorkerGroup } from '@/types'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { useAuth } from '@/hooks/use-auth'
import {
  FileText,
  Download,
  Trash,
  User,
  CalendarDays,
  DollarSign,
  UploadCloud,
  Loader2,
} from 'lucide-react'

type TimelineEvent = {
  id: string
  date: string
  type: 'attendance' | 'extra' | 'document' | 'registration'
  title: string
  description: string
}

interface WorkerDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  worker: Equipe
  onUpdated: () => void
}

// Campo somente leitura (financeiro): mostra o dado como texto, sem input
function ReadOnlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value || '-'}</div>
    </div>
  )
}

export default function WorkerDetailSheet({
  open,
  onOpenChange,
  worker,
  onUpdated,
}: WorkerDetailSheetProps) {
  const { toast } = useToast()
  const { canSeeValues, readOnly } = useAuth() // pagamento só para o administrador

  // Groups State
  const [groups, setGroups] = useState<WorkerGroup[]>([])

  // Cadastro State
  const [formData, setFormData] = useState<Partial<Equipe>>({})
  const [saving, setSaving] = useState(false)

  // Timeline & Docs State
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [docs, setDocs] = useState<TeamMemberDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (open && worker) {
      setFormData({
        name: worker.name,
        role: worker.role || '',
        phone: worker.phone || '',
        group_id: worker.group_id || 'none',
        type: worker.type || 'internal',
        daily_cost: worker.daily_cost || 0,
        status: worker.status || 'active',
        payment_type: worker.payment_type || 'daily',
        pix_key: worker.pix_key || '',
        admission_date: worker.admission_date || '',
      })
      if (!readOnly) loadDocs() // financeiro não lê documentos pessoais (RLS)
      loadTimeline()
      loadGroups()
    }
  }, [open, worker])

  const loadGroups = async () => {
    try {
      const { data } = await supabase
        .from('worker_groups')
        .select('*')
        .order('name', { ascending: true })
      if (data) {
        setGroups(data as WorkerGroup[])
      }
    } catch {
      // Ignora se tabela ainda não existir
    }
  }

  const loadDocs = async () => {
    setLoadingDocs(true)
    const { data } = await supabase
      .from('team_member_documents')
      .select('*')
      .eq('team_member_id', worker.id)
      .order('created_at', { ascending: false })

    setDocs((data as TeamMemberDocument[]) || [])
    setLoadingDocs(false)
  }

  const loadTimeline = async () => {
    const oneYearAgo = subDays(new Date(), 365).toISOString()

    const [attRes, extRes, docRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('*')
        .eq('worker_id', worker.id)
        .gte('date', oneYearAgo),
      supabase
        .from('attendance_extras')
        .select('*')
        .eq('worker_id', worker.id)
        .gte('week_start_date', oneYearAgo),
      supabase
        .from('team_member_documents')
        .select('*')
        .eq('team_member_id', worker.id)
        .gte('created_at', oneYearAgo),
    ])

    const events: TimelineEvent[] = []

    if (worker.created_at) {
      events.push({
        id: 'reg',
        date: worker.created_at,
        type: 'registration',
        title: 'Cadastro no sistema',
        description: `Adicionado como ${worker.role || 'membro'}`,
      })
    }

    attRes.data?.forEach((a) => {
      events.push({
        id: `att-${a.id}`,
        date: a.date,
        type: 'attendance',
        title: a.is_present ? 'Presença' : 'Falta',
        description: a.is_present ? 'Registrou presença.' : 'Registrou falta.',
      })
    })

    extRes.data?.forEach((e) => {
      events.push({
        id: `ext-${e.id}`,
        date: e.week_start_date,
        type: 'extra',
        title: 'Pagamento/Extra',
        description: `${canSeeValues ? `Valor: ${formatCurrency(e.extra_value || 0)}. ` : ''}${e.notes || ''}`,
      })
    })

    if (!readOnly) docRes.data?.forEach((d) => {
      events.push({
        id: `doc-${d.id}`,
        date: d.created_at,
        type: 'document',
        title: 'Documento Anexado',
        description: `Arquivo: ${d.name}`,
      })
    })

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setTimeline(events)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const resolvedGroupId =
      !formData.group_id || formData.group_id === 'none' ? null : formData.group_id

    const payload: any = {
      name: formData.name,
      role: formData.role,
      phone: formData.phone || null,
      group_id: resolvedGroupId,
      type: formData.type,
      daily_cost: Number(formData.daily_cost),
      status: formData.status,
      payment_type: formData.payment_type,
      pix_key: formData.pix_key || null,
      admission_date: formData.admission_date || null,
    }

    let { error } = await supabase.from('team_members').update(payload).eq('id', worker.id)

    // Se falhar porque a coluna group_id ainda não existe no Supabase, tenta novamente sem ela
    if (error && String(error.message || '').includes('group_id')) {
      delete payload.group_id
      const retry = await supabase.from('team_members').update(payload).eq('id', worker.id)
      error = retry.error
    }

    setSaving(false)
    if (!error) {
      toast({ title: 'Atualizado com sucesso!' })
      onUpdated()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const filePath = `${worker.id}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('team-documents')
      .upload(filePath, file)

    if (uploadError) {
      toast({
        title: 'Erro ao enviar arquivo',
        description: uploadError.message,
        variant: 'destructive',
      })
      setUploading(false)
      return
    }

    const { error: dbError } = await supabase.from('team_member_documents').insert({
      team_member_id: worker.id,
      name: file.name,
      file_path: filePath,
      file_type: file.type || 'application/octet-stream',
    })

    setUploading(false)
    if (!dbError) {
      toast({ title: 'Documento anexado!' })
      loadDocs()
      loadTimeline()
    } else {
      toast({
        title: 'Erro ao salvar info do arquivo',
        description: dbError.message,
        variant: 'destructive',
      })
    }
  }

  const handleDownload = async (doc: TeamMemberDocument) => {
    const { data, error } = await supabase.storage.from('team-documents').download(doc.file_path)

    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.name
      a.click()
    } else {
      toast({ title: 'Erro ao baixar arquivo', variant: 'destructive' })
    }
  }

  const handleDeleteDoc = async (doc: TeamMemberDocument) => {
    if (!confirm('Deseja excluir este documento?')) return

    await supabase.storage.from('team-documents').remove([doc.file_path])
    await supabase.from('team_member_documents').delete().eq('id', doc.id)

    toast({ title: 'Documento excluído' })
    loadDocs()
    loadTimeline()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl md:max-w-2xl flex flex-col gap-0 p-0">
        <div className="p-6 pb-2 border-b">
          <SheetHeader>
            <SheetTitle className="text-2xl">{worker.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              {worker.role || 'Sem função'} • {worker.status === 'active' ? 'Ativo' : 'Inativo'}
            </p>
          </SheetHeader>
        </div>

        <Tabs defaultValue="cadastro" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4">
            <TabsList className={`grid w-full ${readOnly ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
              {!readOnly && <TabsTrigger value="documentos">Documentos</TabsTrigger>}
              <TabsTrigger value="historico">Linha do Tempo</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 p-6">
            <TabsContent value="cadastro" className="m-0 space-y-4">
              {readOnly ? (
                // Financeiro: dados do cadastro só para consulta
                <div className="grid grid-cols-2 gap-4">
                  <ReadOnlyField label="Nome" value={worker.name} />
                  <ReadOnlyField label="Função" value={worker.role} />
                  <ReadOnlyField label="Telefone" value={worker.phone} />
                  <ReadOnlyField label="Chave PIX" value={worker.pix_key} />
                  <ReadOnlyField
                    label="Data de Admissão"
                    value={worker.admission_date ? formatDate(worker.admission_date) : ''}
                  />
                  <ReadOnlyField
                    label="Equipe / Tipo"
                    value={worker.type === 'outsourced' ? 'Terceirizada' : 'Própria'}
                  />
                  <ReadOnlyField
                    label="Grupo"
                    value={groups.find((g) => g.id === worker.group_id)?.name || 'Sem grupo'}
                  />
                  <ReadOnlyField
                    label="Status"
                    value={worker.status === 'active' ? 'Ativo' : 'Inativo'}
                  />
                  {canSeeValues && (
                    <ReadOnlyField
                      label="Tipo Pagamento"
                      value={worker.payment_type === 'monthly' ? 'Mensal' : 'Diária'}
                    />
                  )}
                  {canSeeValues && (
                    <ReadOnlyField label="Valor (R$)" value={formatCurrency(worker.daily_cost || 0)} />
                  )}
                </div>
              ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      required
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Função</Label>
                    <Input
                      required
                      value={formData.role || ''}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Chave PIX</Label>
                    <Input
                      value={formData.pix_key || ''}
                      onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data de Admissão</Label>
                    <Input
                      type="date"
                      value={formData.admission_date || ''}
                      onChange={(e) => setFormData({ ...formData, admission_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Equipe / Tipo</Label>
                    <Select
                      value={formData.type || 'internal'}
                      onValueChange={(val) => setFormData({ ...formData, type: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Própria</SelectItem>
                        <SelectItem value="outsourced">Terceirizada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <Select
                    value={formData.group_id || 'none'}
                    onValueChange={(val) => setFormData({ ...formData, group_id: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem grupo</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {canSeeValues && (
                  <div className="space-y-2">
                    <Label>Tipo Pagamento</Label>
                    <Select
                      value={formData.payment_type || 'daily'}
                      onValueChange={(val) => setFormData({ ...formData, payment_type: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diária</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                  {canSeeValues && (
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.daily_cost || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, daily_cost: Number(e.target.value) })
                      }
                    />
                  </div>
                  )}
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(val) => setFormData({ ...formData, status: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full mt-4" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Atualizar Cadastro
                </Button>
              </form>
              )}
            </TabsContent>

            {!readOnly && (
            <TabsContent value="documentos" className="m-0 space-y-6">
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-muted/20 text-center relative overflow-hidden group">
                <UploadCloud className="w-10 h-10 text-muted-foreground mb-4 group-hover:text-primary transition-colors" />
                <h3 className="font-semibold text-lg">Anexar Documento</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                  Envie CNH, contratos, exames ou qualquer documento relacionado ao funcionário.
                </p>
                <div className="relative">
                  <Input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <Button disabled={uploading} variant="secondary">
                    {uploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      'Selecionar Arquivo'
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Documentos Anexados</h4>
                {loadingDocs ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center p-4 bg-muted/20 rounded-md">
                    Nenhum documento encontrado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 border rounded-md bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="bg-primary/10 p-2 rounded">
                            <FileText className="w-4 h-4 text-primary" />
                          </div>
                          <div className="truncate">
                            <p className="font-medium text-sm truncate">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(doc.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(doc)}
                            title="Baixar"
                          >
                            <Download className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDoc(doc)}
                            className="text-destructive hover:bg-destructive/10"
                            title="Excluir"
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            )}

            <TabsContent value="historico" className="m-0 space-y-4 pb-10">
              <h4 className="font-medium">Atividades (Últimos 12 meses)</h4>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center p-4 bg-muted/20 rounded-md">
                  Nenhuma atividade registrada.
                </p>
              ) : (
                <div className="space-y-6 border-l-2 border-border ml-3 pl-5 relative mt-4">
                  {timeline.map((event) => (
                    <div key={event.id} className="relative">
                      <div className="absolute -left-[29px] bg-background border-2 border-primary rounded-full p-1 shadow-sm">
                        {event.type === 'attendance' && (
                          <CalendarDays className="w-3 h-3 text-primary" />
                        )}
                        {event.type === 'extra' && <DollarSign className="w-3 h-3 text-primary" />}
                        {event.type === 'document' && <FileText className="w-3 h-3 text-primary" />}
                        {event.type === 'registration' && <User className="w-3 h-3 text-primary" />}
                      </div>
                      <div className="bg-card border rounded-md p-3 shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-sm">{event.title}</span>
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {formatDate(event.date)}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">{event.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
