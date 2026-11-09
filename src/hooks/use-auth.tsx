import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import { AppRole, normalizeRole, canAccessPath, canSeeValuesFor } from '@/lib/roles'

export type Profile = Database['public']['Tables']['profiles']['Row'] & {
  /** Membro da equipe vinculado ao usuário (definido por um administrador). */
  team_member_id?: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  role: AppRole
  /** Só o administrador vê valores (R$); Gestor e Prestador não. */
  canSeeValues: boolean
  canAccess: (pathname: string) => boolean
  refreshProfile: () => Promise<void>
  signUp: (email: string, password: string) => Promise<{ data: any; error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  resetPasswordForEmail: (email: string, redirectTo?: string) => Promise<{ error: any }>
  updatePassword: (password: string) => Promise<{ error: any }>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (!error && data) {
        setProfile(data)
      } else if (error) {
        // Table may not exist yet or profile row hasn't been created
        console.warn('[useAuth] Could not load profile:', error.message)
      }
    } catch (err) {
      console.warn('[useAuth] Exception loading profile:', err)
    }
  }

  const applySession = (session: Session | null) => {
    setSession(session)
    setUser(session?.user ?? null)
    if (session?.user) {
      fetchProfile(session.user.id)
    } else {
      setProfile(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Recover any session persisted in localStorage on first load.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        applySession(session)
      })
      .catch((err) => {
        console.warn('[useAuth] Error getting initial session:', err)
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    return { data, error }
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data?.user) {
      // Registra o último login do usuário em public.profiles (last_login_at).
      // Tolerante a falha: nunca bloqueia o login se o update falhar.
      try {
        await supabase
          .from('profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', data.user.id)
      } catch (err) {
        console.warn('[useAuth] Could not update last_login_at:', err)
      }
    }
    return { error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const resetPasswordForEmail = async (email: string, redirectTo?: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo || `${window.location.origin}/reset-password`,
    })
    return { error }
  }

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  }

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }

  const role: AppRole = normalizeRole(profile?.role || (user?.user_metadata?.role as string))
  const canAccess = (pathname: string) => canAccessPath(role, pathname)
  const canSeeValues = canSeeValuesFor(role)

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        canSeeValues,
        canAccess,
        refreshProfile,
        signUp,
        signIn,
        signOut,
        resetPasswordForEmail,
        updatePassword,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
