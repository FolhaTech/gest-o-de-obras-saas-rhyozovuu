import { supabase } from '@/lib/supabase/client'
import { INVOICE_BUCKET, invoiceContentType, invoicePath, validateInvoiceFile } from '@/lib/invoice-file'

export interface UploadedInvoice {
  path: string
  name: string
  type: string
}

const friendly = (message?: string) =>
  /row-level security|violates|403|unauthorized/i.test(message ?? '') ? 'Sem permissão para enviar a nota fiscal.' : message || 'Falha no envio.'

/** Envia a foto/PDF da nota para a pasta da solicitação. Lança Error com a mensagem para o usuário. */
export async function uploadInvoice(requestId: string, file: File): Promise<UploadedInvoice> {
  const problem = validateInvoiceFile(file)
  if (problem) throw new Error(problem)
  const type = invoiceContentType(file)!
  const path = invoicePath(requestId, file.name, Date.now())
  // o tipo vem do próprio arquivo: se o navegador não informou (HEIC, por exemplo), regrava com o tipo certo
  const body = file.type === type ? file : new Blob([file], { type })
  const { error } = await supabase.storage.from(INVOICE_BUCKET).upload(path, body, { contentType: type, upsert: false })
  if (error) throw new Error(friendly(error.message))
  return { path, name: file.name, type }
}

/** Remove arquivos do bucket (sem erro se não der: o arquivo some só da tela, nunca trava o fluxo). */
export async function removeInvoiceFiles(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p)
  if (list.length === 0) return
  try {
    await supabase.storage.from(INVOICE_BUCKET).remove(list)
  } catch {
    /* ficou um arquivo solto na pasta da solicitação; ele sai junto quando ela for excluída */
  }
}

/**
 * Abre a nota em outra aba (PDF e imagem abrem no navegador). A aba é aberta já no clique, antes de baixar,
 * para o navegador não bloquear. Se não der para abrir, baixa o arquivo.
 */
export async function openInvoice(path: string, fileName?: string | null): Promise<string | null> {
  const tab = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(INVOICE_BUCKET).download(path)
  if (error || !data) {
    tab?.close()
    return 'Não foi possível abrir a nota fiscal.'
  }
  const url = URL.createObjectURL(data)
  if (tab) {
    tab.location.href = url
  } else {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName || 'nota-fiscal'
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
  return null
}
