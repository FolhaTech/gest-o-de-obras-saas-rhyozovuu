import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import WorkersTab from './tabs/WorkersTab'
import AttendanceTab from './tabs/AttendanceTab'
import ProvidersTab from './tabs/ProvidersTab'
import ContractsTab from './tabs/ContractsTab'
import { Users, CalendarDays, Briefcase, FileSignature } from 'lucide-react'

export default function EquipesList() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Equipes e Mão de Obra</h1>
        <p className="text-muted-foreground">
          Gestão de funcionários, controle de diárias, prestadores e serviços contratados.
        </p>
      </div>

      <Tabs defaultValue="workers" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[800px] h-auto p-1">
          <TabsTrigger value="workers" className="py-2.5 flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Funcionários</span>
          </TabsTrigger>
          <TabsTrigger value="attendance" className="py-2.5 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Controle de Diárias</span>
          </TabsTrigger>
          <TabsTrigger value="providers" className="py-2.5 flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Prestadores</span>
          </TabsTrigger>
          <TabsTrigger value="contracts" className="py-2.5 flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            <span className="hidden sm:inline">Serviços Contratados</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workers" className="mt-6 border-none p-0 outline-none">
          <WorkersTab />
        </TabsContent>
        <TabsContent value="attendance" className="mt-6 border-none p-0 outline-none">
          <AttendanceTab />
        </TabsContent>
        <TabsContent value="providers" className="mt-6 border-none p-0 outline-none">
          <ProvidersTab />
        </TabsContent>
        <TabsContent value="contracts" className="mt-6 border-none p-0 outline-none">
          <ContractsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
