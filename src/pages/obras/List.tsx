import { Link } from 'react-router-dom'
import { Building2, Calendar, MapPin, Plus } from 'lucide-react'
import useAppStore from '@/stores/use-app-store'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { getStatusColor, formatDate, formatCurrency } from '@/lib/formatters'

export default function ObrasList() {
  const { obras } = useAppStore()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Obras</h1>
          <p className="text-muted-foreground">Gerencie todos os seus projetos de construção.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Nova Obra
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {obras.map((obra) => (
          <Link key={obra.id} to={`/obras/${obra.id}`}>
            <Card className="hover:shadow-md transition-all cursor-pointer h-full flex flex-col group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className={getStatusColor(obra.status)}>
                    {obra.status}
                  </Badge>
                </div>
                <CardTitle className="text-xl group-hover:text-primary transition-colors">
                  {obra.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{obra.client}</p>
              </CardHeader>
              <CardContent className="space-y-3 flex-1">
                <div className="flex items-center text-sm text-muted-foreground gap-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">{obra.address}</span>
                </div>
                <div className="flex items-center text-sm text-muted-foreground gap-2">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>{formatDate(obra.plannedEndDate)} (Previsão)</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">Progresso</span>
                    <span>{obra.progress}%</span>
                  </div>
                  <Progress value={obra.progress} className="h-2" />
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 border-t py-3">
                <div className="w-full flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Orçamento</span>
                  <span className="font-semibold">{formatCurrency(obra.budget)}</span>
                </div>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
