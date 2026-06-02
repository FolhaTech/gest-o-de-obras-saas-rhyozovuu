import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ScannerProps {
  onScan: (text: string) => void
  onCancel: () => void
}

export function Scanner({ onScan, onCancel }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [isSupported, setIsSupported] = useState(true)

  useEffect(() => {
    if (window.isSecureContext === false) {
      setError('A câmera só pode ser acessada em um ambiente seguro (HTTPS).')
      setIsSupported(false)
      return
    }

    if (!('BarcodeDetector' in window)) {
      setIsSupported(false)
      setError(
        'Leitor de QR Code não suportado nativamente. Por favor, digite a URL manualmente abaixo.',
      )
      return
    }

    let stream: MediaStream | null = null
    let interval: NodeJS.Timeout

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }

        const BarcodeDetectorAPI = (window as any).BarcodeDetector
        const detector = new BarcodeDetectorAPI({ formats: ['qr_code'] })

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
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError(
            'Acesso à câmera negado. Por favor, habilite a permissão nas configurações do seu navegador.',
          )
        } else if (err.name === 'NotFoundError') {
          setError('Nenhuma câmera encontrada no dispositivo.')
        } else {
          setError('Erro ao acessar a câmera: ' + err.message)
        }
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
      {!error && isSupported && (
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

      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Aviso</AlertTitle>
          <AlertDescription className="text-xs mt-1">{error}</AlertDescription>
        </Alert>
      )}

      <div className="w-full space-y-2 pt-2 border-t">
        <Label className="text-xs text-muted-foreground">Ou cole a URL da NFC-e</Label>
        <div className="flex gap-2">
          <Input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manualUrl) {
                e.preventDefault()
                onScan(manualUrl)
              }
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (manualUrl) onScan(manualUrl)
            }}
            disabled={!manualUrl}
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
