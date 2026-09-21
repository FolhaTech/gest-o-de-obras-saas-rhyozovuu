import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Search, Bell, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getRoleLabel } from '@/lib/roles'
import { Badge } from '@/components/ui/badge'

export default function Layout() {
  const { user, profile, role, signOut } = useAuth()

  const userName =
    profile?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário'
  const roleLabel = getRoleLabel(role)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-card px-4 md:px-6 shadow-sm z-10">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1 max-w-xl hidden md:flex items-center relative">
            <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={
                role === 'prestador'
                  ? 'Buscar em obras, materiais...'
                  : 'Buscar obras, materiais...'
              }
              className="pl-9 bg-muted/50 border-none w-full"
            />
          </div>
          <div className="ml-auto flex items-center gap-4">
            {role === 'prestador' && (
              <Badge
                variant="secondary"
                className="hidden sm:inline-flex text-xs font-normal bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              >
                Acesso Prestador
              </Badge>
            )}
            <button
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Notificações"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary"></span>
            </button>
            <div className="flex items-center gap-3 border-l pl-4">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-sm font-medium leading-none">{userName}</span>
                <span className="text-xs text-muted-foreground">{roleLabel}</span>
              </div>
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url || ''} alt={userName} />
                <AvatarFallback>{userName.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <button
                onClick={signOut}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-8 animate-fade-in">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
