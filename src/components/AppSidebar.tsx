import { Link, useLocation } from 'react-router-dom'
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
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const items = [
  { title: 'Dashboard', url: '/', icon: Home },
  { title: 'Obras', url: '/obras', icon: Briefcase },
  { title: 'Diário de Obra', url: '/diario-obra', icon: BookOpen },
  { title: 'Equipes', url: '/equipes', icon: Users },
  { title: 'Materiais', url: '/materiais', icon: Package },
  { title: 'Despesas', url: '/despesas', icon: Receipt },
  { title: 'Airbnb', url: '/airbnb', icon: Building2 },
  { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [profile, setProfile] = useState<{
    full_name: string
    role: string
    avatar_url: string | null
  } | null>(null)

  useEffect(() => {
    let isMounted = true
    const loadProfile = async () => {
      if (!user?.id) return
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()

        if (!error && data && isMounted) {
          setProfile(data)
        }
      } catch (err) {
        console.warn('[AppSidebar] Could not load profile:', err)
      }
    }
    loadProfile()
    return () => {
      isMounted = false
    }
  }, [user?.id])

  const userName =
    profile?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário'
  const userRole = profile?.role || 'Admin'

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
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url || ''} alt={userName} />
            <AvatarFallback>{userName.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium truncate">{userName}</span>
            <span className="text-xs text-muted-foreground capitalize truncate">{userRole}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
