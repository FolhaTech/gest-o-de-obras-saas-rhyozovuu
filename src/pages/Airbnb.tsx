import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { isMissingTableError, formatCurrency } from '@/lib/formatters'
import { useToast } from '@/hooks/use-toast'
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
} from 'lucide-react'

// ============================================================================
// CREDENCIAIS DE ACESSO PRIVILEGIADO (AIRBNB)
// ATENÇÃO: Credenciais temporárias solicitadas pelo cliente.
// Altere estas constantes quando quiser definir novos dados de acesso.
// ============================================================================
export const AIRBNB_AUTH_CONFIG = {
  username: 'admin',
  password: 'admin',
}

const STORAGE_AUTH_KEY = 'gestao_obras_airbnb_session'
const STORAGE_PROPERTIES_KEY = 'gestao_obras_airbnb_properties'

export interface AirbnbProperty {
  id: string
  name: string
  address: string
  daily_rate: number
  created_at?: string
  status?: string
}

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

  // Lista de imóveis
  const [properties, setProperties] = useState<AirbnbProperty[]>([])
  const [loading, setLoading] = useState(false)
  const [isFallbackMode, setIsFallbackMode] = useState(false)

  // Modal de Adicionar Imóvel
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newPropName, setNewPropName] = useState('')
  const [newPropAddress, setNewPropAddress] = useState('')
  const [newPropDailyRate, setNewPropDailyRate] = useState('')
  const [saving, setSaving] = useState(false)

  // Carregar propriedades locais do storage
  const loadLocalProperties = (): AirbnbProperty[] => {
    try {
      const raw = localStorage.getItem(STORAGE_PROPERTIES_KEY)
      if (raw) {
        return JSON.parse(raw)
      }
    } catch (e) {
      console.warn('[Airbnb] Erro ao carregar imóveis do localStorage:', e)
    }
    return []
  }

  const saveLocalProperties = (list: AirbnbProperty[]) => {
    try {
      localStorage.setItem(STORAGE_PROPERTIES_KEY, JSON.stringify(list))
    } catch (e) {
      console.warn('[Airbnb] Erro ao salvar imóveis no localStorage:', e)
    }
  }

  // Buscar propriedades (tenta Supabase 'airbnb_properties', se 42P01/ausente usa localStorage)
  const fetchProperties = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('airbnb_properties' as any)
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        if (isMissingTableError(error)) {
          // Tabela não existe no Supabase, usa fallback localStorage
          setIsFallbackMode(true)
          setProperties(loadLocalProperties())
        } else {
          console.warn('[Airbnb] Erro ao carregar imóveis do Supabase:', error)
          setIsFallbackMode(true)
          setProperties(loadLocalProperties())
        }
      } else if (data) {
        setIsFallbackMode(false)
        setProperties(data as unknown as AirbnbProperty[])
      } else {
        setProperties(loadLocalProperties())
      }
    } catch (err) {
      console.warn('[Airbnb] Falha na requisição Supabase, usando fallback local:', err)
      setIsFallbackMode(true)
      setProperties(loadLocalProperties())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchProperties()
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
    toast({
      title: 'Sessão encerrada',
      description: 'Você saiu da seção restrita do Airbnb.',
    })
  }

  // Adicionar Imóvel
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

    const newProperty: AirbnbProperty = {
      id: crypto.randomUUID(),
      name: newPropName.trim(),
      address: newPropAddress.trim() || 'Endereço não informado',
      daily_rate: rateNumeric,
      created_at: new Date().toISOString(),
      status: 'ativo',
    }

    setSaving(true)

    // Se já sabemos que a tabela não existe ou se é fallback
    if (isFallbackMode) {
      const updated = [newProperty, ...properties]
      setProperties(updated)
      saveLocalProperties(updated)
      toast({
        title: 'Imóvel salvo',
        description: `${newProperty.name} adicionado com sucesso.`,
      })
      resetForm()
      setSaving(false)
      return
    }

    // Tentar salvar no Supabase
    try {
      const { data, error } = await supabase
        .from('airbnb_properties' as any)
        .insert([
          {
            name: newProperty.name,
            address: newProperty.address,
            daily_rate: newProperty.daily_rate,
          },
        ])
        .select()
        .single()

      if (error) {
        if (isMissingTableError(error)) {
          // Fallback para storage local silenciosamente
          setIsFallbackMode(true)
          const updated = [newProperty, ...properties]
          setProperties(updated)
          saveLocalProperties(updated)
          toast({
            title: 'Imóvel salvo localmente',
            description: `${newProperty.name} adicionado ao dispositivo (modo offline/local).`,
          })
        } else {
          // Erro genérico -> salvar no local como salvaguarda
          const updated = [newProperty, ...properties]
          setProperties(updated)
          saveLocalProperties(updated)
          toast({
            title: 'Salvo em armazenamento local',
            description: 'Salvo localmente devido a uma resposta do servidor.',
          })
        }
      } else if (data) {
        setProperties([data as unknown as AirbnbProperty, ...properties])
        toast({
          title: 'Imóvel cadastrado',
          description: `${newProperty.name} salvo com sucesso no banco de dados.`,
        })
      }
    } catch {
      // Fallback
      setIsFallbackMode(true)
      const updated = [newProperty, ...properties]
      setProperties(updated)
      saveLocalProperties(updated)
      toast({
        title: 'Imóvel salvo localmente',
        description: 'Salvo no armazenamento local com sucesso.',
      })
    } finally {
      resetForm()
      setSaving(false)
    }
  }

  const handleDeleteProperty = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover o imóvel "${name}"?`)) {
      return
    }

    if (isFallbackMode) {
      const updated = properties.filter((p) => p.id !== id)
      setProperties(updated)
      saveLocalProperties(updated)
      toast({
        title: 'Imóvel removido',
        description: `${name} foi excluído da lista.`,
      })
      return
    }

    try {
      const { error } = await supabase
        .from('airbnb_properties' as any)
        .delete()
        .eq('id', id)

      if (error) {
        // Fallback local
        const updated = properties.filter((p) => p.id !== id)
        setProperties(updated)
        saveLocalProperties(updated)
      } else {
        setProperties(properties.filter((p) => p.id !== id))
      }
      toast({
        title: 'Imóvel removido',
        description: `${name} foi excluído com sucesso.`,
      })
    } catch {
      const updated = properties.filter((p) => p.id !== id)
      setProperties(updated)
      saveLocalProperties(updated)
    }
  }

  const resetForm = () => {
    setNewPropName('')
    setNewPropAddress('')
    setNewPropDailyRate('')
    setIsDialogOpen(false)
  }

  // ==========================================================================
  // ESTADO NÃO-AUTENTICADO: Portão de Login Privilegiado
  // Não renderiza NADA do conteúdo da seção até que seja autenticado.
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
  // ESTADO AUTENTICADO: Gestão de Imóveis Airbnb
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
            Gerenciamento e controle de imóveis para locação por temporada.
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
              Armazenamento local ativo: seus imóveis estão sendo salvos com segurança no navegador
              enquanto a tabela dedicada no Supabase não é provisionada.
            </span>
          </div>
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
                Você ainda não adicionou nenhum imóvel de temporada. Comece cadastrando o seu
                primeiro imóvel do Airbnb.
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
        /* Grid de Imóveis */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((prop) => (
            <Card
              key={prop.id}
              className="hover:shadow-md transition-shadow relative overflow-hidden group"
            >
              <div className="h-2 bg-primary/80 w-full" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle
                    className="text-lg font-semibold text-foreground truncate"
                    title={prop.name}
                  >
                    {prop.name}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDeleteProperty(prop.id, prop.name)}
                    title="Excluir imóvel"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate" title={prop.address}>
                    {prop.address}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4 space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Diária estimada:</span>
                  </div>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(prop.daily_rate || 0)}
                  </span>
                </div>

                {prop.created_at && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      Cadastrado em {new Date(prop.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal para Adicionar Imóvel */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreateProperty}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                <DialogTitle>Adicionar Imóvel Airbnb</DialogTitle>
              </div>
              <DialogDescription>
                Cadastre um imóvel para gerenciar reservas, diárias e locações de temporada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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
                <Label htmlFor="prop-rate">Valor da Diária (R$)</Label>
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
