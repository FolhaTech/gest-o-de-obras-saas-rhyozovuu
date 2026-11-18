import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Home,
  Briefcase,
  BookOpen,
  Users,
  Package,
  Receipt,
  BarChart3,
  Settings,
  HardHat,
  Building2,
  CalendarDays,
  BookOpenCheck,
  Car,
  Hammer,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getRoleLabel } from '@/lib/roles'
import { canReceive, needsMyAction } from '@/lib/purchases'
import { canPayWeek, localTodayISO, weeksAwaitingApproval } from '@/lib/team-week'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { InstallAppButton } from '@/components/InstallAppButton'

interface MenuItem {
  title: string
  url: string
  icon: any
}

const allMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/', icon: Home },
  { title: 'Planner', url: '/planner', icon: CalendarDays },
  { title: 'Obras', url: '/obras', icon: Briefcase },
  { title: 'Diário de Obra', url: '/diario-obra', icon: BookOpen },
  { title: 'Equipes', url: '/equipes', icon: Users },
  { title: 'Materiais', url: '/materiais', icon: Package },
  { title: 'Manutenção', url: '/manutencao', icon: Hammer },
  { title: 'Veículos', url: '/veiculos', icon: Car },
  { title: 'Financeiro', url: '/faturamento', icon: Wallet },
  { title: 'Despesas', url: '/despesas', icon: Receipt },
  { title: 'Airbnb', url: '/airbnb', icon: Building2 },
  { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
  { title: 'Manual do Sistema', url: '/manual', icon: BookOpenCheck },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const { user, profile, role, canAccess } = useAuth()
  const [newPurchases, setNewPurchases] = useState(0)
  // contador da área Financeiro para quem tem a vez de agir: financeiro (cotar, comprar, pagar), admin (aprovar as
  // cotações e receber a entrega dos pedidos que abriu, ou de quem não é admin) e quem pediu a compra e não é admin nem
  // financeiro (recebe a que ele mesmo pediu). O financeiro não recebe entrega.
  const seesPurchases = canAccess('/faturamento')
  useEffect(() => {
    if (!seesPurchases) return
    let alive = true
    const load = async () => {
      let mineToReceive = 0
      if (user?.id && role === 'admin') {
        const { data: toReceive } = await supabase
          .from('purchase_requests' as any)
          .select('id, status, requested_by, requester:requested_by(role)')
          .eq('status', 'awaiting_delivery')
        const list = (toReceive ?? []) as unknown as { status: string; requested_by: string | null; requester?: { role?: string | null } | null }[]
        mineToReceive = list.filter((r) => canReceive(r, user.id, role, r.requester?.role)).length
      } else if (user?.id && role !== 'financeiro') {
        const mine = await supabase
          .from('purchase_requests' as any)
          .select('id', { count: 'exact', head: true })
          .eq('status', 'awaiting_delivery')
          .eq('requested_by', user.id)
        mineToReceive = mine.count ?? 0
      }
      // pagamentos semanais da equipe (pendentes) e semanas que o admin já aprovou (conferência de sexta)
      const weekly = async () => {
        const [p, a] = await Promise.all([
          supabase.from('team_payments' as any).select('week_start').eq('source', 'attendance').eq('status', 'pending'),
          supabase.from('team_week_approvals' as any).select('week_start'),
        ])
        const weeks = ((p.data ?? []) as unknown as { week_start: string | null }[]).map((r) => r.week_start).filter((w): w is string => !!w)
        const approved = new Set(((a.data ?? []) as unknown as { week_start: string }[]).map((r) => r.week_start.slice(0, 10)))
        const today = localTodayISO()
        return {
          // o financeiro paga: semana fechada E aprovada
          payable: weeks.filter((w) => canPayWeek(w, today, approved)).length,
          // o admin confere: semana fechada que ainda não aprovou
          toApprove: weeksAwaitingApproval(weeks, approved, today).length,
        }
      }
      if (role === 'financeiro') {
        const { count } = await supabase
          .from('purchase_requests' as any)
          .select('id', { count: 'exact', head: true })
          .in('status', ['requested', 'quoting', 'approved', 'awaiting_payment', 'awaiting_release'])
        const due = await weekly()
        const providers = await supabase.from('provider_payments' as any).select('id', { count: 'exact', head: true }).eq('status', 'requested')
        if (alive) setNewPurchases((count ?? 0) + due.payable + (providers.count ?? 0))
        return
      }
      if (role !== 'admin') {
        if (alive) setNewPurchases(mineToReceive)
        return
      }
      const { data } = await supabase
        .from('purchase_requests' as any)
        .select('id, status, requested_by, requester:requested_by(role)')
        .eq('status', 'quotes_sent')
      const rows = (data ?? []) as unknown as { status: string; requested_by: string | null; requester?: { role?: string | null } | null }[]
      const conf = await weekly()
      if (alive) setNewPurchases(rows.filter((r) => needsMyAction(r, user?.id, role, r.requester?.role)).length + conf.toApprove + mineToReceive)
    }
    load()
    const t = setInterval(load, 60_000) // confere a cada minuto
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [seesPurchases, role, user?.id, pathname])
  const { isMobile, setOpenMobile } = useSidebar()

  const userName =
    profile?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário'
  const roleLabel = getRoleLabel(role)

  // Filtra itens do menu conforme a regra de papéis:
  // Prestador tem acesso a Planner, Obras, Diário de Obra e Materiais
  const visibleItems = allMenuItems.filter((item) => canAccess(item.url))

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 font-bold text-xl">
          <HardHat className="h-6 w-6 text-primary" />
          <span>Gestão de Obras</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Menu Principal</span>
            {role === 'prestador' && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 uppercase font-semibold text-primary border-primary/40"
              >
                Prestador
              </Badge>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      pathname === item.url || (item.url !== '/' && pathname.startsWith(item.url))
                    }
                  >
                    <Link
                      to={item.url}
                      onClick={() => {
                        if (isMobile) {
                          setOpenMobile(false)
                        }
                      }}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.url === '/faturamento' && seesPurchases && newPurchases > 0 && (
                        <span className="ml-auto rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold leading-4 text-white">
                          {newPurchases}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t space-y-3">
        <InstallAppButton variant="sidebar" />
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url || ''} alt={userName} />
            <AvatarFallback>{userName.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{userName}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground truncate">{roleLabel}</span>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
