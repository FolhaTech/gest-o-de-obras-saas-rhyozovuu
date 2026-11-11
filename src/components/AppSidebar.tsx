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
  { title: 'Faturamento', url: '/faturamento', icon: Wallet },
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
  const seesPurchases = role === 'financeiro' // só o financeiro atende: o contador de pendentes é dele
  useEffect(() => {
    if (!seesPurchases) return
    let alive = true
    const load = () =>
      supabase
        .from('purchase_requests' as any)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'requested')
        .then(({ count }) => alive && setNewPurchases(count ?? 0))
    load()
    const t = setInterval(load, 60_000) // confere a cada minuto
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [seesPurchases, pathname])
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
