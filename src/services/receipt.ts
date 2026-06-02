import { supabase } from '@/lib/supabase/client'

export async function parseReceiptUrl(data: { url?: string; image?: string }) {
  const { data: result, error } = await supabase.functions.invoke('parse-receipt', {
    body: data,
  })

  if (error) throw error
  if (result?.error) throw new Error(result.error)

  return result
}
