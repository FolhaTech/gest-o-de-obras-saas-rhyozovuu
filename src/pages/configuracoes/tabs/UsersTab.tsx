import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useData } from '@/hooks/use-data'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { normalizeRole } from '@/lib/roles'
import { ShieldCheck, HardHat, UserCheck, Shield, Clock, History, KeyRound, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Profile {
  id: string
  full_name: string
  email?: string | null
  role: string | null
  last_login_at?: string | null
  created_at?: string | null
  team_member_id?: string | null
}

function formatLastLogin(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function UsersTab() {
  const { data: profiles, loading, refetch } = useData<Profile>('profiles')
  const { data: members } = useData<{ id: string; name: string; status?: string | null; provider_id?: string | null }>(
    'team_members',
  )
  const { user: currentUser, refreshProfile, role: myRole } = useAuth()
  const { toast } = useToast()

  // Alteração de senha de outros usuários (somente administradores)
  const [pwdTarget, setPwdTarget] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  const closePwdDialog = () => {
    setPwdTarget(null)
    setNewPassword('')
  }

  // Criação de usuário (o cadastro aberto está desligado: só o administrador cria contas)
  const emptyNewUser = { email: '', fullName: '', password: '', role: 'prestador' }
  const [createOpen, setCreateOpen] = useState(false)
  const [newUser, setNewUser] = useState(emptyNewUser)
  const [creating, setCreating] = useState(false)

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    const { error } = await supabase.functions.invoke('create-user', { body: newUser })
    setCreating(false)
    if (error) {
      let msg = error.message
      try {
        const body = await (error as any).context?.json?.()
        if (body?.error) msg = body.error
      } catch {
        /* mantém a mensagem padrão */
      }
      toast({ title: 'Erro ao criar usuário', description: msg, variant: 'destructive' })
      return
    }
    toast({
      title: 'Usuário criado',
      description: `${newUser.email} já pode entrar. Informe a senha por um canal seguro.`,
    })
    setCreateOpen(false)
    setNewUser(emptyNewUser)
    refetch()
  }

  // Vínculo usuário -> membro da equipe: define quais tarefas do Planner o Prestador enxerga
  const handleLinkChange = async (userId: string, memberId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ team_member_id: memberId === 'none' ? null : memberId } as any)
      .eq('id', userId)
    if (error) {
      toast({ title: 'Erro ao vincular', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: memberId === 'none' ? 'Vínculo removido' : 'Usuário vinculado ao membro da equipe' })
    refetch()
    if (currentUser?.id === userId) await refreshProfile()
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwdTarget) return
    if (newPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'Use pelo menos 6 caracteres.',
        variant: 'destructive',
      })
      return
    }
    setSavingPwd(true)
    const { error } = await supabase.functions.invoke('set-user-password', {
      body: { userId: pwdTarget.id, password: newPassword },
    })
    setSavingPwd(false)
    if (error) {
      let msg = error.message
      try {
        const body = await (error as any).context?.json?.()
        if (body?.error) msg = body.error
      } catch {
        /* mantém a mensagem padrão */
      }
      toast({ title: 'Erro ao alterar senha', description: msg, variant: 'destructive' })
      return
    }
    toast({
      title: 'Senha alterada',
      description: `${pwdTarget.email || pwdTarget.full_name} já pode entrar com a nova senha.`,
    })
    closePwdDialog()
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (!error) {
      toast({
        title: 'Papel atualizado com sucesso!',
        description: `O perfil agora tem permissão de ${newRole === 'admin' ? 'Administrador' : newRole === 'gestor' ? 'Gestor' : 'Prestador'}.`,
      })
      refetch()
      if (currentUser?.id === userId) {
        await refreshProfile()
      }
    } else {
      toast({
        title: 'Erro ao alterar permissão',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-1 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Controle de Papéis e Permissões do Sistema
        </p>
        <ul className="list-disc list-inside space-y-1 mt-1 text-xs sm:text-sm">
          <li>
            <strong>Admin:</strong> Acesso total a todos os módulos, financeiro, configurações e
            equipes; vê todos os cards do Planner.
          </li>
          <li>
            <strong>Gestor:</strong> Mesmas permissões do Admin (inclusive todos os cards do
            Planner), porém sem nenhum indicador de valores: não vê receitas, despesas, orçamentos,
            preços, custos, ROI nem pagamentos.
          </li>
          <li>
            <strong>Prestador:</strong> Acesso a Planner, Obras, Materiais e Diário de Obras (as
            demais áreas ficam bloqueadas). No Planner vê somente os cards em que é a Pessoa Responsável
            (membro da equipe vinculado); no Cronograma vê as etapas de todos, sem alterar.
          </li>
        </ul>
      </div>

      {myRole === 'admin' && (
        <div className="flex justify-end">
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" /> Novo usuário
          </Button>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / E-mail</TableHead>
              <TableHead>Papel Atual</TableHead>
              <TableHead>Último login</TableHead>
              <TableHead>Alterar Nível de Acesso</TableHead>
              <TableHead>Membro da equipe</TableHead>
              {myRole === 'admin' && <TableHead>Senha</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => {
              const currentNorm = normalizeRole(p.role)
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {p.full_name || 'Usuário sem nome'}
                    </div>
                    {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                  </TableCell>
                  <TableCell>
                    {currentNorm === 'admin' && (
                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900/40 dark:text-purple-300 gap-1">
                        <ShieldCheck className="h-3 w-3" /> Admin
                      </Badge>
                    )}
                    {currentNorm === 'gestor' && (
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 gap-1">
                        <UserCheck className="h-3 w-3" /> Gestor
                      </Badge>
                    )}
                    {currentNorm === 'prestador' && (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 gap-1">
                        <HardHat className="h-3 w-3" /> Prestador
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatLastLogin(p.last_login_at) ? (
                      <span className="flex items-center gap-1.5 text-sm text-foreground">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatLastLogin(p.last_login_at)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground italic">
                        <History className="h-3.5 w-3.5" />
                        Nunca entrou
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={currentNorm}
                      onValueChange={(val) => handleRoleChange(p.id, val)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin (Acesso Total)</SelectItem>
                        <SelectItem value="gestor">Gestor (como Admin, sem valores)</SelectItem>
                        <SelectItem value="prestador">
                          Prestador (Planner/Obras/Mat./Diário)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {myRole === 'admin' ? (
                      <Select
                        value={p.team_member_id ?? 'none'}
                        onValueChange={(val) => handleLinkChange(p.id, val)}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem vínculo</SelectItem>
                          {(members || []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name.trim()}
                              {m.provider_id ? ' · Prestador' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">
                        {(members || []).find((m) => m.id === p.team_member_id)?.name.trim() || '-'}
                      </span>
                    )}
                  </TableCell>
                  {myRole === 'admin' && (
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setPwdTarget(p)}
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Alterar senha
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              O usuário entra já confirmado, com o papel escolhido. Informe a senha à pessoa por um
              canal seguro.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nu-email">E-mail</Label>
              <Input
                id="nu-email"
                type="email"
                required
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nu-name">Nome</Label>
              <Input
                id="nu-name"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nu-pass">Senha</Label>
              <Input
                id="nu-pass"
                type="text"
                autoComplete="off"
                minLength={6}
                maxLength={72}
                required
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (Acesso Total)</SelectItem>
                  <SelectItem value="gestor">Gestor (como Admin, sem valores)</SelectItem>
                  <SelectItem value="prestador">Prestador (Planner/Obras/Mat./Diário)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Criando...' : 'Criar usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwdTarget} onOpenChange={(open) => !open && closePwdDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para {pwdTarget?.full_name || 'o usuário'}
              {pwdTarget?.email ? ` (${pwdTarget.email})` : ''}. Informe-a à pessoa por um canal
              seguro.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-password">Nova senha</Label>
              <Input
                id="new-user-password"
                type="text"
                autoComplete="off"
                minLength={6}
                maxLength={72}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={savingPwd} onClick={closePwdDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingPwd}>
                {savingPwd ? 'Salvando...' : 'Salvar senha'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
