import { Plus, CloudSun, Users, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/formatters'
import { useData } from '@/hooks/use-data'
import { Diario } from '@/types'

export default function DiarioObraList() {
  const { data: diarios, loading } = useData<Diario>('work_diaries', '*, works(name)')

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
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Novo Registro
        </Button>
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
    </div>
  )
}
