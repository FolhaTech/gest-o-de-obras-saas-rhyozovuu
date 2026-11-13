import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { imageObjectUrl } from './image-storage'

interface Props {
  /** Caminho da imagem no bucket privado "purchase-images". */
  path: string
  alt: string
  /** Lado da miniatura em pixels. */
  size?: number
}

/** Miniatura de uma imagem do bucket privado (baixa com o login do usuário); clicar abre a imagem grande. */
export default function StorageImage({ path, alt, size = 56 }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    let created: string | null = null
    setState('loading')
    setUrl(null)
    imageObjectUrl(path).then((u) => {
      if (!alive) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      created = u
      setUrl(u)
      setState(u ? 'ok' : 'error')
    })
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [path])

  const box = { width: size, height: size }
  if (state === 'loading') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-md border bg-muted/30" style={box} aria-label="Carregando imagem">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </span>
    )
  }
  if (state === 'error' || !url) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground" style={box} title="Imagem indisponível">
        <ImageOff className="h-4 w-4" />
      </span>
    )
  }
  return (
    <>
      <button type="button" className="shrink-0 overflow-hidden rounded-md border hover:ring-2 hover:ring-primary/40" style={box} title="Ampliar a imagem" onClick={() => setOpen(true)}>
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{alt}</DialogTitle>
          </DialogHeader>
          <img src={url} alt={alt} className="max-h-[75vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}
