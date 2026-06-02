import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, CircleDashed, Clock } from 'lucide-react'
import { useDataFilter } from '@/hooks/use-data'
import { Stage } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { translateStatus } from '@/lib/formatters'

export default function StagesTab({ obraId }: { obraId: string }) {
  const { data: obraStages, loading } = useDataFilter<Stage>('work_stages', 'work_id', obraId)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500" />
      default:
        return <CircleDashed className="h-5 w-5 text-muted-foreground" />
    }
  }

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )

  if (obraStages.length === 0) {
    return <p className="text-muted-foreground p-4">Nenhuma etapa cadastrada.</p>
  }

  return (
    <div className="space-y-4">
      {obraStages.map((stage) => (
        <Card key={stage.id} className="overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 md:p-6">
            <div className="flex items-center gap-3 w-full sm:w-1/3">
              {getStatusIcon(stage.status)}
              <div>
                <h4 className="font-medium text-base">{stage.name}</h4>
                <p className="text-xs text-muted-foreground">Resp: {stage.manager || '-'}</p>
              </div>
            </div>
            <div className="flex-1 w-full space-y-2">
              <div className="flex justify-between text-sm">
                <Badge variant="secondary" className="font-normal">
                  {translateStatus(stage.status)}
                </Badge>
                <span className="font-medium">{stage.progress_percentage}%</span>
              </div>
              <Progress value={stage.progress_percentage} className="h-2" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
