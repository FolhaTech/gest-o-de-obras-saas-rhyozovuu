import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ImagePlus, X, Loader2, Calendar as CalendarIcon } from 'lucide-react'
import { useDataFilter } from '@/hooks/use-data'
import { Diario } from '@/types'
import { formatDate } from '@/lib/formatters'
import { Skeleton } from '@/components/ui/skeleton'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Database, RefreshCw, WifiOff } from 'lucide-react'
import { isMissingTableError } from '@/hooks/use-data'

export default function NotesTab({ obraId }: { obraId: string }) {
  const { user, readOnly } = useAuth()
  const { toast } = useToast()
  const {
    data: notes,
    loading,
    isTableMissing,
    isNetworkError,
    refetch,
  } = useDataFilter<Diario>('work_diaries', 'work_id', obraId)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sortedNotes = notes
    ? [...notes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : []

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() && files.length === 0) {
      toast({ title: 'Adicione uma nota ou foto.', variant: 'destructive' })
      return
    }

    setIsSubmitting(true)

    try {
      const uploadedPhotos: string[] = []

      for (const file of files) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`
        const filePath = `${obraId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('work-photos')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        const {
          data: { publicUrl },
        } = supabase.storage.from('work-photos').getPublicUrl(filePath)

        uploadedPhotos.push(publicUrl)
      }

      const { error: insertError } = await supabase.from('work_diaries').insert({
        work_id: obraId,
        author_id: user?.id,
        date: noteDate,
        notes: description,
        photos: uploadedPhotos,
      })

      if (insertError) throw insertError

      toast({ title: 'Nota registrada com sucesso!' })
      setDescription('')
      setFiles([])
      setNoteDate(new Date().toISOString().split('T')[0])
      if (fileInputRef.current) fileInputRef.current.value = ''
      refetch()
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {isTableMissing && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <Database className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">
            Tabela do diário de obra não configurada
          </AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            A tabela <code className="font-mono">work_diaries</code> ainda não foi criada no
            Supabase. Execute o script de migração SQL para salvar notas e fotos.
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
            Não foi possível carregar as notas. Verifique sua conexão.
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

      {/* Financeiro só consulta: sem formulário de nova nota */}
      {!readOnly && (
      <Card>
        <CardHeader>
          <CardTitle>Nova Nota</CardTitle>
          <CardDescription>Registre lembretes e adicione fotos ao diário da obra.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                required
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                className="w-[200px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Lembretes / Anotações</Label>
              <Textarea
                placeholder="O que aconteceu hoje na obra?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Fotos</Label>
              <div className="flex flex-wrap gap-4 items-start">
                <Button
                  type="button"
                  variant="outline"
                  className="h-24 w-24 border-dashed flex flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Adicionar</span>
                </Button>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />

                {files.map((file, i) => (
                  <div
                    key={i}
                    className="relative h-24 w-24 rounded-md overflow-hidden border group"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt="preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 bg-black/50 hover:bg-black text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Nota'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight">Histórico de Notas</h3>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : sortedNotes.length === 0 ? (
          <div className="text-center py-10 bg-muted/20 border rounded-lg text-muted-foreground">
            <p>Nenhuma nota registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedNotes.map((note) => (
              <Card key={note.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <CalendarIcon className="h-4 w-4" />
                    {formatDate(note.date)}
                  </div>

                  {note.notes && (
                    <p className="whitespace-pre-wrap text-sm mb-4 text-foreground/90">
                      {note.notes}
                    </p>
                  )}

                  {note.photos && note.photos.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-2">
                      {note.photos.map((photo, i) => (
                        <a
                          key={i}
                          href={photo}
                          target="_blank"
                          rel="noreferrer"
                          className="block relative h-24 w-24 rounded-md overflow-hidden border hover:opacity-90 transition-opacity"
                        >
                          <img
                            src={photo}
                            alt="Foto da nota"
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
