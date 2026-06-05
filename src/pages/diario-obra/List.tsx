import { useState } from 'react'
import { Plus, CloudSun, Users, AlertCircle, Trash, Edit, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/formatters'
import { useData } from '@/hooks/use-data'
import { Diario, Obra } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

export default function DiarioObraList() {
  const { data: diarios, loading, refetch } = useData<Diario>('work_diaries', '*, works(name)')
  const { data: works } = useData<Obra>('works', 'id, name')
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  const [formData, setFormData] = useState({
    work_id: '',
    date: new Date().toISOString().split('T')[0],
    weather: 'Ensolarado',
    workers_count: 0,
    occurrences: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState({
    work_id: '',
    date: '',
    weather: 'Ensolarado',
    workers_count: 0,
    occurrences: '',
  })
  const [existingPhotos, setExistingPhotos] = useState<string[]>([])

  const uploadPhotos = async (photoFiles: File[]) => {
    const urls = []
    for (const file of photoFiles) {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
      const { data } = await supabase.storage.from('work-diary-photos').upload(fileName, file)
      if (data) {
        const { data: urlData } = supabase.storage.from('work-diary-photos').getPublicUrl(fileName)
        urls.push(urlData.publicUrl)
      }
    }
    return urls
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.work_id) {
      toast({ title: 'Erro', description: 'Selecione uma obra.', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const photoUrls = await uploadPhotos(files)
      const { error } = await supabase.from('work_diaries').insert({
        work_id: formData.work_id,
        date: formData.date,
        weather: formData.weather,
        workers_count: formData.workers_count,
        occurrences: formData.occurrences,
        photos: photoUrls.length > 0 ? photoUrls : null,
      })

      if (!error) {
        toast({ title: 'Registro salvo com sucesso!' })
        setOpen(false)
        setFormData({
          work_id: '',
          date: new Date().toISOString().split('T')[0],
          weather: 'Ensolarado',
          workers_count: 0,
          occurrences: '',
        })
        setFiles([])
        refetch()
      } else {
        throw error
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const openEdit = (d: Diario) => {
    setEditId(d.id)
    setEditData({
      work_id: d.work_id,
      date: d.date,
      weather: d.weather || 'Ensolarado',
      workers_count: d.workers_count || 0,
      occurrences: d.occurrences || '',
    })
    setExistingPhotos(d.photos || [])
    setFiles([])
    setEditOpen(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId || !editData.work_id) return
    setUploading(true)
    try {
      const newUrls = await uploadPhotos(files)
      const finalPhotos = [...existingPhotos, ...newUrls]

      const { error } = await supabase
        .from('work_diaries')
        .update({
          work_id: editData.work_id,
          date: editData.date,
          weather: editData.weather,
          workers_count: editData.workers_count,
          occurrences: editData.occurrences,
          photos: finalPhotos.length > 0 ? finalPhotos : null,
        })
        .eq('id', editId)

      if (!error) {
        toast({ title: 'Registro atualizado!' })
        setEditOpen(false)
        refetch()
      } else {
        throw error
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este registro?')) return
    await supabase.from('work_diaries').delete().eq('id', id)
    refetch()
  }

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Diário de Obra</h1>
          <p className="text-muted-foreground">
            Acompanhamento diário das atividades e ocorrências.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Novo Registro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Diário de Obra</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4 px-1">
              <div className="space-y-2">
                <Label>Obra</Label>
                <Select
                  value={formData.work_id}
                  onValueChange={(val) => setFormData({ ...formData, work_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a obra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {works?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <Label>Trabalhadores</Label>
                  <Input
                    type="number"
                    required
                    min="0"
                    value={formData.workers_count}
                    onChange={(e) =>
                      setFormData({ ...formData, workers_count: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Clima</Label>
                <Select
                  value={formData.weather}
                  onValueChange={(val) => setFormData({ ...formData, weather: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ensolarado">Ensolarado</SelectItem>
                    <SelectItem value="Nublado">Nublado</SelectItem>
                    <SelectItem value="Chuvoso">Chuvoso</SelectItem>
                    <SelectItem value="Tempestade">Tempestade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Atividades e Ocorrências</Label>
                <Textarea
                  rows={3}
                  value={formData.occurrences}
                  onChange={(e) => setFormData({ ...formData, occurrences: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fotos</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                  </>
                ) : (
                  'Salvar Diário'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {diarios.length === 0 && <p className="text-muted-foreground">Nenhum diário registrado.</p>}
        {diarios.map((diario) => (
          <Card key={diario.id} className="overflow-hidden">
            <CardHeader className="bg-muted/30 border-b py-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  {formatDate(diario.date)}
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({diario.works?.name || 'Geral'})
                  </span>
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(diario)}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(diario.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-wrap gap-6 mb-6">
                <div className="flex items-center gap-2 text-sm">
                  <CloudSun className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Clima:</span> {diario.weather || '-'}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Efetivo:</span> {diario.workers_count || 0}{' '}
                  trabalhadores
                </div>
              </div>
              <div className="mb-6">
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-primary" /> Ocorrências e Atividades
                </h4>
                <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border">
                  {diario.occurrences || 'Nenhuma ocorrência relatada.'}
                </p>
              </div>
              {diario.photos && diario.photos.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3">Galeria de Fotos</h4>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {diario.photos.map((url, i) => (
                      <div
                        key={i}
                        className="relative aspect-square w-24 h-24 flex-shrink-0 rounded-md overflow-hidden border border-border group"
                      >
                        <img
                          src={url}
                          alt={`Foto ${i}`}
                          className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Diário de Obra</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-4 px-1">
            <div className="space-y-2">
              <Label>Obra</Label>
              <Select
                value={editData.work_id}
                onValueChange={(val) => setEditData({ ...editData, work_id: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {works?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Label>Trabalhadores</Label>
                <Input
                  type="number"
                  required
                  min="0"
                  value={editData.workers_count}
                  onChange={(e) =>
                    setEditData({ ...editData, workers_count: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Clima</Label>
              <Select
                value={editData.weather}
                onValueChange={(val) => setEditData({ ...editData, weather: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ensolarado">Ensolarado</SelectItem>
                  <SelectItem value="Nublado">Nublado</SelectItem>
                  <SelectItem value="Chuvoso">Chuvoso</SelectItem>
                  <SelectItem value="Tempestade">Tempestade</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Atividades e Ocorrências</Label>
              <Textarea
                rows={3}
                value={editData.occurrences}
                onChange={(e) => setEditData({ ...editData, occurrences: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Adicionar Fotos (opcional)</Label>
              <Input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
              {existingPhotos.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {existingPhotos.length} foto(s) já existente(s) serão mantidas.
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Atualizando...
                </>
              ) : (
                'Atualizar Diário'
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
