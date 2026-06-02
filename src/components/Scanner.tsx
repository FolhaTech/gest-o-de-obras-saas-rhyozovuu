import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

interface ScannerProps {
  onScan: (text: string) => void
  onCancel: () => void
}

export function Scanner({ onScan, onCancel }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [manualUrl, setManualUrl] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let interval: NodeJS.Timeout

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }

        if ('BarcodeDetector' in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
          interval = setInterval(async () => {
            if (
              videoRef.current &&
              videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
            ) {
              try {
                const barcodes = await detector.detect(videoRef.current)
                if (barcodes.length > 0) {
                  onScan(barcodes[0].rawValue)
                  if (interval) clearInterval(interval)
                }
              } catch (err) {
                console.error('Barcode detection error:', err)
              }
            }
          }, 500)
        } else {
          setError('Leitor de QR Code não suportado nativamente no seu navegador.')
        }
      } catch (err) {
        setError('Erro ao acessar a câmera. Verifique as permissões.')
      }
    }

    start()

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop())
      if (interval) clearInterval(interval)
    }
  }, [onScan])

  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-4 border rounded-md bg-card">
      {!error && (
        <div className="relative w-full max-w-sm aspect-square overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />
          <div className="absolute inset-0 border-2 border-primary/50 m-8 rounded-xl pointer-events-none" />
          <div className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-sm">
            Aponte para o QR Code
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <div className="w-full space-y-2 pt-2 border-t">
        <Label className="text-xs text-muted-foreground">Ou cole a URL da NFC-e</Label>
        <div className="flex gap-2">
          <Input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://..."
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (manualUrl) onScan(manualUrl)
            }}
          >
            Ler
          </Button>
        </div>
      </div>

      <Button variant="outline" onClick={onCancel} className="w-full">
        <X className="mr-2 h-4 w-4" /> Cancelar
      </Button>
    </div>
  )
}
