import {
  Building2,
  LayoutDashboard,
  Users,
  Package,
  Receipt,
  FileBarChart,
  Settings,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Obras', url: '/obras', icon: Building2 },
  { title: 'Diário de Obra', url: '/diario-obra', icon: FileBarChart },
  { title: 'Equipes', url: '/equipes', icon: Users },
  { title: 'Materiais', url: '/materiais', icon: Package },
  { title: 'Despesas', url: '/despesas', icon: Receipt },
  { title: 'Relatórios', url: '/relatorios', icon: FileBarChart },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
]

export function AppSidebar() {
  const location = useLocation()
  const { profile } = useAuth()

  const visibleNavItems = navItems.filter((item) => {
    if (item.url === '/configuracoes' && profile?.role !== 'admin') {
      return false
    }
    return true
  })

  return (
    <Sidebar variant="sidebar">
      <SidebarHeader className="h-16 flex items-center justify-center border-b border-sidebar-border px-6">
        <div className="flex items-center gap-2 w-full font-bold text-lg text-primary">
          <Building2 className="h-6 w-6" />
          <span>GestãoObras</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => {
                const isActive =
                  location.pathname === item.url ||
                  (item.url !== '/' && location.pathname.startsWith(item.url))
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
