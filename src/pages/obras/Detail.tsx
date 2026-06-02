import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Building } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getStatusColor, translateStatus } from '@/lib/formatters'
import { useDataFilter } from '@/hooks/use-data'
import { Obra } from '@/types'
import OverviewTab from './tabs/OverviewTab'
import StagesTab from './tabs/StagesTab'
import MaterialsTab from './tabs/MaterialsTab'

export default function ObraDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: works, loading } = useDataFilter<Obra>('works', 'id', id)
  const obra = works?.[0]

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!obra) {
    return <div className="p-8 text-center text-muted-foreground">Obra não encontrada.</div>
  }

  return (
    <div className="space-y-6 animate-slide-in-right">
      <div className="flex items-center gap-4">
        <Link to="/obras" className="p-2 hover:bg-muted rounded-full transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{obra.name}</h1>
            <Badge variant="outline" className={getStatusColor(obra.status)}>
              {translateStatus(obra.status)}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Building className="h-4 w-4" /> {obra.client}
          </p>
        </div>
      </div>

      <Tabs defaultValue="visao-geral" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-6">
          <TabsTrigger
            value="visao-geral"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Visão Geral
          </TabsTrigger>
          <TabsTrigger
            value="etapas"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Etapas do Projeto
          </TabsTrigger>
          <TabsTrigger
            value="materiais"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Materiais Alocados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-0">
          <OverviewTab obra={obra} />
        </TabsContent>
        <TabsContent value="etapas" className="mt-0">
          <StagesTab obraId={obra.id} />
        </TabsContent>
        <TabsContent value="materiais" className="mt-0">
          <MaterialsTab obraId={obra.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
