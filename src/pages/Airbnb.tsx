import React, { useState, useEffect, useMemo } from 'react'
import { AirbnbService } from '@/lib/airbnb-service'
import { AirbnbProperty, AirbnbRental, AirbnbTransaction, Obra } from '@/types'
import { formatCurrency } from '@/lib/formatters'
import { useToast } from '@/hooks/use-toast'
import { PropertyDetailView } from './airbnb/PropertyDetailView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Lock,
  Building,
  Plus,
  LogOut,
  MapPin,
  DollarSign,
  AlertCircle,
  Home,
  ShieldAlert,
  Trash2,
  Calendar,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Scale,
  BedDouble,
  Receipt,
  Sparkles,
} from 'lucide-react'

// ============================================================================
// CREDENCIAIS DE ACESSO PRIVILEGIADO (AIRBNB)
// ATENÇÃO: Credenciais temporárias solicitadas pelo cliente.
// NÃO mexer nesta autenticação conforme regras do projeto.
// ============================================================================
export const AIRBNB_AUTH_CONFIG = {
  username: 'admin',
  password: 'admin',
}

const STORAGE_AUTH_KEY = 'gestao_obras_airbnb_session'

export type { AirbnbProperty }

export default function AirbnbPage() {
  const { toast } = useToast()

  // Sessão específica da seção Airbnb (isolada do login principal)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return (
        sessionStorage.getItem(STORAGE_AUTH_KEY) === 'true' ||
        localStorage.getItem(STORAGE_AUTH_KEY) === 'true'
      )
    } catch {
      return false
    }
  })

  // Formulário de Login Privilegiado
  const [loginUser, setLoginUser] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [rememberSession, setRememberSession] = useState(false)

  // Dados principais
  const [properties, setProperties] = useState<AirbnbProperty[]>([])
  const [rentals, setRentals] = useState<AirbnbRental[]>([])
  const [transactions, setTransactions] = useState<AirbnbTransaction[]>([])
  const [completedWorks, setCompletedWorks] = useState<Obra[]>([])

  const [loading, setLoading] = useState(false)
  const [isFallbackMode, setIsFallbackMode] = useState(false)

  // Imóvel selecionado para visão detalhada
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)

  // Modal de Adicionar Imóvel
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedWorkId, setSelectedWorkId] = useState<string>('none')
  const [newPropName, setNewPropName] = useState('')
  const [newPropAddress, setNewPropAddress] = useState('')
  const [newPropDailyRate, setNewPropDailyRate] = useState('')
  const [saving, setSaving] = useState(false)

  // Carregar todos os dados
  const loadAllData = async () => {
    setLoading(true)
    try {
      const [propsRes, rentalsRes, txsRes, works] = await Promise.all([
        AirbnbService.getProperties(),
        AirbnbService.getRentals(),
        AirbnbService.getTransactions(),
        AirbnbService.getCompletedWorks(),
      ])

      setProperties(propsRes.data)
      setRentals(rentalsRes.data)
      setTransactions(txsRes.data)
      setCompletedWorks(works)
      setIsFallbackMode(propsRes.isFallback || rentalsRes.isFallback || txsRes.isFallback)
    } catch (e) {
      console.warn('[Airbnb] Erro ao carregar dados:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadAllData()
    }
  }, [isAuthenticated])

  // Login handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)

    const trimmedUser = loginUser.trim()
    const trimmedPass = loginPassword

    if (
      trimmedUser === AIRBNB_AUTH_CONFIG.username &&
      trimmedPass === AIRBNB_AUTH_CONFIG.password
    ) {
      try {
        if (rememberSession) {
          localStorage.setItem(STORAGE_AUTH_KEY, 'true')
        } else {
          sessionStorage.setItem(STORAGE_AUTH_KEY, 'true')
        }
      } catch (err) {
        console.warn('Storage indisponível:', err)
      }
      setIsAuthenticated(true)
      setLoginUser('')
      setLoginPassword('')
      toast({
        title: 'Acesso liberado',
        description: 'Bem-vindo ao módulo Airbnb — Gestão de Imóveis.',
      })
    } else {
      setLoginError('Credenciais inválidas. Verifique usuário e senha.')
    }
  }

  // Logout handler
  const handleLogout = () => {
    try {
      sessionStorage.removeItem(STORAGE_AUTH_KEY)
      localStorage.removeItem(STORAGE_AUTH_KEY)
    } catch (err) {
      console.warn(err)
    }
    setIsAuthenticated(false)
    setSelectedPropertyId(null)
    toast({
      title: 'Sessão encerrada',
      description: 'Você saiu da seção restrita do Airbnb.',
    })
  }

  // Mudança da seleção de Obra Concluída no Modal
  const handleSelectWork = (workId: string) => {
    setSelectedWorkId(workId)
    if (workId === 'none') {
      return
    }
    const found = completedWorks.find((w) => w.id === workId)
    if (found) {
      // Auto-preencher nome e endereço
      setNewPropName(found.name)
      setNewPropAddress(found.address || 'Endereço da obra')
    }
  }

  // Criar Imóvel
  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPropName.trim()) {
      toast({
        title: 'Atenção',
        description: 'Informe o nome do imóvel.',
        variant: 'destructive',
      })
      return
    }

    const rateNumeric = parseFloat(newPropDailyRate.replace(',', '.')) || 0
    const chosenWork =
      selectedWorkId !== 'none' ? completedWorks.find((w) => w.id === selectedWorkId) : null

    setSaving(true)
    try {
      const res = await AirbnbService.saveProperty({
        work_id: chosenWork ? chosenWork.id : null,
        name: newPropName.trim(),
        address: newPropAddress.trim() || 'Endereço não informado',
        daily_rate: rateNumeric,
        status: 'ativo',
        work: chosenWork
          ? { name: chosenWork.name, address: chosenWork.address, status: chosenWork.status }
          : null,
      })

      if (res.isFallback) {
        setIsFallbackMode(true)
        toast({
          title: 'Imóvel salvo localmente',
          description: `${res.data.name} adicionado ao dispositivo (modo offline/local).`,
        })
      } else {
        toast({
          title: 'Imóvel cadastrado',
          description: `${res.data.name} salvo com sucesso no banco de dados.`,
        })
      }

      setProperties([res.data, ...properties.filter((p) => p.id !== res.data.id)])
      resetForm()
    } catch {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível cadastrar o imóvel.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProperty = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover o imóvel "${name}" e todos os seus lançamentos?`)) {
      return
    }

    try {
      await AirbnbService.deleteProperty(id)
      setProperties(properties.filter((p) => p.id !== id))
      setRentals(rentals.filter((r) => r.property_id !== id))
      setTransactions(transactions.filter((t) => t.property_id !== id))
      if (selectedPropertyId === id) {
        setSelectedPropertyId(null)
      }
      toast({
        title: 'Imóvel removido',
        description: `${name} foi excluído com sucesso.`,
      })
    } catch {
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível excluir o imóvel.',
        variant: 'destructive',
      })
    }
  }

  // Handlers de Aluguéis dentro do imóvel
  const handleAddRental = async (rentalData: Omit<AirbnbRental, 'id' | 'created_at'>) => {
    try {
      const res = await AirbnbService.saveRental(rentalData)
      setRentals([res.data, ...rentals.filter((r) => r.id !== res.data.id)])
      toast({
        title: 'Aluguel registrado',
        description: `Temporada de ${formatCurrency(res.data.total_value)} registrada e contabilizada nas receitas.`,
      })
    } catch {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível registrar o aluguel.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteRental = async (id: string) => {
    if (!confirm('Deseja excluir este aluguel? O valor sairá do cálculo de receitas.')) return
    try {
      await AirbnbService.deleteRental(id)
      setRentals(rentals.filter((r) => r.id !== id))
      toast({
        title: 'Aluguel removido',
        description: 'O registro foi removido com sucesso.',
      })
    } catch {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível remover o aluguel.',
        variant: 'destructive',
      })
    }
  }

  // Handlers de Transações dentro do imóvel
  const handleAddTransaction = async (txData: Omit<AirbnbTransaction, 'id' | 'created_at'>) => {
    try {
      const res = await AirbnbService.saveTransaction(txData)
      setTransactions([res.data, ...transactions.filter((t) => t.id !== res.data.id)])
      toast({
        title: res.data.type === 'revenue' ? 'Receita lançada' : 'Despesa lançada',
        description: `${res.data.description} (${formatCurrency(res.data.value)}) registrado.`,
      })
    } catch {
      toast({
        title: 'Erro ao salvar lançamento',
        description: 'Não foi possível salvar a movimentação.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Deseja excluir este lançamento financeiro?')) return
    try {
      await AirbnbService.deleteTransaction(id)
      setTransactions(transactions.filter((t) => t.id !== id))
      toast({
        title: 'Lançamento removido',
        description: 'A movimentação foi excluída com sucesso.',
      })
    } catch {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o lançamento.',
        variant: 'destructive',
      })
    }
  }

  const resetForm = () => {
    setSelectedWorkId('none')
    setNewPropName('')
    setNewPropAddress('')
    setNewPropDailyRate('')
    setIsDialogOpen(false)
  }

  // ==========================================
  // CÁLCULOS GERAIS PARA O DASHBOARD DO MÓDULO
  // ==========================================
  const generalMetrics = useMemo(() => {
    const totalRentalsRev = rentals.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0)
    const extraRev = transactions
      .filter((t) => t.type === 'revenue')
      .reduce((acc, t) => acc + (Number(t.value) || 0), 0)
    const totalRev = totalRentalsRev + extraRev

    const totalExp = transactions
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => acc + (Number(t.value) || 0), 0)

    const net = totalRev - totalExp
    return {
      totalRev,
      totalExp,
      net,
      rentalsCount: rentals.length,
      propertiesCount: properties.length,
    }
  }, [rentals, transactions, properties])

  // Obter métricas rápidas por imóvel (para mostrar nos cards da lista)
  const getPropertyQuickMetrics = (propId: string) => {
    const propRentals = rentals.filter((r) => r.property_id === propId)
    const propTxs = transactions.filter((t) => t.property_id === propId)

    const rentalRev = propRentals.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0)
    const extraRev = propTxs
      .filter((t) => t.type === 'revenue')
      .reduce((acc, t) => acc + (Number(t.value) || 0), 0)
    const totalRev = rentalRev + extraRev

    const totalExp = propTxs
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => acc + (Number(t.value) || 0), 0)

    const net = totalRev - totalExp
    return {
      rentalsCount: propRentals.length,
      totalRev,
      totalExp,
      net,
    }
  }

  // Se o usuário clicou em um imóvel específico, renderiza a tela de detalhes
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId)

  // ==========================================================================
  // ESTADO NÃO-AUTENTICADO: Portão de Login Privilegiado
  // ==========================================================================
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] py-8 px-4">
        <Card className="w-full max-w-md shadow-lg border-primary/20">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
              <Lock className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Airbnb — Acesso Restrito
            </CardTitle>
            <CardDescription className="text-sm">
              Esta área possui controle de acesso privilegiado. Informe seu usuário e senha para
              continuar.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {loginError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="airbnb-username">Usuário</Label>
                <Input
                  id="airbnb-username"
                  type="text"
                  placeholder="Digite seu usuário privilegiado"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="airbnb-password">Senha</Label>
                <Input
                  id="airbnb-password"
                  type="password"
                  placeholder="Digite sua senha"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  id="rememberSession"
                  checked={rememberSession}
                  onChange={(e) => setRememberSession(e.target.checked)}
                  className="rounded border-muted-foreground/30 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                />
                <label htmlFor="rememberSession" className="cursor-pointer select-none">
                  Lembrar acesso neste navegador
                </label>
              </div>

              <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground flex items-start gap-2 border">
                <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">Credenciais provisórias: </span>
                  Usuário{' '}
                  <code className="bg-background px-1 py-0.5 rounded text-foreground font-mono">
                    admin
                  </code>{' '}
                  e Senha{' '}
                  <code className="bg-background px-1 py-0.5 rounded text-foreground font-mono">
                    admin
                  </code>{' '}
                  (configuradas no topo do arquivo para fácil substituição).
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-2 flex flex-col gap-2">
              <Button type="submit" className="w-full">
                Entrar no Airbnb
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    )
  }

  // ==========================================================================
  // ESTADO AUTENTICADO: SE UM IMÓVEL ESTIVER SELECIONADO
  // ==========================================================================
  if (selectedProperty) {
    const propertyRentals = rentals.filter((r) => r.property_id === selectedProperty.id)
    const propertyTransactions = transactions.filter((t) => t.property_id === selectedProperty.id)

    return (
      <PropertyDetailView
        property={selectedProperty}
        rentals={propertyRentals}
        transactions={propertyTransactions}
        onBack={() => setSelectedPropertyId(null)}
        onAddRental={handleAddRental}
        onDeleteRental={handleDeleteRental}
        onAddTransaction={handleAddTransaction}
        onDeleteTransaction={handleDeleteTransaction}
      />
    )
  }

  // ==========================================================================
  // ESTADO AUTENTICADO: LISTA GERAL DE IMÓVEIS
  // ==========================================================================
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Airbnb — Gestão de Imóveis
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              Acesso Privilegiado
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Gerenciamento completo de aluguéis por temporada, despesas e receitas de imóveis
            concluídos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Adicionar Imóvel</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleLogout}
            className="flex items-center gap-2 text-muted-foreground hover:text-destructive"
            title="Encerrar sessão privilegiada"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </Button>
        </div>
      </div>

      {/* Alerta de fallback local se a tabela Supabase não existir */}
      {isFallbackMode && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-3 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Armazenamento local ativo: seus imóveis, aluguéis e transações estão sincronizados no
              navegador. Para persistência centralizada definitiva, execute a migração SQL no SQL
              Editor do Supabase.
            </span>
          </div>
        </div>
      )}

      {/* Resumo Global da Carteira de Imóveis Airbnb */}
      {properties.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="relative overflow-hidden border-border/60 hover:shadow-sm">
            <div className="h-1 bg-primary w-full" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Imóveis Ativos
              </CardTitle>
              <div className="p-2 rounded-md bg-primary/10 text-primary">
                <Home className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {generalMetrics.propertiesCount}{' '}
                {generalMetrics.propertiesCount === 1 ? 'imóvel' : 'imóveis'}
              </div>
              <p className="text-xs text-muted-foreground">
                {generalMetrics.rentalsCount} aluguéis realizados no total
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/60 hover:shadow-sm">
            <div className="h-1 bg-emerald-500 w-full" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Receita Total
              </CardTitle>
              <div className="p-2 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatCurrency(generalMetrics.totalRev)}
              </div>
              <p className="text-xs text-muted-foreground">Aluguéis + receitas extras</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/60 hover:shadow-sm">
            <div className="h-1 bg-red-500 w-full" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Despesas Totais
              </CardTitle>
              <div className="p-2 rounded-md bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                <TrendingDown className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">
                {formatCurrency(generalMetrics.totalExp)}
              </div>
              <p className="text-xs text-muted-foreground">Custos de limpeza e manutenção</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/60 hover:shadow-sm">
            <div
              className={`h-1 w-full ${generalMetrics.net >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
            />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resultado Líquido
              </CardTitle>
              <div className="p-2 rounded-md bg-muted/60 text-primary">
                <Scale className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div
                className={`text-2xl font-bold tracking-tight ${
                  generalMetrics.net >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {generalMetrics.net >= 0 ? '+' : ''}
                {formatCurrency(generalMetrics.net)}
              </div>
              <p className="text-xs text-muted-foreground">
                {generalMetrics.net >= 0 ? 'Lucro total acumulado' : 'Déficit acumulado'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Conteúdo Principal */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Carregando imóveis...</div>
      ) : properties.length === 0 ? (
        /* Estado Vazio Amigável */
        <Card className="border-dashed border-2 py-12 px-6 text-center">
          <CardContent className="space-y-4 max-w-md mx-auto">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Home className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Nenhum imóvel cadastrado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Você ainda não adicionou nenhum imóvel de temporada. É possível vincular uma obra
                concluída ou cadastrar manualmente.
              </p>
            </div>
            <Button
              onClick={() => setIsDialogOpen(true)}
              className="inline-flex items-center gap-2 mt-2"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar Imóvel</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Grid de Imóveis com Indicadores Financeiros e Botão para Detalhes */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((prop) => {
            const metrics = getPropertyQuickMetrics(prop.id)
            return (
              <Card
                key={prop.id}
                className="hover:shadow-md transition-shadow relative overflow-hidden group border-border/80 flex flex-col justify-between"
              >
                <div>
                  <div className="h-2 bg-primary/80 w-full" />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 overflow-hidden">
                        <CardTitle
                          className="text-lg font-semibold text-foreground truncate"
                          title={prop.name}
                        >
                          {prop.name}
                        </CardTitle>
                        {prop.work && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Obra: {prop.work.name}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteProperty(prop.id, prop.name)
                        }}
                        title="Excluir imóvel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate" title={prop.address}>
                        {prop.address}
                      </span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 pb-2">
                    {/* Diária estimada */}
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Diária base:</span>
                      </div>
                      <span className="text-sm font-bold text-foreground">
                        {formatCurrency(prop.daily_rate || 0)}
                      </span>
                    </div>

                    {/* Resumo Financeiro Compacto do Imóvel */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs p-2 rounded-lg bg-muted/20 border">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase block font-medium">
                          Aluguéis
                        </span>
                        <span className="font-semibold text-foreground flex items-center justify-center gap-1">
                          <BedDouble className="h-3 w-3 text-primary" />
                          {metrics.rentalsCount}
                        </span>
                      </div>
                      <div className="space-y-0.5 border-x">
                        <span className="text-[10px] text-muted-foreground uppercase block font-medium">
                          Receitas
                        </span>
                        <span className="font-semibold text-emerald-600">
                          {formatCurrency(metrics.totalRev)}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase block font-medium">
                          Saldo Líquido
                        </span>
                        <span
                          className={`font-semibold ${
                            metrics.net >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(metrics.net)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </div>

                <CardFooter className="pt-2 pb-4">
                  <Button
                    onClick={() => setSelectedPropertyId(prop.id)}
                    className="w-full flex items-center justify-center gap-2 group-hover:bg-primary"
                    variant="outline"
                  >
                    <span>Gerenciar Aluguéis & Contas</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal para Adicionar Imóvel (com vínculo de obra concluída ou manual) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleCreateProperty}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                <DialogTitle>Adicionar Imóvel de Temporada</DialogTitle>
              </div>
              <DialogDescription>
                Você pode importar os dados de uma obra concluída ou preencher manualmente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Seleção de Obra Concluída */}
              <div className="space-y-1.5 p-3 rounded-lg bg-muted/40 border border-primary/20">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="select-work"
                    className="text-xs font-semibold text-primary flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Vincular Obra Concluída (opcional)
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {completedWorks.length}{' '}
                    {completedWorks.length === 1 ? 'concluída' : 'concluídas'}
                  </span>
                </div>
                <Select value={selectedWorkId} onValueChange={handleSelectWork}>
                  <SelectTrigger id="select-work" className="bg-background">
                    <SelectValue placeholder="Selecione uma obra concluída..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma obra (cadastro manual)</SelectItem>
                    {completedWorks.map((work) => (
                      <SelectItem key={work.id} value={work.id}>
                        {work.name} {work.client ? `(${work.client})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Ao escolher uma obra concluída, o nome e o endereço serão preenchidos
                  automaticamente.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prop-name">Nome do Imóvel *</Label>
                <Input
                  id="prop-name"
                  placeholder="Ex: Loft Beira-Mar Barra da Tijuca"
                  value={newPropName}
                  onChange={(e) => setNewPropName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prop-address">Endereço Completo</Label>
                <Input
                  id="prop-address"
                  placeholder="Ex: Av. Lúcio Costa, 1500 - Ap 402"
                  value={newPropAddress}
                  onChange={(e) => setNewPropAddress(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prop-rate">Valor Base da Diária (R$)</Label>
                <Input
                  id="prop-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ex: 350,00"
                  value={newPropDailyRate}
                  onChange={(e) => setNewPropDailyRate(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar Imóvel'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
