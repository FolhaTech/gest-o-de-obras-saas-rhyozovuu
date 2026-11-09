import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/use-auth'
import WorkersTab from './tabs/WorkersTab'
import GroupsTab from './tabs/GroupsTab'
import AttendanceTab from './tabs/AttendanceTab'
import ProvidersTab from './tabs/ProvidersTab'
import ContractsTab from './tabs/ContractsTab'
import { Users, CalendarDays, Briefcase, FileSignature, Layers } from 'lucide-react'

export default function EquipesList() {
  // Serviços contratados são valores (R$) puros: só o administrador
  const { canSeeValues } = useAuth()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Equipes e Mão de Obra</h1>
        <p className="text-muted-foreground">
          Gestão de funcionários, grupos, controle de diárias, prestadores e serviços contratados.
        </p>
      </div>

      <Tabs defaultValue="attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 lg:w-[920px] h-auto p-1">
          <TabsTrigger value="attendance" className="py-2.5 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Controle de Diárias</span>
            <span className="sm:hidden">Diárias</span>
          </TabsTrigger>
          <TabsTrigger value="workers" className="py-2.5 flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Funcionários</span>
            <span className="sm:hidden">Equipe</span>
          </TabsTrigger>
          <TabsTrigger value="groups" className="py-2.5 flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span>Grupos</span>
          </TabsTrigger>
          <TabsTrigger value="providers" className="py-2.5 flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Prestadores</span>
            <span className="sm:hidden">Prest.</span>
          </TabsTrigger>
          {canSeeValues && (
            <TabsTrigger value="contracts" className="py-2.5 flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              <span className="hidden sm:inline">Serviços Contratados</span>
              <span className="sm:hidden">Contratos</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="workers" className="mt-6 border-none p-0 outline-none">
          <WorkersTab />
        </TabsContent>
        <TabsContent value="groups" className="mt-6 border-none p-0 outline-none">
          <GroupsTab />
        </TabsContent>
        <TabsContent value="attendance" className="mt-6 border-none p-0 outline-none">
          <AttendanceTab />
        </TabsContent>
        <TabsContent value="providers" className="mt-6 border-none p-0 outline-none">
          <ProvidersTab />
        </TabsContent>
        {canSeeValues && (
          <TabsContent value="contracts" className="mt-6 border-none p-0 outline-none">
            <ContractsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
