import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Building2, ArrowLeft, MailCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [resending, setResending] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleResend = async () => {
    if (!email) {
      toast({
        title: 'Email não informado',
        description: 'Preencha o campo de email para reenviar a confirmação.',
        variant: 'destructive',
      })
      return
    }
    setResending(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    setResending(false)
    if (error) {
      const msg = error.message || ''
      const lower = msg.toLowerCase()
      if (lower.includes('failed to fetch')) {
        toast({
          title: 'Erro de conexão',
          description: 'Não foi possível contatar o Supabase para reenviar o email.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Não foi possível reenviar',
          description: msg,
          variant: 'destructive',
        })
      }
    } else {
      toast({
        title: 'Email reenviado',
        description: `Enviamos um novo email de confirmação para ${email}.`,
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast({ title: 'Erro', description: 'As senhas não coincidem.', variant: 'destructive' })
      return
    }
    if (password.length < 6) {
      toast({
        title: 'Erro',
        description: 'A senha deve ter no mínimo 6 caracteres.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    const { error, data } = await signUp(email, password)
    setLoading(false)

    if (error) {
      const msg = error.message || ''
      const lower = msg.toLowerCase()
      if (lower.includes('failed to fetch')) {
        toast({
          title: 'Erro de conexão',
          description:
            'Não foi possível conectar ao Supabase para criar sua conta. Verifique sua chave de API e conexão de rede.',
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Erro ao criar conta', description: msg, variant: 'destructive' })
      }
      return
    }

    // If email confirmation is disabled, the user is signed in immediately.
    if (data?.session) {
      toast({
        title: 'Conta criada com sucesso!',
        description: 'Bem-vindo ao sistema. Redirecionando...',
      })
      navigate('/')
    } else {
      // Email confirmation required by Supabase project settings.
      setSuccess(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Criar Conta</CardTitle>
          <CardDescription>
            {success
              ? 'Verifique sua caixa de entrada.'
              : 'Preencha os dados abaixo para criar sua conta no sistema.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Enviamos um email de confirmação para <strong>{email}</strong>. Confirme seu email
                para liberar o acesso ao sistema.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={resending}
                onClick={handleResend}
              >
                <MailCheck className="mr-2 h-4 w-4" />
                {resending ? 'Enviando...' : 'Reenviar email de confirmação'}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Ir para o Login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email Corporativo</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu.email@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 text-base font-medium"
                disabled={loading}
              >
                {loading ? 'Criando conta...' : 'Criar Conta'}
              </Button>
            </form>
          )}
        </CardContent>
        {!success && (
          <CardFooter className="flex justify-center border-t p-4">
            <Link
              to="/login"
              className="flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Já tem conta? Fazer login
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
