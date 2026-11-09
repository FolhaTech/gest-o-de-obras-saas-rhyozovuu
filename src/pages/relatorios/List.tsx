import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileText, PieChart } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'

export default function RelatoriosList() {
  const { toast } = useToast()
  const { canSeeValues } = useAuth() // relatório financeiro só para o administrador

  const handleExport = (type: string) => {
    toast({
      title: 'Download Iniciado',
      description: `O relatório "${type}" está sendo gerado e será baixado em instantes.`,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Relatórios Gerenciais</h1>
        <p className="text-muted-foreground">Extraia e analise os dados da sua operação.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {canSeeValues && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-primary mb-2">
              <PieChart className="h-5 w-5" />
            </div>
            <CardTitle>Resumo Financeiro por Obra</CardTitle>
            <CardDescription>
              Consolidado de orçamentos, custos realizados e saldo disponível.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-2" onClick={() => handleExport('Financeiro')}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </CardContent>
        </Card>
        )}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-primary mb-2">
              <FileText className="h-5 w-5" />
            </div>
            <CardTitle>Evolução Física Global</CardTitle>
            <CardDescription>
              Histórico de medições e avanço de cronograma de todos os projetos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full gap-2"
              variant="secondary"
              onClick={() => handleExport('Evolução Física')}
            >
              <Download className="h-4 w-4" /> Exportar PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
