import { useState } from 'react'
import { HardHat, ShoppingCart, Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import PurchasesPanel from './PurchasesPanel'
import ProviderPaymentsPanel from './ProviderPaymentsPanel'
import TeamPaymentsPanel from './TeamPaymentsPanel'

/**
 * Financeiro: Compras (solicitação, cotações do financeiro, aprovação do admin, compra, pagamento e recebimento) e
 * Pagamento (Equipe) e Pagamento (Prestadores) (só Admin e Financeiro).
 */
export default function FaturamentoList() {
  const { canSeeBilling } = useAuth()
  const [todoCount, setTodoCount] = useState(0)
  const [payDue, setPayDue] = useState(0)
  const [providerDue, setProviderDue] = useState(0)
  // contador de quem tem a vez de agir: financeiro (cotar, comprar, pagar), admin (aprovar cotações) e qualquer
  // usuário com entrega para receber e conferir (a que ele pediu)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground">Solicitações de compra e pagamento da equipe e dos prestadores.</p>
      </div>

      <Tabs defaultValue="compras" className="w-full">
        <TabsList>
          <TabsTrigger value="compras" className="gap-2">
            <ShoppingCart className="h-4 w-4" /> Compras
            {todoCount > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{todoCount}</span>
            )}
          </TabsTrigger>
          {canSeeBilling && (
            <TabsTrigger value="pagamento" className="gap-2">
              <Wallet className="h-4 w-4" /> Pagamento (Equipe)
              {payDue > 0 && (
                <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{payDue}</span>
              )}
            </TabsTrigger>
          )}
          {canSeeBilling && (
            <TabsTrigger value="prestadores" className="gap-2">
              <HardHat className="h-4 w-4" /> Pagamento (Prestadores)
              {providerDue > 0 && (
                <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{providerDue}</span>
              )}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="compras" className="mt-4">
          <PurchasesPanel onTodoCount={setTodoCount} />
        </TabsContent>
        {canSeeBilling && (
          <TabsContent value="pagamento" className="mt-4">
            <TeamPaymentsPanel onDueCount={setPayDue} />
          </TabsContent>
        )}
        {canSeeBilling && (
          <TabsContent value="prestadores" className="mt-4">
            <ProviderPaymentsPanel onCount={setProviderDue} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
