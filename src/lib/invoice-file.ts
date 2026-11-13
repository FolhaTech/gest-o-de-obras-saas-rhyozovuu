/**
 * Faturamento > Compras: foto ou PDF da nota fiscal. O arquivo fica no bucket PRIVADO "purchase-invoices", na pasta
 * da solicitação ("<id da solicitação>/<arquivo>"). As regras valem de novo no banco (migração 25).
 */
export const INVOICE_BUCKET = 'purchase-invoices'
export const INVOICE_MAX_BYTES = 15 * 1024 * 1024
/** Para o campo de arquivo: fotos (inclusive da câmera do celular) e PDF. */
export const INVOICE_ACCEPT = 'image/*,application/pdf'

const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}
const ALLOWED = new Set(Object.values(BY_EXTENSION))
const ALIASES: Record<string, string> = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'application/x-pdf': 'application/pdf' }

export interface FileLike {
  name: string
  type?: string
  size: number
}

const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.trim().toLowerCase() : '')

/**
 * Tipo do arquivo aceito pelo banco: o do navegador, ou, quando vem vazio (acontece com HEIC e com alguns celulares),
 * o da extensão. Nulo se não é PDF nem imagem aceita.
 */
export function invoiceContentType(file: Pick<FileLike, 'name' | 'type'>): string | null {
  const raw = (file.type ?? '').trim().toLowerCase()
  const fromBrowser = ALIASES[raw] ?? raw
  if (ALLOWED.has(fromBrowser)) return fromBrowser
  const fromName = BY_EXTENSION[extensionOf(file.name)]
  // tipo genérico ou vazio: confia na extensão; tipo específico mas fora da lista (ex.: image/gif): recusa
  if (fromName && (raw === '' || raw === 'application/octet-stream')) return fromName
  return null
}

/** Mensagem de erro para o usuário, ou nulo se o arquivo serve. */
export function validateInvoiceFile(file: FileLike): string | null {
  if (!file.size) return 'O arquivo está vazio.'
  if (file.size > INVOICE_MAX_BYTES) {
    return `O arquivo tem ${formatFileSize(file.size)}. O limite é ${formatFileSize(INVOICE_MAX_BYTES)}.`
  }
  if (!invoiceContentType(file)) return 'Envie uma foto (JPG, PNG, WEBP ou HEIC) ou um PDF.'
  return null
}

/** Nome sem acento nem símbolos, que não quebra o caminho no storage. Mantém a extensão. */
export function safeFileName(name: string): string {
  const cleaned = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
  if (!cleaned) return 'nota'
  const ext = extensionOf(cleaned)
  if (cleaned.length <= 80) return cleaned
  const base = cleaned.slice(0, cleaned.length - (ext ? ext.length + 1 : 0))
  return ext ? `${base.slice(0, 80 - ext.length - 1)}.${ext}` : base.slice(0, 80)
}

/** Caminho no bucket: "<id da solicitação>/<momento>-<nome seguro>" (o momento evita sobrescrever ao trocar o arquivo). */
export function invoicePath(requestId: string, fileName: string, now: number): string {
  return `${requestId}/${now}-${safeFileName(fileName)}`
}

/** O caminho pertence a esta solicitação (o banco confere de novo). */
export const belongsToRequest = (path: string | null | undefined, requestId: string): boolean =>
  !!path && path.startsWith(`${requestId}/`) && !path.slice(requestId.length + 1).includes('/')

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}
