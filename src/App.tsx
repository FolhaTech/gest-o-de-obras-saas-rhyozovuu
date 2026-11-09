import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RoleRoute } from '@/components/RoleRoute'

import Layout from './components/Layout'
import Index from './pages/Index'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import ObrasList from './pages/obras/List'
import ObraDetail from './pages/obras/Detail'
import DiarioObraList from './pages/diario-obra/List'
import EquipesList from './pages/equipes/List'
import MateriaisList from './pages/materiais/List'
import DespesasList from './pages/despesas/List'
import RelatoriosList from './pages/relatorios/List'
import ConfiguracoesList from './pages/configuracoes/List'
import ManualPage from './pages/manual/ManualPage'
import AirbnbPage from './pages/Airbnb'
import PlannerPage from './pages/planner/PlannerPage'
import AccessDenied from './pages/AccessDenied'
import NotFound from './pages/NotFound'

/**
 * Redireciona a rota raiz ("/") se o usuário for 'prestador':
 * prestadores são encaminhados diretamente para /obras (pois não têm dashboard financeiro/indicadores).
 * Admin e Gestor acessam a tela principal (Index).
 */
function HomeRoute() {
  const { role } = useAuth()
  if (role === 'prestador') {
    return <Navigate to="/obras" replace />
  }
  return <Index />
}

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              {/* Rota inicial adaptativa: Dashboard para admin/gestor, /obras para prestador */}
              <Route path="/" element={<HomeRoute />} />

              {/* Seções permitidas para TODOS (inclusive prestador): Planner, Obras, Diário de Obra, Materiais */}
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/obras" element={<ObrasList />} />
              <Route path="/obras/:id" element={<ObraDetail />} />
              <Route path="/diario-obra" element={<DiarioObraList />} />
              <Route path="/materiais" element={<MateriaisList />} />
              <Route path="/manual" element={<ManualPage />} />

              {/* Seções exclusivas para Admin e Gestor: protegidas por RoleRoute */}
              <Route element={<RoleRoute allowedRoles={['admin', 'gestor']} />}>
                <Route path="/equipes" element={<EquipesList />} />
                {/* Páginas 100% financeiras: só o Administrador (o Gestor não vê valores) */}
                <Route element={<RoleRoute allowedRoles={['admin']} />}>
                  <Route path="/despesas" element={<DespesasList />} />
                  <Route path="/airbnb" element={<AirbnbPage />} />
                </Route>
                <Route path="/relatorios" element={<RelatoriosList />} />
                <Route path="/configuracoes" element={<ConfiguracoesList />} />
              </Route>

              {/* Tela amigável de Acesso Restrito direta */}
              <Route path="/acesso-restrito" element={<AccessDenied />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AuthProvider>
)

export default App
