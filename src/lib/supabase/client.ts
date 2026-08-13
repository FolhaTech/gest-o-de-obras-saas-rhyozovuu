import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

// Fail fast with a clear message when the Supabase connection is not configured.
// The app needs both the project URL and the public anon (publishable) key.
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  const missing = [
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SUPABASE_PUBLISHABLE_KEY && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ]
    .filter(Boolean)
    .join(', ')
  console.error(
    `[Supabase] Configuração incompleta. Variável(is) ausente(s): ${missing}. ` +
      'Defina VITE_SUPABASE_URL (https://lsvqvfvkoilxhjefrqvq.supabase.co) e a ' +
      'VITE_SUPABASE_PUBLISHABLE_KEY (anon key pública do projeto) no ambiente.',
  )
}

// Import the supabase client like this:
// import { supabase } from "@/lib/supabase/client";
export const supabase = createClient<Database>(
  SUPABASE_URL ?? 'https://lsvqvfvkoilxhjefrqvq.supabase.co',
  SUPABASE_PUBLISHABLE_KEY ?? '',
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
