import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import useAppStore from '@/stores/use-app-store'
import { CheckCircle2, CircleDashed, Clock } from 'lucide-react'

export default function StagesTab({ obraId }: { obraId: string }) {
  const { stages } = useAppStore()
  const obraStages = stages.filter((s) => s.obraId === obraId)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Concluída':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      case 'Em Andamento':
        return <Clock className="h-5 w-5 text-blue-500" />
      default:
        return <CircleDashed className="h-5 w-5 text-muted-foreground" />
    }
  }

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
                <p className="text-xs text-muted-foreground">Resp: {stage.responsible}</p>
              </div>
            </div>

            <div className="flex-1 w-full space-y-2">
              <div className="flex justify-between text-sm">
                <Badge variant="secondary" className="font-normal">
                  {stage.status}
                </Badge>
                <span className="font-medium">{stage.progress}%</span>
              </div>
              <Progress value={stage.progress} className="h-2" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
