/**
 * Financeiro > Compras: imagem do item no pedido e imagem em cada cotação. As imagens ficam no bucket PRIVADO
 * "purchase-images", em duas pastas por solicitação ("<id>/item/<arquivo>" e "<id>/quotes/<id da cotação>/<arquivo>").
 * As regras valem de novo no banco (migração 28).
 */
import { formatFileSize, safeFileName, type FileLike } from './invoice-file'

export const IMAGE_BUCKET = 'purchase-images'
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
/** Para o campo de arquivo: fotos, inclusive da câmera do celular. */
export const IMAGE_ACCEPT = 'image/*'

const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}
const ALLOWED = new Set(Object.values(BY_EXTENSION))
const ALIASES: Record<string, string> = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' }

const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.trim().toLowerCase() : '')

/**
 * Tipo da imagem aceito pelo banco: o do navegador ou, quando vem vazio (HEIC, alguns celulares), o da extensão.
 * Nulo se não é uma imagem aceita (PDF e GIF, por exemplo, não valem).
 */
export function imageContentType(file: Pick<FileLike, 'name' | 'type'>): string | null {
  const raw = (file.type ?? '').trim().toLowerCase()
  const fromBrowser = ALIASES[raw] ?? raw
  if (ALLOWED.has(fromBrowser)) return fromBrowser
  const fromName = BY_EXTENSION[extensionOf(file.name)]
  if (fromName && (raw === '' || raw === 'application/octet-stream')) return fromName
  return null
}

/** Mensagem de erro para o usuário, ou nulo se a imagem serve. */
export function validateImage(file: FileLike): string | null {
  if (!file.size) return 'O arquivo está vazio.'
  if (file.size > IMAGE_MAX_BYTES) {
    return `A imagem tem ${formatFileSize(file.size)}. O limite é ${formatFileSize(IMAGE_MAX_BYTES)}.`
  }
  if (!imageContentType(file)) return 'Envie uma imagem (JPG, PNG, WEBP ou HEIC).'
  return null
}

/** Caminho da imagem do item: "<id da solicitação>/item/<momento>-<nome seguro>". */
export const itemImagePath = (requestId: string, fileName: string, now: number): string =>
  `${requestId}/item/${now}-${safeFileName(fileName, 'imagem')}`

/** Caminho da imagem da cotação: "<id da solicitação>/quotes/<id da cotação>/<momento>-<nome seguro>". */
export const quoteImagePath = (requestId: string, quoteId: string, fileName: string, now: number): string =>
  `${requestId}/quotes/${quoteId}/${now}-${safeFileName(fileName, 'imagem')}`

/** O caminho é da pasta de item desta solicitação (o banco confere de novo). */
export const isItemImageOf = (path: string | null | undefined, requestId: string): boolean =>
  !!path && path.startsWith(`${requestId}/item/`) && !path.slice(requestId.length + 6).includes('/')

/** O caminho é da pasta desta cotação (o banco confere de novo). */
export const isQuoteImageOf = (path: string | null | undefined, requestId: string, quoteId: string): boolean => {
  const prefix = `${requestId}/quotes/${quoteId}/`
  return !!path && path.startsWith(prefix) && !path.slice(prefix.length).includes('/')
}
