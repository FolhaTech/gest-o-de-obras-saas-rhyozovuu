import { useState } from 'react'
import {
  Download,
  Share,
  PlusSquare,
  CheckCircle2,
  Smartphone,
  Check,
  ChevronRight,
  HardHat,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { usePwaInstall } from '@/hooks/use-pwa-install'

interface InstallAppButtonProps {
  variant?: 'header' | 'sidebar' | 'inline'
  className?: string
}

export function InstallAppButton({ variant = 'header', className }: InstallAppButtonProps) {
  const { isInstalled, isIOS, canPromptDirectly, promptInstall } = usePwaInstall()
  const [modalOpen, setModalOpen] = useState(false)
  const [justInstalled, setJustInstalled] = useState(false)

  // Se já está instalado e rodando em modo standalone, esconde o botão para não poluir
  if (isInstalled && !justInstalled) {
    return null
  }

  const handleClick = async () => {
    if (canPromptDirectly) {
      const outcome = await promptInstall()
      if (outcome === 'accepted') {
        setJustInstalled(true)
      }
    } else {
      // Abre modal explicativo (para iOS ou instruções de desktop)
      setModalOpen(true)
    }
  }

  return (
    <>
      {variant === 'header' && (
        <Button
          onClick={handleClick}
          size="sm"
          variant="outline"
          className={`h-8 px-2.5 sm:px-3 text-xs gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10 hover:text-primary transition-all ${className || ''}`}
          title="Instalar Gestão de Obras no celular ou computador"
        >
          <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
          <span className="hidden xs:inline sm:inline">Instalar App</span>
        </Button>
      )}

      {variant === 'sidebar' && (
        <button
          onClick={handleClick}
          type="button"
          className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group border border-sidebar-border/50 bg-sidebar-accent/30 ${className || ''}`}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Download className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col items-start text-left flex-1 min-w-0">
            <span className="truncate font-semibold text-foreground">Instalar no Celular</span>
            <span className="truncate text-[10px] text-muted-foreground">
              Acesso rápido offline
            </span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        </button>
      )}

      {variant === 'inline' && (
        <Button onClick={handleClick} size="sm" className={`gap-2 ${className || ''}`}>
          <Download className="h-4 w-4" /> Instalar Aplicativo
        </Button>
      )}

      {/* Modal com orientações claras para celulares (iOS e navegadores) */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <HardHat className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-lg">Instalar Gestão de Obras</DialogTitle>
                <DialogDescription className="text-xs">
                  Adicione à tela inicial do seu celular para usar como um app nativo.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {isIOS ? (
              /* Instruções específicas para iPhone / iPad no Safari */
              <div className="rounded-lg border bg-muted/40 p-3.5 space-y-3 text-sm">
                <p className="font-semibold text-foreground flex items-center gap-1.5 text-xs text-primary uppercase tracking-wider">
                  Como instalar no iPhone / iPad (Safari):
                </p>
                <ol className="space-y-2.5 text-xs text-muted-foreground list-decimal list-inside pl-1">
                  <li className="leading-relaxed">
                    Toque no botão{' '}
                    <strong className="text-foreground inline-flex items-center gap-1">
                      <Share className="h-3.5 w-3.5 text-primary inline" /> Compartilhar
                    </strong>{' '}
                    na barra inferior do Safari.
                  </li>
                  <li className="leading-relaxed">
                    Role as opções e toque em{' '}
                    <strong className="text-foreground inline-flex items-center gap-1">
                      <PlusSquare className="h-3.5 w-3.5 text-primary inline" /> Adicionar à Tela de
                      Início
                    </strong>
                    .
                  </li>
                  <li className="leading-relaxed">
                    Confirme tocando em <strong className="text-foreground">Adicionar</strong> no
                    canto superior direito.
                  </li>
                </ol>
              </div>
            ) : (
              /* Instruções para Android / Chrome / Outros navegadores */
              <div className="rounded-lg border bg-muted/40 p-3.5 space-y-3 text-sm">
                <p className="font-semibold text-foreground flex items-center gap-1.5 text-xs text-primary uppercase tracking-wider">
                  Como instalar no Android ou computador:
                </p>
                <ol className="space-y-2.5 text-xs text-muted-foreground list-decimal list-inside pl-1">
                  <li className="leading-relaxed">
                    Abra o menu de opções do navegador (os{' '}
                    <strong className="text-foreground">três pontinhos ⋮</strong> no canto superior
                    ou inferior).
                  </li>
                  <li className="leading-relaxed">
                    Selecione a opção{' '}
                    <strong className="text-foreground">"Instalar aplicativo"</strong> ou{' '}
                    <strong className="text-foreground">"Adicionar à tela inicial"</strong>.
                  </li>
                  <li className="leading-relaxed">
                    Confirme a instalação para abrir o app direto pelo ícone na sua área de trabalho
                    ou gaveta de apps.
                  </li>
                </ol>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border p-2.5 flex items-start gap-2 bg-background">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Carregamento ultrarrápido</span>
              </div>
              <div className="rounded border p-2.5 flex items-start gap-2 bg-background">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Funciona com internet oscilante</span>
              </div>
            </div>

            <Button className="w-full mt-2" onClick={() => setModalOpen(false)}>
              <Check className="h-4 w-4 mr-1.5" /> Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
