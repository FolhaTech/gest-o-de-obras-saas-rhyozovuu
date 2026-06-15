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
import { useData } from '@/hooks/use-data'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface Profile {
  id: string
  full_name: string
  role: string | null
}

export default function UsersTab() {
  const { data: profiles, loading, refetch } = useData<Profile>('profiles')
  const { toast } = useToast()

  const handleRoleChange = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (!error) {
      toast({ title: 'Permissão atualizada!' })
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Nível de Acesso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.full_name}</TableCell>
              <TableCell>
                <Select
                  value={p.role || 'engineer'}
                  onValueChange={(val) => handleRoleChange(p.id, val)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="manager">Gerente de Obra</SelectItem>
                    <SelectItem value="engineer">Engenheiro</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
