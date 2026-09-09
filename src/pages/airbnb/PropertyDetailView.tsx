import React, { useState } from 'react'
import { AirbnbProperty, AirbnbRental, AirbnbTransaction } from '@/types'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  ArrowLeft,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Scale,
  Plus,
  Trash2,
  MapPin,
  Building,
  CheckCircle2,
  CalendarDays,
  FileText,
  BedDouble,
  Receipt,
  Wallet,
} from 'lucide-react'

interface PropertyDetailViewProps {
  property: AirbnbProperty
  rentals: AirbnbRental[]
  transactions: AirbnbTransaction[]
  onBack: () => void
  onAddRental: (rental: Omit<AirbnbRental, 'id' | 'created_at'>) => Promise<void>
  onDeleteRental: (id: string) => Promise<void>
  onAddTransaction: (tx: Omit<AirbnbTransaction, 'id' | 'created_at'>) => Promise<void>
  onDeleteTransaction: (id: string) => Promise<void>
}

export function PropertyDetailView({
  property,
  rentals,
  transactions,
  onBack,
  onAddRental,
  onDeleteRental,
  onAddTransaction,
  onDeleteTransaction,
}: PropertyDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'rentals' | 'transactions'>('overview')

  // Modais
  const [isRentalModalOpen, setIsRentalModalOpen] = useState(false)
  const [isTxModalOpen, setIsTxModalOpen] = useState(false)

  // Form de Novo Aluguel
  const [guestName, setGuestName] = useState('')
  const [guestsCount, setGuestsCount] = useState('2')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [rentalTotalValue, setRentalTotalValue] = useState('')
  const [rentalNotes, setRentalNotes] = useState('')
  const [savingRental, setSavingRental] = useState(false)

  // Form de Nova Transação (Receita / Despesa)
  const [txType, setTxType] = useState<'revenue' | 'expense'>('expense')
  const [txCategory, setTxCategory] = useState('Limpeza')
  const [txDescription, setTxDescription] = useState('')
  const [txValue, setTxValue] = useState('')
  const [txDate, setTxDate] = useState(() => new Date().toISOString().split('T')[0])
  const [savingTx, setSavingTx] = useState(false)

  // ==========================================
  // CÁLCULOS FINANCEIROS DO IMÓVEL
  // Regra do item 3: O valor do aluguel registrado no item 2 deve
  // automaticamente contar como receita do imóvel (sem duplicar).
  // ==========================================
  const rentalTotalRevenue = rentals.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0)
  const extraRevenue = transactions
    .filter((t) => t.type === 'revenue')
    .reduce((acc, t) => acc + (Number(t.value) || 0), 0)
  const totalRevenue = rentalTotalRevenue + extraRevenue

  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + (Number(t.value) || 0), 0)

  const netBalance = totalRevenue - totalExpense
  const totalRentalsCount = rentals.length

  // Média de valor por aluguel
  const avgRentalValue = totalRentalsCount > 0 ? rentalTotalRevenue / totalRentalsCount : 0

  // Cálculo de total de hóspedes atendidos
  const totalGuestsCount = rentals.reduce((acc, r) => acc + (Number(r.guests_count) || 0), 0)

  // Submissão de Aluguel
  const handleSaveRental = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkIn || !checkOut) return

    const valNumeric = parseFloat(rentalTotalValue.replace(',', '.')) || 0
    const countNumeric = parseInt(guestsCount, 10) || 1

    setSavingRental(true)
    try {
      await onAddRental({
        property_id: property.id,
        guest_name: guestName.trim() || null,
        guests_count: countNumeric,
        check_in: checkIn,
        check_out: checkOut,
        total_value: valNumeric,
        notes: rentalNotes.trim() || null,
      })
      // Reset
      setGuestName('')
      setGuestsCount('2')
      setCheckIn('')
      setCheckOut('')
      setRentalTotalValue('')
      setRentalNotes('')
      setIsRentalModalOpen(false)
    } finally {
      setSavingRental(false)
    }
  }

  // Preenchimento estimado de valor do aluguel ao mudar checkin/checkout se diária existir
  const handleDatesChange = (newIn: string, newOut: string) => {
    if (newIn && newOut && property.daily_rate > 0) {
      const d1 = new Date(newIn)
      const d2 = new Date(newOut)
      const diffTime = d2.getTime() - d1.getTime()
      const diffDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)))
      if (diffDays > 0 && !rentalTotalValue) {
        setRentalTotalValue((diffDays * property.daily_rate).toFixed(2))
      }
    }
  }

  // Submissão de Transação
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!txDescription.trim()) return

    const valNumeric = parseFloat(txValue.replace(',', '.')) || 0
    setSavingTx(true)
    try {
      await onAddTransaction({
        property_id: property.id,
        type: txType,
        category: txCategory,
        description: txDescription.trim(),
        value: valNumeric,
        date: txDate,
      })
      setTxDescription('')
      setTxValue('')
      setIsTxModalOpen(false)
    } finally {
      setSavingTx(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Topo / Voltar e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            className="h-9 w-9 shrink-0"
            title="Voltar para lista de imóveis"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground truncate max-w-xl">
                {property.name}
              </h1>
              {property.work && (
                <Badge
                  variant="outline"
                  className="text-xs bg-emerald-50 text-emerald-800 border-emerald-200"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
                  Obra vinculada: {property.work.name}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{property.address}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setIsRentalModalOpen(true)}
            className="flex items-center gap-2 shadow-sm bg-primary hover:bg-primary/90"
          >
            <BedDouble className="h-4 w-4" />
            <span>Registrar Aluguel</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setTxType('expense')
              setTxCategory('Limpeza')
              setIsTxModalOpen(true)
            }}
            className="flex items-center gap-2"
          >
            <Receipt className="h-4 w-4" />
            <span>Lançar Despesa / Receita</span>
          </Button>
        </div>
      </div>

      {/* Cards de Resumo Financeiro (Item 4 dos Requisitos - padrão financial/) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Receitas Totais */}
        <Card className="relative overflow-hidden border-border/60 hover:shadow-sm transition-shadow">
          <div className="h-1 bg-emerald-500 w-full" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total de Receitas
            </CardTitle>
            <div className="p-2 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(rentalTotalRevenue)} de aluguéis
              {extraRevenue > 0 && ` + ${formatCurrency(extraRevenue)} adicionais`}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Despesas Totais */}
        <Card className="relative overflow-hidden border-border/60 hover:shadow-sm transition-shadow">
          <div className="h-1 bg-red-500 w-full" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total de Despesas
            </CardTitle>
            <div className="p-2 rounded-md bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">
              {formatCurrency(totalExpense)}
            </div>
            <p className="text-xs text-muted-foreground">
              {transactions.filter((t) => t.type === 'expense').length} despesas lançadas
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Saldo Líquido */}
        <Card className="relative overflow-hidden border-border/60 hover:shadow-sm transition-shadow">
          <div
            className={`h-1 w-full ${
              netBalance > 0 ? 'bg-emerald-500' : netBalance < 0 ? 'bg-red-500' : 'bg-slate-400'
            }`}
          />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Saldo Líquido
            </CardTitle>
            <div className="p-2 rounded-md bg-muted/60 text-primary">
              <Scale className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div
              className={`text-2xl font-bold tracking-tight ${
                netBalance > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : netBalance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-foreground'
              }`}
            >
              {netBalance >= 0 ? '+' : ''}
              {formatCurrency(netBalance)}
            </div>
            <p className="text-xs text-muted-foreground">
              {netBalance >= 0 ? 'Lucro operacional do imóvel' : 'Déficit operacional'}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Aluguéis / Ocupação */}
        <Card className="relative overflow-hidden border-border/60 hover:shadow-sm transition-shadow">
          <div className="h-1 bg-primary w-full" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total de Aluguéis
            </CardTitle>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <BedDouble className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {totalRentalsCount} {totalRentalsCount === 1 ? 'temporada' : 'temporadas'}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalGuestsCount} hóspedes atendidos | Méd. {formatCurrency(avgRentalValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Navegação por Abas: Visão Geral / Aluguéis / Lançamentos */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'overview' | 'rentals' | 'transactions')}
        className="w-full space-y-4"
      >
        <TabsList className="grid w-full sm:w-auto grid-cols-3 max-w-md">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="rentals">Aluguéis ({rentals.length})</TabsTrigger>
          <TabsTrigger value="transactions">
            Despesas & Receitas ({transactions.length})
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: VISÃO GERAL */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Informações do Imóvel */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" />
                  Dados do Imóvel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Diária base:</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(property.daily_rate || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge
                    variant="outline"
                    className="capitalize bg-emerald-50 text-emerald-800 border-emerald-200"
                  >
                    {property.status || 'ativo'}
                  </Badge>
                </div>
                {property.work && (
                  <div className="py-1.5 border-b space-y-1">
                    <span className="text-xs text-muted-foreground">Obra de Origem:</span>
                    <p className="font-medium text-foreground">{property.work.name}</p>
                    <p className="text-xs text-muted-foreground">{property.work.address}</p>
                  </div>
                )}
                {property.created_at && (
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Cadastrado em:</span>
                    <span className="text-foreground">{formatDate(property.created_at)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Últimos Aluguéis e Lançamentos Recentes */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-primary" />
                      Últimos Aluguéis Registrados
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Temporadas mais recentes deste imóvel
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('rentals')}
                    className="text-xs"
                  >
                    Ver todos ({rentals.length})
                  </Button>
                </CardHeader>
                <CardContent>
                  {rentals.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum aluguel registrado ainda.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rentals.slice(0, 3).map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
                        >
                          <div className="space-y-0.5">
                            <div className="font-semibold text-sm text-foreground">
                              {r.guest_name || 'Hóspede não identificado'}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-3">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(r.check_in)} a {formatDate(r.check_out)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {r.guests_count} {r.guests_count === 1 ? 'hóspede' : 'hóspedes'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right font-bold text-emerald-600 text-sm">
                            {formatCurrency(r.total_value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-primary" />
                      Últimas Despesas e Receitas
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Movimentações financeiras avulsas
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('transactions')}
                    className="text-xs"
                  >
                    Ver todas ({transactions.length})
                  </Button>
                </CardHeader>
                <CardContent>
                  {transactions.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Nenhuma transação lançada ainda.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {transactions.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
                        >
                          <div className="space-y-0.5">
                            <div className="font-medium text-sm text-foreground flex items-center gap-2">
                              <span>{t.description}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {t.category}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(t.date)}
                            </div>
                          </div>
                          <div
                            className={`font-semibold text-sm ${
                              t.type === 'revenue' ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {t.type === 'revenue' ? '+' : '-'} {formatCurrency(t.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ABA 2: LISTAGEM DE ALUGUÉIS */}
        <TabsContent value="rentals" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Histórico de Aluguéis</h3>
              <p className="text-xs text-muted-foreground">
                Todas as reservas registradas neste imóvel.
              </p>
            </div>
            <Button
              onClick={() => setIsRentalModalOpen(true)}
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Aluguel</span>
            </Button>
          </div>

          {rentals.length === 0 ? (
            <Card className="border-dashed py-12 text-center">
              <CardContent className="space-y-3">
                <BedDouble className="h-10 w-10 mx-auto text-muted-foreground/60" />
                <h4 className="text-base font-medium">Nenhum aluguel registrado</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Registre as temporadas alugadas informando hóspedes, datas e valor total.
                </p>
                <Button onClick={() => setIsRentalModalOpen(true)} size="sm">
                  Registrar Primeiro Aluguel
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rentals.map((r) => (
                <Card key={r.id} className="relative group border-border/80 hover:shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-semibold text-foreground">
                          {r.guest_name || 'Hóspede não informado'}
                        </CardTitle>
                        <CardDescription className="text-xs flex items-center gap-1.5 mt-1">
                          <CalendarDays className="h-3.5 w-3.5 text-primary" />
                          <span>
                            {formatDate(r.check_in)} até {formatDate(r.check_out)}
                          </span>
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDeleteRental(r.id)}
                        title="Excluir aluguel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/40 border">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="h-4 w-4 text-primary" />
                        <span>Hóspedes:</span>
                        <strong className="text-foreground">{r.guests_count}</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground block">Valor Total</span>
                        <span className="text-base font-bold text-emerald-600">
                          {formatCurrency(r.total_value)}
                        </span>
                      </div>
                    </div>

                    {r.notes && (
                      <p className="text-xs text-muted-foreground bg-muted/20 p-2 rounded border">
                        {r.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ABA 3: DESPESAS E RECEITAS */}
        <TabsContent value="transactions" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Despesas & Receitas</h3>
              <p className="text-xs text-muted-foreground">
                Limpeza, taxas, condomínio, manutenção e outras receitas/despesas do imóvel.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTxType('revenue')
                  setTxCategory('Taxa Extra')
                  setIsTxModalOpen(true)
                }}
                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Receita Avulsa
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTxType('expense')
                  setTxCategory('Limpeza')
                  setIsTxModalOpen(true)
                }}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Despesa
              </Button>
            </div>
          </div>

          {transactions.length === 0 ? (
            <Card className="border-dashed py-12 text-center">
              <CardContent className="space-y-3">
                <Receipt className="h-10 w-10 mx-auto text-muted-foreground/60" />
                <h4 className="text-base font-medium">Nenhum lançamento financeiro</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Lance custos operacionais como faxina, manutenção, energia, ou receitas
                  adicionais.
                </p>
                <div className="flex justify-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTxType('expense')
                      setTxCategory('Limpeza')
                      setIsTxModalOpen(true)
                    }}
                  >
                    Lançar Despesa
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3.5 rounded-lg border bg-card hover:bg-muted/10 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-md ${
                        tx.type === 'revenue'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                      }`}
                    >
                      {tx.type === 'revenue' ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                        <span>{tx.description}</span>
                        <Badge variant="outline" className="text-[10px] font-normal px-2 py-0">
                          {tx.category}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(tx.date)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-base font-bold ${
                        tx.type === 'revenue'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {tx.type === 'revenue' ? '+' : '-'} {formatCurrency(tx.value)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onDeleteTransaction(tx.id)}
                      title="Excluir lançamento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* MODAL: REGISTRAR ALUGUEL */}
      <Dialog open={isRentalModalOpen} onOpenChange={setIsRentalModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSaveRental}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <BedDouble className="h-5 w-5 text-primary" />
                <DialogTitle>Registrar Aluguel de Temporada</DialogTitle>
              </div>
              <DialogDescription>
                Informe os detalhes do aluguel. O valor total contará automaticamente como receita
                deste imóvel.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="guest-name">Nome do Hóspede (opcional)</Label>
                <Input
                  id="guest-name"
                  placeholder="Ex: Carlos Eduardo ou Airbnb Guest #4928"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="checkin">Check-in *</Label>
                  <Input
                    id="checkin"
                    type="date"
                    value={checkIn}
                    onChange={(e) => {
                      setCheckIn(e.target.value)
                      handleDatesChange(e.target.value, checkOut)
                    }}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkout">Check-out *</Label>
                  <Input
                    id="checkout"
                    type="date"
                    value={checkOut}
                    onChange={(e) => {
                      setCheckOut(e.target.value)
                      handleDatesChange(checkIn, e.target.value)
                    }}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="guests-count">Qtd. Hóspedes *</Label>
                  <Input
                    id="guests-count"
                    type="number"
                    min="1"
                    value={guestsCount}
                    onChange={(e) => setGuestsCount(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rental-value">Valor Total (R$) *</Label>
                  <Input
                    id="rental-value"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 1400,00"
                    value={rentalTotalValue}
                    onChange={(e) => setRentalTotalValue(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rental-notes">Observações adicionais</Label>
                <Input
                  id="rental-notes"
                  placeholder="Ex: Reserva pelo Airbnb, taxa de limpeza incluída"
                  value={rentalNotes}
                  onChange={(e) => setRentalNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRentalModalOpen(false)}
                disabled={savingRental}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingRental}>
                {savingRental ? 'Salvando...' : 'Salvar Aluguel'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: LANÇAR RECEITA OU DESPESA */}
      <Dialog open={isTxModalOpen} onOpenChange={setIsTxModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleSaveTransaction}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <DialogTitle>
                  {txType === 'expense' ? 'Lançar Despesa do Imóvel' : 'Lançar Receita do Imóvel'}
                </DialogTitle>
              </div>
              <DialogDescription>
                Registre custos operacionais ou receitas adicionais envolvendo este imóvel.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label>Tipo de Lançamento</Label>
                <Select
                  value={txType}
                  onValueChange={(val) => {
                    const t = val as 'revenue' | 'expense'
                    setTxType(t)
                    setTxCategory(t === 'expense' ? 'Limpeza' : 'Taxa de Limpeza')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Despesa (Saída)</SelectItem>
                    <SelectItem value="revenue">Receita (Entrada)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={txCategory} onValueChange={setTxCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {txType === 'expense' ? (
                      <>
                        <SelectItem value="Limpeza">Limpeza / Faxina</SelectItem>
                        <SelectItem value="Manutenção">Manutenção / Reparo</SelectItem>
                        <SelectItem value="Condomínio">Condomínio</SelectItem>
                        <SelectItem value="Energia/Água/Internet">
                          Energia / Água / Internet
                        </SelectItem>
                        <SelectItem value="Lavanderia">Lavanderia / Enxoval</SelectItem>
                        <SelectItem value="Outros">Outros</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="Taxa de Limpeza">Taxa de Limpeza</SelectItem>
                        <SelectItem value="Aluguel">Aluguel Extra / Diária Adicional</SelectItem>
                        <SelectItem value="Ressarcimento">Ressarcimento / Danos</SelectItem>
                        <SelectItem value="Outros">Outras Receitas</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tx-desc">Descrição *</Label>
                <Input
                  id="tx-desc"
                  placeholder={
                    txType === 'expense'
                      ? 'Ex: Faxina completa pós-checkout'
                      : 'Ex: Taxa extra de hóspede adicional'
                  }
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-val">Valor (R$) *</Label>
                  <Input
                    id="tx-val"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 180,00"
                    value={txValue}
                    onChange={(e) => setTxValue(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tx-date">Data *</Label>
                  <Input
                    id="tx-date"
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTxModalOpen(false)}
                disabled={savingTx}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingTx}>
                {savingTx ? 'Salvando...' : 'Salvar Lançamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
