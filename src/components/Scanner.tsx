import { useEffect, useRef, useState, ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, AlertCircle, Camera, Image as ImageIcon, Keyboard, Upload, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ScannerProps {
  onScan: (data: { url?: string; image?: string }) => void
  onCancel: () => void
}

export function Scanner({ onScan, onCancel }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const [activeTab, setActiveTab] = useState('camera')
  const [isProcessingFile, setIsProcessingFile] = useState(false)

  useEffect(() => {
    let currentStream: MediaStream | null = null
    let interval: NodeJS.Timeout

    const startCamera = async () => {
      if (activeTab !== 'camera') return

      if (window.isSecureContext === false) {
        setError('A câmera só pode ser acessada em um ambiente seguro (HTTPS).')
        setIsSupported(false)
        setActiveTab('image')
        return
      }

      if (!('mediaDevices' in navigator) || !('getUserMedia' in navigator.mediaDevices)) {
        setIsSupported(false)
        setError('Acesso à câmera não suportado neste navegador.')
        setActiveTab('image')
        return
      }

      try {
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = currentStream
          videoRef.current.play()
        }

        const BarcodeDetectorAPI = (window as any).BarcodeDetector
        if (BarcodeDetectorAPI) {
          const detector = new BarcodeDetectorAPI({ formats: ['qr_code'] })
          interval = setInterval(async () => {
            if (
              videoRef.current &&
              videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
            ) {
              try {
                const barcodes = await detector.detect(videoRef.current)
                if (barcodes.length > 0) {
                  onScan({ url: barcodes[0].rawValue })
                  if (interval) clearInterval(interval)
                  if (currentStream) currentStream.getTracks().forEach((t) => t.stop())
                }
              } catch (err) {
                console.error('Barcode detection error:', err)
              }
            }
          }, 500)
        } else {
          setIsSupported(false)
          setError(
            'Leitor de QR Code não suportado nativamente pelo navegador. Use o upload da imagem.',
          )
          setActiveTab('image')
          if (currentStream) currentStream.getTracks().forEach((t) => t.stop())
        }
      } catch (err: any) {
        setIsSupported(false)
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError(
            'Acesso à câmera negado. Por favor, habilite a permissão nas configurações ou faça o upload da imagem.',
          )
        } else if (err.name === 'NotFoundError') {
          setError('Nenhuma câmera encontrada no dispositivo.')
        } else {
          setError('Erro ao acessar a câmera: ' + err.message)
        }
        setActiveTab('image')
      }
    }

    startCamera()

    return () => {
      if (currentStream) currentStream.getTracks().forEach((t) => t.stop())
      if (interval) clearInterval(interval)
    }
  }, [activeTab, onScan])

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingFile(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64 = event.target?.result as string

      const BarcodeDetectorAPI = (window as any).BarcodeDetector
      if (BarcodeDetectorAPI) {
        try {
          const img = new Image()
          img.src = base64
          await new Promise((resolve) => {
            img.onload = resolve
          })
          const detector = new BarcodeDetectorAPI({ formats: ['qr_code'] })
          const barcodes = await detector.detect(img)
          if (barcodes.length > 0) {
            onScan({ url: barcodes[0].rawValue })
            setIsProcessingFile(false)
            return
          }
        } catch (e) {
          console.error('Local barcode detection failed, falling back to edge function', e)
        }
      }

      onScan({ image: base64 })
      setIsProcessingFile(false)
    }
    reader.onerror = () => setIsProcessingFile(false)
    reader.readAsDataURL(file)
  }

  const handleManualSubmit = () => {
    if (manualUrl) onScan({ url: manualUrl })
  }

  return (
    <div className="flex flex-col space-y-4 p-4 border rounded-md bg-card w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="camera" disabled={!isSupported && activeTab !== 'camera'}>
            <Camera className="w-4 h-4 mr-2 hidden sm:block" />
            Câmera
          </TabsTrigger>
          <TabsTrigger value="image">
            <ImageIcon className="w-4 h-4 mr-2 hidden sm:block" />
            Imagem
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Keyboard className="w-4 h-4 mr-2 hidden sm:block" />
            Manual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="camera" className="mt-0">
          <div className="flex flex-col items-center justify-center space-y-4">
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
                {activeTab === 'camera' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => setActiveTab('image')}
                  >
                    Fazer Upload de Imagem
                  </Button>
                )}
              </Alert>
            )}
          </div>
        </TabsContent>

        <TabsContent value="image" className="mt-0">
          <div className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed rounded-md bg-secondary/20 hover:bg-secondary/30 transition-colors">
            <ImageIcon className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm text-center mb-4 text-muted-foreground">
              Faça upload de uma foto da nota fiscal ou QR Code (JPEG/PNG)
            </p>
            <div className="relative">
              <Input
                type="file"
                accept="image/jpeg,image/png"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileUpload}
                disabled={isProcessingFile}
              />
              <Button variant="secondary" disabled={isProcessingFile}>
                {isProcessingFile ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {isProcessingFile ? 'Lendo...' : 'Selecionar Imagem'}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="manual" className="mt-0">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL da NFC-e ou Chave de Acesso</Label>
              <Input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://... ou chave de 44 dígitos"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualUrl) {
                    e.preventDefault()
                    handleManualSubmit()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Cole a URL completa do QR Code ou a chave de 44 dígitos impressa no cupom.
              </p>
            </div>
            <Button className="w-full" onClick={handleManualSubmit} disabled={!manualUrl}>
              Consultar Dados
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Button variant="ghost" onClick={onCancel} className="w-full">
        <X className="mr-2 h-4 w-4" /> Cancelar
      </Button>
    </div>
  )
}
