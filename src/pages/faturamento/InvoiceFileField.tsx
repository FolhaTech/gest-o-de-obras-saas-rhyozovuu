import { useId, useRef, useState } from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import { INVOICE_ACCEPT, formatFileSize, validateInvoiceFile } from '@/lib/invoice-file'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface Props {
  /** Arquivo escolhido (ainda não enviado). */
  file: File | null
  onChange: (file: File | null) => void
  /** Nome do arquivo que já está anexado à solicitação (o novo o substitui). */
  currentName?: string | null
  disabled?: boolean
}

/** Campo "Anexar foto ou PDF da nota": escolhe a foto (câmera do celular inclusive) ou o PDF e confere tipo e tamanho. */
export default function InvoiceFileField({ file, onChange, currentName, disabled }: Props) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const pick = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0] ?? null
    ev.target.value = '' // permite escolher o mesmo arquivo de novo depois de remover
    if (!f) return
    const problem = validateInvoiceFile(f)
    setError(problem)
    onChange(problem ? null : f)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Anexar foto ou PDF da nota fiscal</Label>
      <input id={id} ref={input} type="file" accept={INVOICE_ACCEPT} className="sr-only" onChange={pick} disabled={disabled} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={disabled} onClick={() => input.current?.click()}>
          <Paperclip className="h-4 w-4" /> {file ? 'Trocar arquivo' : currentName ? 'Substituir arquivo' : 'Escolher foto ou PDF'}
        </Button>
        {file && (
          <span className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[16rem] truncate">{file.name}</span>
            <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
            <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" title="Remover arquivo escolhido" onClick={() => { setError(null); onChange(null) }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      {currentName && !file && <p className="text-xs text-muted-foreground">Já anexada: {currentName}. Escolha outro arquivo para substituir.</p>}
      {file && currentName && <p className="text-xs text-amber-700">Este arquivo vai substituir "{currentName}".</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, HEIC ou PDF, até 15 MB. Só o admin e o financeiro abrem a nota.</p>
    </div>
  )
}
