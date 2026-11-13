import { Link } from 'react-router-dom'
import { ShieldAlert, CalendarDays, Briefcase, BookOpen, Package, Wallet, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { getRoleLabel } from '@/lib/roles'

export default function AccessDenied() {
  const { role } = useAuth()
  const roleLabel = getRoleLabel(role)
  const isFinanceiro = role === 'financeiro'

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg border-amber-200/60 dark:border-amber-900/40">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Acesso Restrito</CardTitle>
          <CardDescription className="text-base mt-1">
            Seu perfil atual (<span className="font-semibold text-foreground">{roleLabel}</span>)
            não possui permissão para acessar esta área do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4 text-center">
          {isFinanceiro ? (
            <div className="rounded-lg bg-muted/60 p-4 text-left text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Como financeiro, suas seções autorizadas são:</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li>
                  <strong className="text-foreground">Financeiro:</strong> Compras (cotações, compra,
                  pagamento e recebimento) e Pagamento da Equipe
                </li>
                <li>
                  <strong className="text-foreground">Consulta, com valores:</strong> Dashboard, Obras,
                  Despesas, Equipes, Materiais e Relatórios
                </li>
              </ul>
            </div>
          ) : (
          <div className="rounded-lg bg-muted/60 p-4 text-left text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">
              Como prestador, suas seções autorizadas são:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                <strong className="text-foreground">Planner:</strong> Gestão e acompanhamento de
                tarefas
              </li>
              <li>
                <strong className="text-foreground">Obras:</strong> Acompanhamento e detalhes de
                projetos
              </li>
              <li>
                <strong className="text-foreground">Materiais:</strong> Consulta e acompanhamento de
                estoque e insumos
              </li>
              <li>
                <strong className="text-foreground">Diário de Obra:</strong> Relatórios diários de
                obras (RDO)
              </li>
            </ul>
          </div>
          )}
          <p className="text-xs text-muted-foreground">
            Se você necessita de permissão para visualizar finanças, equipes, relatórios ou
            configurações, solicite ao Administrador ou Gestor do sistema.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center pt-2">
          {isFinanceiro ? (
            <>
              <Button asChild variant="default" className="w-full sm:w-auto gap-2">
                <Link to="/faturamento">
                  <Wallet className="h-4 w-4" /> Ir para Financeiro
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
                <Link to="/">
                  <Home className="h-4 w-4" /> Ir para o Dashboard
                </Link>
              </Button>
            </>
          ) : (
          <>
          <Button asChild variant="default" className="w-full sm:w-auto gap-2">
            <Link to="/planner">
              <CalendarDays className="h-4 w-4" /> Ir para Planner
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
            <Link to="/obras">
              <Briefcase className="h-4 w-4" /> Ir para Obras
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
            <Link to="/materiais">
              <Package className="h-4 w-4" /> Ir para Materiais
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full sm:w-auto gap-2">
            <Link to="/diario-obra">
              <BookOpen className="h-4 w-4" /> Diário de Obra
            </Link>
          </Button>
          </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
