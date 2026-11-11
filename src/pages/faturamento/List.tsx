import { useState } from 'react'
import { ShoppingCart, Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import PurchasesPanel from './PurchasesPanel'
import TeamPaymentsPanel from './TeamPaymentsPanel'

/**
 * Faturamento: Compras (qualquer usuário solicita o que precisa ser comprado; o Financeiro atende) e
 * Pagamento (Equipe) (só Admin e Financeiro).
 */
export default function FaturamentoList() {
  const { role, canSeeBilling } = useAuth()
  const [newCount, setNewCount] = useState(0)
  const isFinance = role === 'admin' || role === 'financeiro'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Faturamento</h1>
        <p className="text-muted-foreground">Solicitações de compra e pagamento da equipe.</p>
      </div>

      <Tabs defaultValue="compras" className="w-full">
        <TabsList>
          <TabsTrigger value="compras" className="gap-2">
            <ShoppingCart className="h-4 w-4" /> Compras
            {isFinance && newCount > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{newCount}</span>
            )}
          </TabsTrigger>
          {canSeeBilling && (
            <TabsTrigger value="pagamento" className="gap-2">
              <Wallet className="h-4 w-4" /> Pagamento (Equipe)
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="compras" className="mt-4">
          <PurchasesPanel onNewCount={setNewCount} />
        </TabsContent>
        {canSeeBilling && (
          <TabsContent value="pagamento" className="mt-4">
            <TeamPaymentsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
