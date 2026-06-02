import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/use-auth'
import { ProtectedRoute } from '@/components/ProtectedRoute'

import Layout from './components/Layout'
import Index from './pages/Index'
import Login from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import ObrasList from './pages/obras/List'
import ObraDetail from './pages/obras/Detail'
import DiarioObraList from './pages/diario-obra/List'
import EquipesList from './pages/equipes/List'
import MateriaisList from './pages/materiais/List'
import DespesasList from './pages/despesas/List'
import RelatoriosList from './pages/relatorios/List'
import NotFound from './pages/NotFound'

const App = () => (
  <AuthProvider>
    <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/obras" element={<ObrasList />} />
              <Route path="/obras/:id" element={<ObraDetail />} />
              <Route path="/diario-obra" element={<DiarioObraList />} />
              <Route path="/equipes" element={<EquipesList />} />
              <Route path="/materiais" element={<MateriaisList />} />
              <Route path="/despesas" element={<DespesasList />} />
              <Route path="/relatorios" element={<RelatoriosList />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AuthProvider>
)

export default App
