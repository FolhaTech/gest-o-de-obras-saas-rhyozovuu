import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string)?.trim() ||
  'https://lsvqvfvkoilxhjefrqvq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string)?.trim() ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdnF2ZnZrb2lseGhqZWZycXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDIxMTgsImV4cCI6MjEwMjIxODExOH0.zO2BdAJgN6-TEp2U__prUuRyUMZ-CE5TlfbiDMtkj9Q'

const DEFAULT_SUPABASE_URL = 'https://lsvqvfvkoilxhjefrqvq.supabase.co'

// Fail fast with a clear message when the Supabase connection is not configured.
// The app needs both the project URL and the public anon (publishable) key.
// Passing an empty/invalid key to createClient surfaces as a confusing
// "invalid api key" error at runtime, so we validate before constructing.
const isJwtLike = (key: string) => {
  if (!key) return false
  // Legacy anon keys are 3-part JWTs, newer supabase keys can also start with sb_ or eyJ
  return (
    (key.split('.').length === 3 && key.length > 30) ||
    (key.startsWith('sb_') && key.length > 20) ||
    key.startsWith('eyJ')
  )
}

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_PUBLISHABLE_KEY !== 'INVALID_KEY',
)

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !isJwtLike(SUPABASE_PUBLISHABLE_KEY)) {
  const problems: string[] = []
  if (!SUPABASE_URL) problems.push('VITE_SUPABASE_URL ausente')
  if (!SUPABASE_PUBLISHABLE_KEY)
    problems.push('VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY ausente')
  else if (!isJwtLike(SUPABASE_PUBLISHABLE_KEY)) problems.push('Chave Supabase com formato incomum')
  console.warn(
    `[Supabase] Verificação de configuração: ${problems.join('; ')}. ` +
      `URL: ${SUPABASE_URL || DEFAULT_SUPABASE_URL}`,
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
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        'x-client-info': 'gestao-obras-saas',
      },
    },
  },
)
