import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string)?.trim()
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string)?.trim()

const DEFAULT_SUPABASE_URL = 'https://lsvqvfvkoilxhjefrqvq.supabase.co'

// Fail fast with a clear message when the Supabase connection is not configured.
// The app needs both the project URL and the public anon (publishable) key.
// Passing an empty/invalid key to createClient surfaces as a confusing
// "invalid api key" error at runtime, so we validate before constructing.
const isJwtLike = (key: string) => key.split('.').length === 3 && key.length > 40

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !isJwtLike(SUPABASE_PUBLISHABLE_KEY)) {
  const problems: string[] = []
  if (!SUPABASE_URL) problems.push('VITE_SUPABASE_URL ausente')
  if (!SUPABASE_PUBLISHABLE_KEY) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY ausente')
  else if (!isJwtLike(SUPABASE_PUBLISHABLE_KEY))
    problems.push('VITE_SUPABASE_PUBLISHABLE_KEY não parece ser uma chave anon (JWT) válida')
  console.error(
    `[Supabase] Configuração inválida: ${problems.join('; ')}. ` +
      `Defina VITE_SUPABASE_URL (${DEFAULT_SUPABASE_URL}) e a ` +
      'VITE_SUPABASE_PUBLISHABLE_KEY (anon key pública do projeto) no ambiente.',
  )
}

// Import the supabase client like this:
// import { supabase } from "@/lib/supabase/client";
export const supabase = createClient<Database>(
  SUPABASE_URL || DEFAULT_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY || 'INVALID_KEY',
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
