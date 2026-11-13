/**
 * Reduz a foto antes de enviar: o celular gera fotos de vários MB, e a imagem do item só precisa ser vista na tela.
 * Lado maior até 1600 px, JPEG (PNG continua PNG). Se o navegador não consegue abrir o arquivo (HEIC, por exemplo) ou
 * a redução não ajuda, envia o original.
 */
export const MAX_SIDE = 1600
export const SKIP_BELOW_BYTES = 1_500_000
const QUALITY = 0.85

/** Tamanho final: o lado maior cabe em `max`, mantendo a proporção; imagens menores não mudam. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (!(longest > max)) return { width, height }
  const k = max / longest
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** Nome com a extensão do tipo novo ("foto.heic" -> "foto.jpg"). */
export function renamedFor(name: string, type: string): string {
  const ext = type === 'image/png' ? 'png' : 'jpg'
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name
  return `${base || 'imagem'}.${ext}`
}

/** Devolve a imagem reduzida (ou o próprio arquivo, se não precisar ou não der). Só roda no navegador. */
export async function shrinkImage(file: File): Promise<File> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const size = fitWithin(bitmap.width, bitmap.height)
    const resized = size.width !== bitmap.width || size.height !== bitmap.height
    if (!resized && file.size <= SKIP_BELOW_BYTES) {
      bitmap.close?.()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close?.()
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY))
    if (!blob || (blob.size >= file.size && !resized)) return file
    return new File([blob], renamedFor(file.name, type), { type, lastModified: Date.now() })
  } catch {
    return file
  }
}
