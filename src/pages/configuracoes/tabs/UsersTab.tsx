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
import { ShieldCheck, HardHat, UserCheck, Shield } from 'lucide-react'

interface Profile {
  id: string
  full_name: string
  email?: string | null
  role: string | null
}

export default function UsersTab() {
  const { data: profiles, loading, refetch } = useData<Profile>('profiles')
  const { user: currentUser, refreshProfile } = useAuth()
  const { toast } = useToast()

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
            equipes.
          </li>
          <li>
            <strong>Gestor:</strong> Acesso total a todas as áreas operacionais e financeiras.
          </li>
          <li>
            <strong>Prestador:</strong> Acesso a Planner, Obras, Materiais e Diário de Obras (as
            demais áreas ficam bloqueadas).
          </li>
        </ul>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / E-mail</TableHead>
              <TableHead>Papel Atual</TableHead>
              <TableHead>Alterar Nível de Acesso</TableHead>
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
                    <Select
                      value={currentNorm}
                      onValueChange={(val) => handleRoleChange(p.id, val)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin (Acesso Total)</SelectItem>
                        <SelectItem value="gestor">Gestor (Acesso Total)</SelectItem>
                        <SelectItem value="prestador">
                          Prestador (Planner/Obras/Mat./Diário)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
