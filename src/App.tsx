import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppProvider } from '@/stores/use-app-store'

import Layout from './components/Layout'
import Index from './pages/Index'
import ObrasList from './pages/obras/List'
import ObraDetail from './pages/obras/Detail'
import DiarioObraList from './pages/diario-obra/List'
import EquipesList from './pages/equipes/List'
import MateriaisList from './pages/materiais/List'
import DespesasList from './pages/despesas/List'
import RelatoriosList from './pages/relatorios/List'
import NotFound from './pages/NotFound'

const App = () => (
  <AppProvider>
    <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AppProvider>
)

export default App
