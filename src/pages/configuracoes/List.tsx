import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import UsersTab from './tabs/UsersTab'
import ServicesTab from './tabs/ServicesTab'

export default function ConfiguracoesList() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie usuários, permissões e o catálogo de serviços e composições.
        </p>
      </div>
      <Tabs defaultValue="usuarios" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-6">
          <TabsTrigger
            value="usuarios"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Usuários e Permissões
          </TabsTrigger>
          <TabsTrigger
            value="servicos"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Catálogo de Serviços
          </TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios" className="mt-0">
          <UsersTab />
        </TabsContent>
        <TabsContent value="servicos" className="mt-0">
          <ServicesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
