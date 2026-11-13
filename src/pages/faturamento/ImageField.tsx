import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { IMAGE_ACCEPT, validateImage } from '@/lib/item-image'
import { formatFileSize } from '@/lib/invoice-file'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface Props {
  label: string
  /** Imagem escolhida (ainda não enviada). */
  file: File | null
  onChange: (file: File | null) => void
  /** Nome da imagem que já está anexada (a nova a substitui). */
  currentName?: string | null
  /** A imagem anexada está marcada para ser removida. */
  remove?: boolean
  onRemoveChange?: (remove: boolean) => void
  disabled?: boolean
  hint?: string
}

/** Campo de imagem: escolhe a foto (câmera do celular inclusive), mostra a miniatura e confere tipo e tamanho. */
export default function ImageField({ label, file, onChange, currentName, remove, onRemoveChange, disabled, hint }: Props) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pick = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0] ?? null
    ev.target.value = '' // permite escolher o mesmo arquivo de novo depois de remover
    if (!f) return
    // o limite vale para o arquivo já reduzido; aqui só barra o que não é imagem aceita ou é absurdamente grande
    const problem = validateImage({ name: f.name, type: f.type, size: Math.min(f.size, 1) }) ?? (f.size > 60 * 1024 * 1024 ? 'A imagem é grande demais.' : null)
    setError(problem)
    if (!problem) {
      onRemoveChange?.(false)
      onChange(f)
    } else {
      onChange(null)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input id={id} ref={input} type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={pick} disabled={disabled} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={disabled} onClick={() => input.current?.click()}>
          <ImagePlus className="h-4 w-4" /> {file ? 'Trocar imagem' : currentName && !remove ? 'Substituir imagem' : 'Escolher imagem'}
        </Button>
        {file && preview && (
          <span className="flex items-center gap-2 rounded-md border bg-muted/30 p-1 pr-2 text-xs">
            <img src={preview} alt="Imagem escolhida" className="h-10 w-10 rounded object-cover" />
            <span className="max-w-[12rem] truncate">{file.name}</span>
            <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
            <button type="button" className="text-muted-foreground hover:text-destructive" title="Tirar a imagem escolhida" onClick={() => { setError(null); onChange(null) }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        {!file && currentName && onRemoveChange && (
          <Button type="button" variant="ghost" size="sm" className={remove ? 'text-amber-700' : 'text-muted-foreground hover:text-destructive'} onClick={() => onRemoveChange(!remove)}>
            {remove ? 'Manter a imagem atual' : 'Remover a imagem atual'}
          </Button>
        )}
      </div>
      {currentName && !file && !remove && <p className="text-xs text-muted-foreground">Já anexada: {currentName}.</p>}
      {currentName && !file && remove && <p className="text-xs text-amber-700">A imagem "{currentName}" será removida ao salvar.</p>}
      {file && currentName && <p className="text-xs text-amber-700">A nova imagem vai substituir "{currentName}".</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">{hint ?? 'JPG, PNG, WEBP ou HEIC. A foto é reduzida antes de enviar.'}</p>
    </div>
  )
}
