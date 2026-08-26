import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useNavigate, Link } from 'react-router-dom'
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
import { Building2, MailCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [showResend, setShowResend] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      const message = error.message || ''
      const lowerMsg = message.toLowerCase()
      const isEmailNotConfirmed = lowerMsg.includes('email not confirmed')
      const isFailedToFetch = lowerMsg.includes('failed to fetch') || lowerMsg.includes('network')
      const isInvalidCredentials =
        lowerMsg.includes('invalid login credentials') ||
        lowerMsg.includes('invalid credentials') ||
        lowerMsg.includes('invalid grant')

      if (isEmailNotConfirmed) {
        setShowResend(true)
        toast({
          title: 'Email não confirmado',
          description:
            'Sua conta foi criada, mas o email ainda não foi confirmado. Você pode confirmar pelo link recebido por email ou via SQL no Supabase.',
          variant: 'destructive',
        })
      } else if (isFailedToFetch) {
        toast({
          title: 'Erro de conexão com o Supabase',
          description:
            'Não foi possível conectar ao servidor. Verifique a URL do projeto e sua conexão de rede.',
          variant: 'destructive',
        })
      } else if (isInvalidCredentials) {
        toast({
          title: 'Credenciais inválidas',
          description:
            'Email ou senha incorretos. Se acabou de criar a conta, certifique-se de que o email está confirmado.',
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Erro ao autenticar', description: message, variant: 'destructive' })
      }
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  const handleResend = async () => {
    if (!email) {
      toast({
        title: 'Informe seu email',
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Gestão de Obras SaaS</CardTitle>
          <CardDescription>Entre com suas credenciais para acessar o painel</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email Corporativo</Label>
              <Input
                id="email"
                type="email"
                placeholder="fernando.andrade@folhatech.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loading}>
              {loading ? 'Autenticando...' : 'Acessar Sistema'}
            </Button>
          </form>
          {showResend && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 text-base font-medium mt-4"
              disabled={resending}
              onClick={handleResend}
            >
              <MailCheck className="mr-2 h-4 w-4" />
              {resending ? 'Enviando...' : 'Reenviar email de confirmação'}
            </Button>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t p-4">
          <p className="text-sm text-muted-foreground text-center">Ainda não tem uma conta?</p>
          <Button asChild variant="default" className="w-full h-11 text-base font-medium">
            <Link to="/signup">Criar Conta</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
