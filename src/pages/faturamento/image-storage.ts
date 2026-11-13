import { supabase } from '@/lib/supabase/client'
import { IMAGE_BUCKET, imageContentType, itemImagePath, quoteImagePath, validateImage } from '@/lib/item-image'
import { shrinkImage } from '@/lib/resize-image'

export interface UploadedImage {
  path: string
  name: string
}

const friendly = (message?: string) =>
  /row-level security|violates|403|unauthorized/i.test(message ?? '') ? 'Sem permissão para enviar a imagem.' : message || 'Falha no envio.'

/** Confere o tipo, reduz a foto (o celular gera vários MB) e confere o tamanho. Lança Error com a mensagem para o usuário. */
async function prepare(file: File): Promise<{ file: File; type: string }> {
  if (!imageContentType(file)) throw new Error('Envie uma imagem (JPG, PNG, WEBP ou HEIC).')
  const small = await shrinkImage(file)
  const problem = validateImage(small)
  if (problem) throw new Error(problem)
  return { file: small, type: imageContentType(small)! }
}

async function put(path: string, file: File, type: string): Promise<void> {
  // o tipo vem do próprio arquivo: se o navegador não informou (HEIC, por exemplo), regrava com o tipo certo
  const body = file.type === type ? file : new Blob([file], { type })
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, body, { contentType: type, upsert: false })
  if (error) throw new Error(friendly(error.message))
}

/** Envia a imagem do item para a pasta da solicitação. */
export async function uploadItemImage(requestId: string, file: File): Promise<UploadedImage> {
  const p = await prepare(file)
  const path = itemImagePath(requestId, p.file.name, Date.now())
  await put(path, p.file, p.type)
  return { path, name: p.file.name }
}

/** Envia a imagem da cotação para a pasta da cotação. */
export async function uploadQuoteImage(requestId: string, quoteId: string, file: File): Promise<UploadedImage> {
  const p = await prepare(file)
  const path = quoteImagePath(requestId, quoteId, p.file.name, Date.now())
  await put(path, p.file, p.type)
  return { path, name: p.file.name }
}

/** Remove imagens do bucket (sem erro se não der: a imagem sobra só no armazenamento, nunca trava o fluxo). */
export async function removeImages(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p)
  if (list.length === 0) return
  try {
    await supabase.storage.from(IMAGE_BUCKET).remove(list)
  } catch {
    /* sai junto quando a solicitação (ou a cotação) for excluída */
  }
}

/** Baixa a imagem e devolve um endereço temporário para mostrar na tela. Nulo se não foi possível. */
export async function imageObjectUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).download(path)
  if (error || !data) return null
  return URL.createObjectURL(data)
}

/** Abre a imagem em outra aba (a aba abre já no clique, antes de baixar, para o navegador não bloquear). */
export async function openImage(path: string): Promise<string | null> {
  const tab = window.open('', '_blank')
  const url = await imageObjectUrl(path)
  if (!url) {
    tab?.close()
    return 'Não foi possível abrir a imagem.'
  }
  if (tab) tab.location.href = url
  else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
  return null
}
