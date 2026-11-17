import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatSupabaseError } from '@/lib/formatters'
import { MIN_QUOTES, type PurchaseQuoteRow, type PurchaseRequestRow } from '@/lib/purchases'
import { MAX_IMPORT_ROWS, planImport, planSummary, type ImportPlan } from '@/lib/purchase-sheet'
import { readPurchaseWorkbook } from '@/lib/purchase-sheet-io'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onClose: () => void
  /** Pedidos e cotações do sistema neste momento (a planilha é conferida contra eles). */
  requests: PurchaseRequestRow[]
  quotes: PurchaseQuoteRow[]
  /** Atualiza a lista depois de gravar. */
  onChanged: () => void
}

/**
 * Importar a planilha de itens a comprar já preenchida: cada linha com fornecedor e valor vira uma cotação do pedido.
 * Mostra o que será gravado e os problemas, linha a linha, antes de gravar. Só o Financeiro importa.
 */
export default function ImportSheetDialog({ open, onClose, requests, quotes, onChanged }: Props) {
  const { toast } = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [reading, setReading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [failures, setFailures] = useState<{ row: number; item: string; message: string }[]>([])
  const [done, setDone] = useState<string | null>(null)

  const reset = () => {
    setFileName(null)
    setPlan(null)
    setFailures([])
    setDone(null)
  }
  const close = () => {
    reset()
    onClose()
  }

  const pick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    reset()
    setFileName(file.name)
    if (!/\.xlsx$/i.test(file.name)) {
      setPlan({ actions: [], unchanged: 0, blank: 0, issues: [], readyToSend: [], error: 'Envie o arquivo .xlsx exportado pelo sistema (não .xls nem .csv).' })
      return
    }
    setReading(true)
    try {
      const rows = await readPurchaseWorkbook(file)
      setPlan(planImport(rows, requests, quotes))
    } catch {
      setPlan({ actions: [], unchanged: 0, blank: 0, issues: [], readyToSend: [], error: 'Não consegui ler o arquivo. Confira se é uma planilha .xlsx válida, exportada pelo sistema.' })
    } finally {
      setReading(false)
    }
  }

  const apply = async () => {
    if (!plan || plan.actions.length === 0) return
    setApplying(true)
    const bad: { row: number; item: string; message: string }[] = []
    let ok = 0
    for (const a of plan.actions) {
      const body = { ...a.fields }
      const res =
        a.kind === 'insert'
          ? await supabase.from('purchase_quotes' as any).insert({ ...body, request_id: a.requestId })
          : await supabase.from('purchase_quotes' as any).update(body).eq('id', a.quoteId)
      if (res.error) bad.push({ row: a.row, item: a.item, message: formatSupabaseError(res.error) })
      else ok++
    }
    setApplying(false)
    setFailures(bad)
    setDone(`${ok} cotação(ões) gravada(s)${bad.length ? `, ${bad.length} com erro` : ''}.`)
    toast({
      title: 'Planilha importada',
      description: `${ok} cotação(ões) gravada(s)${bad.length ? `; ${bad.length} linha(s) deram erro` : ''}.`,
      variant: bad.length ? 'destructive' : undefined,
    })
    onChanged()
  }

  const inserts = plan?.actions.filter((a) => a.kind === 'insert').length ?? 0
  const updates = plan?.actions.filter((a) => a.kind === 'update').length ?? 0
  const itemName = (id: string) => requests.find((r) => r.id === id)?.item ?? id

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha de itens a comprar</DialogTitle>
          <DialogDescription>
            Cada linha com <strong>Fornecedor</strong> e <strong>Valor</strong> vira uma cotação do pedido. O sistema mostra o que vai gravar antes. Use a planilha exportada
            por aqui (não altere a coluna ID). Mínimo de {MIN_QUOTES} fornecedores por pedido para enviar ao admin.
          </DialogDescription>
        </DialogHeader>

        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={pick} aria-label="Planilha .xlsx" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" className="gap-2" disabled={reading || applying} onClick={() => input.current?.click()}>
            <Upload className="h-4 w-4" /> {fileName ? 'Escolher outro arquivo' : 'Escolher a planilha (.xlsx)'}
          </Button>
          {fileName && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" /> {fileName}
            </span>
          )}
          {reading && <span className="text-sm text-muted-foreground">Lendo...</span>}
        </div>

        {plan?.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {plan.error}
          </div>
        )}

        {plan && !plan.error && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <strong>{planSummary(plan)}</strong>
              {plan.blank > 0 && <span className="text-muted-foreground"> · {plan.blank} linha(s) em branco ignorada(s)</span>}
            </div>

            {plan.actions.length > 0 && (
              <div className="rounded-md border">
                <div className="border-b bg-muted/30 px-3 py-1.5 text-xs font-medium">
                  O que será gravado ({inserts} nova(s), {updates} atualizada(s))
                </div>
                <div className="max-h-56 divide-y overflow-y-auto">
                  {plan.actions.map((a) => (
                    <div key={`${a.row}-${a.requestId}-${a.fields.supplier}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span>
                        <span className="text-xs text-muted-foreground">linha {a.row}</span> · {a.item} · <strong>{a.fields.supplier}</strong>
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{a.kind === 'insert' ? 'nova' : 'atualiza'}</span>
                      </span>
                      <span className="font-semibold text-primary">{formatCurrency(a.fields.quoted_value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.readyToSend.length > 0 && (
              <p className="flex items-start gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Depois de importar, {plan.readyToSend.length} pedido(s) terão {MIN_QUOTES} fornecedores ou mais e poderão ser enviados ao admin: {plan.readyToSend.map(itemName).join(', ')}.
              </p>
            )}

            {plan.issues.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50">
                <div className="flex items-center gap-1.5 border-b border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5" /> {plan.issues.length} linha(s) com problema (não serão importadas)
                </div>
                <ul className="max-h-48 divide-y divide-amber-200 overflow-y-auto text-sm text-amber-950">
                  {plan.issues.map((i, k) => (
                    <li key={k} className="px-3 py-1.5">
                      <span className="text-xs text-amber-800">linha {i.row}</span>
                      {i.item ? ` · ${i.item}` : ''}: {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {done && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
            {done}
            {failures.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-destructive">
                {failures.map((f, k) => (
                  <li key={k}>linha {f.row} · {f.item}: {f.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={applying} onClick={close}>{done ? 'Fechar' : 'Cancelar'}</Button>
          {!done && (
            <Button type="button" disabled={applying || reading || !plan || !!plan.error || plan.actions.length === 0} onClick={apply}>
              {applying ? 'Gravando...' : `Importar ${plan?.actions.length ?? 0} cotação(ões)`}
            </Button>
          )}
        </DialogFooter>
        <p className="text-[11px] text-muted-foreground">Limite de {MAX_IMPORT_ROWS} linhas por planilha.</p>
      </DialogContent>
    </Dialog>
  )
}
