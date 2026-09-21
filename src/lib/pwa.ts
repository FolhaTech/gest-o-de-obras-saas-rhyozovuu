/**
 * Registro e ciclo de vida do Service Worker da aplicação Gestão de Obras
 */

export interface ServiceWorkerRegistrationStatus {
  isRegistered: boolean
  isUpdateAvailable: boolean
  registration: ServiceWorkerRegistration | null
}

export function registerServiceWorker(onUpdate?: () => void): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  // Registrar após o carregamento da página para não concorrer com o load inicial
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Verificar periodicamente se há nova versão (a cada 1 hora)
        setInterval(
          () => {
            registration.update().catch(() => {})
          },
          60 * 60 * 1000,
        )

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing
          if (!installingWorker) return

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nova versão pronta para assumir
              if (onUpdate) {
                onUpdate()
              }
            }
          })
        })
      })
      .catch((error) => {
        console.warn('[PWA] Falha ao registrar Service Worker:', error)
      })

    // Recarregar suavemente se o controlador do Service Worker mudar
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })
  })
}

export function skipWaitingServiceWorker(): void {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
  }
}
