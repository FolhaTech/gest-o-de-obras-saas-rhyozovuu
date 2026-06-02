import { supabase } from '@/lib/supabase/client'

export async function parseReceiptUrl(url: string) {
  const { data, error } = await supabase.functions.invoke('parse-receipt', {
    body: { url },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return data
}
