import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Brain, CheckCircle2, Clock, Hourglass, Lightbulb, Loader2, MessageSquarePlus, Rocket, Sparkles, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatSupabaseError } from '@/lib/formatters'
import {
  MAX_REASON,
  NOTE_FROM_LABEL,
  REFUSE_TITLE,
  forecastText,
  reasonProblem,
  type AiNote,
  type NoteFrom,
  type ScheduleAnalysis,
} from '@/lib/schedule-ai'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Refusal {
  from: NoteFrom
  /** Etapas da sugestão que o responsável não vai seguir (um item, ou o grupo todo). */
  stages: { id: string; name: string }[]
}

const clock = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Cronograma: a IA analisa as etapas e sugere o que fazer com prioridade, o que pode andar junto e o que pode ficar
 * para depois, para entregar a obra o mais rápido possível. Se o responsável não seguir uma sugestão, ele informa o
 * motivo (fica guardado) e a IA refaz o plano adaptado a isso.
 */
export default function ScheduleAiPanel({ obraId }: { obraId: string }) {
  const { toast } = useToast()
  const [result, setResult] = useState<ScheduleAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<AiNote[]>([])
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [reason, setReason] = useState('')
  const [general, setGeneral] = useState('')
  const [saving, setSaving] = useState(false)

  const loadNotes = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('schedule_ai_notes' as any)
      .select('*')
      .eq('work_id', obraId)
      .eq('active', true)
      .order('created_at', { ascending: false })
    if (!err) setNotes((data ?? []) as unknown as AiNote[])
  }, [obraId])

  useEffect(() => {
    setResult(null)
    setError(null)
    loadNotes()
  }, [loadNotes])

  const analyze = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.functions.invoke('analyze-schedule', { body: { workId: obraId } })
    setLoading(false)
    const body = data as (ScheduleAnalysis & { error?: string }) | null
    if (err || !body) {
      setError('Não foi possível analisar o cronograma agora. Tente de novo em instantes.')
      return
    }
    if (body.error) {
      setError(body.error)
      return
    }
    setResult(body)
  }, [obraId])

  const openRefusal = (from: NoteFrom, stages: { id: string; name: string }[]) => {
    setReason('')
    setRefusal({ from, stages })
  }

  const confirmRefusal = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!refusal) return
    const problem = reasonProblem(reason)
    if (problem) {
      toast({ title: 'Informe o motivo', description: problem, variant: 'destructive' })
      return
    }
    setSaving(true)
    const rows = refusal.stages.map((s) => ({ work_id: obraId, stage_id: s.id, kind: 'rejected', from_list: refusal.from, reason: reason.trim() }))
    const { error: err } = await supabase.from('schedule_ai_notes' as any).insert(rows)
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao guardar o motivo', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    setRefusal(null)
    await loadNotes()
    toast({ title: 'Motivo guardado', description: 'A IA vai refazer o plano levando isso em conta.' })
    await analyze()
  }

  const addConstraint = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const problem = reasonProblem(general)
    if (problem) {
      toast({ title: 'Informe a restrição', description: problem, variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('schedule_ai_notes' as any).insert({ work_id: obraId, kind: 'constraint', reason: general.trim() })
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao guardar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    setGeneral('')
    await loadNotes()
    await analyze()
  }

  const removeNote = async (note: AiNote) => {
    const { error: err } = await supabase.from('schedule_ai_notes' as any).update({ active: false }).eq('id', note.id)
    if (err) {
      toast({ title: 'Erro ao remover', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    await loadNotes()
    if (result) await analyze()
  }

  const refuseButton = (from: NoteFrom, stages: { id: string; name: string }[]) => (
    <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" disabled={loading} onClick={() => openRefusal(from, stages)}>
      Não vou seguir
    </Button>
  )

  const fText = result ? forecastText(result.forecast) : null

  return (
    <Card className="border-violet-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-5 w-5 text-violet-600" /> Prioridades com IA
            </CardTitle>
            <CardDescription>
              A IA analisa as etapas e sugere o que fazer primeiro, o que pode andar junto e o que pode esperar, para entregar a obra o mais rápido possível.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-2" disabled={loading} onClick={analyze}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Analisando...' : result ? 'Analisar de novo' : 'Analisar com IA'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!result && !loading && !error && (
          <p className="text-sm text-muted-foreground">
            Clique em "Analisar com IA". Se você não for seguir alguma sugestão, informe o motivo: a IA se adapta e refaz o plano.
          </p>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={result.source === 'ai' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-amber-300 bg-amber-50 text-amber-800'}>
                {result.source === 'ai' ? 'Análise da IA' : 'Análise por regras'}
              </Badge>
              <span>feita em {clock(result.generated_at)}</span>
              {result.notes_used > 0 && <span>· considera {result.notes_used} observação(ões) sua(s)</span>}
            </div>

            {result.notice && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <AlertDescription>{result.notice}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p>{result.summary}</p>
              {fText && !result.summary.includes('Previsão de término') && <p className="mt-1 font-medium">{fText}</p>}
            </div>

            {result.adaptation && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-medium">Como a IA se adaptou ao que você informou</p>
                <p className="mt-0.5">{result.adaptation}</p>
              </div>
            )}

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Rocket className="h-4 w-4 text-rose-600" /> Fazer primeiro
              </h3>
              {result.do_first.length === 0 && <p className="text-sm text-muted-foreground">Nada urgente.</p>}
              <ol className="space-y-2">
                {result.do_first.map((i, n) => (
                  <li key={i.id} className="flex items-start justify-between gap-3 rounded-md border p-2.5 text-sm">
                    <div>
                      <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-semibold text-white">{n + 1}</span>
                      <span className="font-medium">{i.name}</span>
                      <p className="mt-0.5 text-xs text-muted-foreground">{i.reason}</p>
                    </div>
                    {refuseButton('do_first', [{ id: i.id, name: i.name }])}
                  </li>
                ))}
              </ol>
            </section>

            {result.in_parallel.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-sky-600" /> Pode andar em paralelo
                </h3>
                {result.in_parallel.map((g, k) => (
                  <div key={k} className="flex items-start justify-between gap-3 rounded-md border p-2.5 text-sm">
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.names.map((n) => <Badge key={n} variant="secondary" className="font-normal">{n}</Badge>)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{g.reason}</p>
                    </div>
                    {refuseButton('in_parallel', g.ids.map((id, j) => ({ id, name: g.names[j] })))}
                  </div>
                ))}
              </section>
            )}

            {result.can_wait.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Hourglass className="h-4 w-4 text-emerald-600" /> Pode ficar para depois
                </h3>
                <ul className="space-y-2">
                  {result.can_wait.map((i) => (
                    <li key={i.id} className="flex items-start justify-between gap-3 rounded-md border p-2.5 text-sm">
                      <div>
                        <span className="font-medium">{i.name}</span>
                        <p className="mt-0.5 text-xs text-muted-foreground">{i.reason}</p>
                      </div>
                      {refuseButton('can_wait', [{ id: i.id, name: i.name }])}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.attention.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Pontos de atenção
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {result.attention.map((a, k) => (
                    <li key={k} className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span>{a.name && <strong>{a.name}: </strong>}{a.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.speedup_tips.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Lightbulb className="h-4 w-4 text-yellow-600" /> Como acelerar
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {result.speedup_tips.map((t, k) => (
                    <li key={k} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* o que o responsável já informou à IA */}
        <section className="space-y-2 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquarePlus className="h-4 w-4 text-violet-600" /> O que você já informou à IA
          </h3>
          {notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nada ainda. Quando você não seguir uma sugestão, o motivo fica aqui e a IA passa a considerá-lo.</p>
          ) : (
            <ul className="space-y-1.5">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 px-2.5 py-1.5 text-sm">
                  <div>
                    <span className="font-medium">{n.kind === 'constraint' ? 'Restrição geral' : (n.stage_name ?? 'Etapa excluída')}</span>
                    {n.kind === 'rejected' && n.from_list && <span className="ml-1.5 text-xs text-muted-foreground">({NOTE_FROM_LABEL[n.from_list]})</span>}
                    <p className="text-xs text-muted-foreground">{n.reason}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Não vale mais: remover" disabled={loading} onClick={() => removeNote(n)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addConstraint} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={general}
              onChange={(e) => setGeneral(e.target.value)}
              maxLength={MAX_REASON}
              placeholder="Informe uma restrição ou motivo (ex.: a equipe de gesso só chega dia 20; falta cimento)"
              aria-label="Restrição ou motivo para a IA"
            />
            <Button type="submit" variant="outline" className="shrink-0" disabled={saving || loading || !general.trim()}>
              Informar e reanalisar
            </Button>
          </form>
        </section>
      </CardContent>

      <Dialog open={!!refusal} onOpenChange={(o) => !o && !saving && setRefusal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{refusal ? REFUSE_TITLE[refusal.from] : ''}</DialogTitle>
            <DialogDescription>
              {refusal?.stages.map((s) => s.name).join(', ')}. A IA vai considerar o motivo e refazer o plano.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmRefusal} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-reason">Motivo</Label>
              <Textarea
                id="ai-reason"
                rows={3}
                autoFocus
                maxLength={MAX_REASON}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: falta material, a equipe só chega semana que vem, o cliente pediu outra ordem..."
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setRefusal(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving || !reason.trim()}>{saving ? 'Guardando...' : 'Informar e reanalisar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
