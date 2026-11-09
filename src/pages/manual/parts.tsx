import type { ReactNode } from 'react'
import { Lightbulb, AlertTriangle, HardHat } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Blocos auxiliares do "Manual do Sistema".
 * Mantêm a identidade visual do app (cards, borda laranja, tipografia) e
 * ganham tratamento especial no @media print (ver src/main.css).
 */

/** Capítulo numerado: no papel, cada um começa em uma nova página. */
export function Chapter({
  number,
  title,
  goal,
  children,
}: {
  number: number
  title: string
  goal: string
  children: ReactNode
}) {
  return (
    <section className="manual-chapter" aria-label={`Capítulo ${number} — ${title}`}>
      <div className="flex items-start gap-3">
        <span className="manual-chapter-number flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {number}
        </span>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{goal}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

/** Passo numerado dentro de um capítulo. */
export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="manual-avoid-break flex gap-3">
      <span className="manual-step-number mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/5 text-xs font-bold text-primary">
        {n}
      </span>
      <p className="text-sm leading-relaxed text-foreground/90">{children}</p>
    </div>
  )
}

/** Observação complementar a um passo (sem numeração). */
export function StepNote({ children }: { children: ReactNode }) {
  return (
    <p className="manual-avoid-break border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground">
      {children}
    </p>
  )
}

/** Bloco destacado "Dica:" (verde) ou "Importante:" (âmbar). */
export function Tip({ kind = 'info', children }: { kind?: 'info' | 'warn'; children: ReactNode }) {
  const isWarn = kind === 'warn'
  return (
    <div
      className={`manual-callout manual-avoid-break flex gap-2.5 rounded-md border p-3.5 text-sm leading-relaxed ${
        isWarn
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900'
      }`}
    >
      {isWarn ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      ) : (
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <p>
        <strong className="font-semibold">{isWarn ? 'Importante:' : 'Dica:'}</strong> {children}
      </p>
    </div>
  )
}

/** Tabela simples usada no capítulo de papéis e permissões. */
export function ManualTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="manual-avoid-break overflow-x-auto rounded-md border">
      <table className="manual-table w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top leading-relaxed">
                  {j === 0 ? <strong>{cell}</strong> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Capa do manual (visível também na impressão). */
export function ManualCover({ version, generatedAt }: { version: string; generatedAt: string }) {
  return (
    <Card className="manual-cover border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <HardHat className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">Gestão de Obras SaaS</CardTitle>
            <CardDescription>
              Manual do Sistema · Versão {version} · Gerado em {generatedAt}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Documento de treinamento para administradores de obra, gestores e prestadores. Use o botão{' '}
        <strong>“Baixar PDF”</strong> no topo da página e escolha <em>“Salvar como PDF”</em> na
        janela de impressão do navegador.
      </CardContent>
    </Card>
  )
}

/** Introdução curta antes do capítulo 1. */
export function ManualIntro() {
  return (
    <div className="manual-intro rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
      <p>
        Este manual explica, passo a passo, como usar cada área do sistema: <strong>acesso</strong>,{' '}
        <strong>Planner</strong>, <strong>Obras</strong>, <strong>Materiais</strong>,{' '}
        <strong>Financeiro</strong>, <strong>Equipes</strong>, <strong>Relatórios</strong> e{' '}
        <strong>Configurações</strong>. Os passos numerados mostram a ordem das ações; os blocos{' '}
        <strong>“Dica”</strong> e <strong>“Importante”</strong> destacam cuidados e boas práticas.
      </p>
    </div>
  )
}
