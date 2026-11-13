import { useState } from 'react'
import { FileText } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { openInvoice } from './invoice-storage'

interface Props {
  path: string
  name?: string | null
  /** Só o ícone com o texto curto (para a linha da tabela). */
  compact?: boolean
}

/** Abre a foto/PDF da nota fiscal em outra aba. Só mostrar para quem lê o arquivo (Admin e Financeiro). */
export default function InvoiceLink({ path, name, compact }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const open = async () => {
    setBusy(true)
    const problem = await openInvoice(path, name)
    setBusy(false)
    if (problem) toast({ title: 'Nota fiscal', description: problem, variant: 'destructive' })
  }

  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className={compact ? 'h-auto gap-1 p-0 text-xs' : 'h-auto gap-1.5 p-0'}
      disabled={busy}
      title={name ? `Abrir ${name}` : 'Abrir a nota fiscal'}
      onClick={open}
    >
      <FileText className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
      {busy ? 'Abrindo...' : compact ? 'Ver nota' : 'Ver nota fiscal'}
    </Button>
  )
}
