// Testa as regras de src/lib/team-week.ts. Uso: npx tsx scripts/test-team-week.ts
import {
  addDaysISO,
  groupByWeek,
  isWeekPayable,
  weekAmount,
  weekEndOf,
  weekLabel,
  weekPhase,
  weekPhaseText,
  weekStartOf,
} from '../src/lib/team-week.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

// ---------------------------------------------------------------- semana de sábado a sexta (igual ao banco)
ok('sábado abre a semana', weekStartOf('2026-03-07') === '2026-03-07')
ok('domingo a quinta pertencem à semana do sábado anterior', ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12'].every((d) => weekStartOf(d) === '2026-03-07'))
ok('sexta ainda é da mesma semana; o sábado seguinte abre outra', weekStartOf('2026-03-13') === '2026-03-07' && weekStartOf('2026-03-14') === '2026-03-14')
ok('a semana atravessa o fim do mês e do ano', weekStartOf('2026-01-02') === '2025-12-27' && weekStartOf('2026-03-01') === '2026-02-28' && weekEndOf('2025-12-27') === '2026-01-02')
ok('data com horário é lida pelo dia', weekStartOf('2026-03-10T23:59:00Z') === '2026-03-07')
ok('soma de dias', addDaysISO('2026-02-27', 2) === '2026-03-01' && addDaysISO('2026-03-01', -1) === '2026-02-28' && addDaysISO('2028-02-28', 1) === '2028-02-29')
ok('fim da semana é a sexta', weekEndOf('2026-03-07') === '2026-03-13')
ok('texto da semana', weekLabel('2026-03-07') === 'Semana 07/03 a 13/03' && weekLabel('2025-12-27') === 'Semana 27/12 a 02/01')

// ---------------------------------------------------------------- quando paga
const W = '2026-03-07'
ok('antes de começar: futura', weekPhase(W, '2026-03-06') === 'future' && !isWeekPayable(W, '2026-03-06'))
ok('no sábado e até quinta: em andamento (vai contando)', ['2026-03-07', '2026-03-10', '2026-03-12'].every((d) => weekPhase(W, d) === 'running' && !isWeekPayable(W, d)))
ok('na sexta (último dia) já fecha e libera o pagamento', weekPhase(W, '2026-03-13') === 'payable' && isWeekPayable(W, '2026-03-13'))
ok('depois da sexta segue a pagar', weekPhase(W, '2026-03-20') === 'payable')
ok('textos da situação', weekPhaseText(W, '2026-03-06') === 'Começa em 07/03' && weekPhaseText(W, '2026-03-09') === 'Em andamento: fecha na sexta 13/03' && weekPhaseText(W, '2026-03-13') === 'Semana fechada: pagar')

// ---------------------------------------------------------------- valor
ok('dias x diária + extra', weekAmount(3, 150, 40) === 490 && weekAmount(0, 150, 0) === 0 && weekAmount(5, 120.5, 0) === 602.5)
ok('valores em texto (numeric da API) e vazios', weekAmount('2' as unknown as number, '150.00' as unknown as number, '10.5' as unknown as number) === 310.5 && weekAmount(NaN, 100, 0) === 0)
ok('arredonda em centavos', weekAmount(1, 33.333, 0) === 33.33)

// ---------------------------------------------------------------- agrupar por semana e por pessoa
const p = (name: string, week: string | null, status: 'pending' | 'paid', amount: number) => ({ member_name: name, week_start: week, status, payment_amount: amount })
const lista = [
  p('Zé', '2026-03-07', 'pending', 300),
  p('Ana', '2026-03-07', 'paid', 150),
  p('Ana', '2026-03-07', 'pending', 50),
  p('Bia', '2026-03-14', 'pending', 200),
  p('Carlos', '2026-03-07', 'paid', 120),
  p('Avulso', null, 'pending', 999), // lançado à mão: fora do agrupamento
]
const g = groupByWeek(lista)
ok('semanas da mais recente para a mais antiga; lançamento à mão fica de fora', g.map((x) => x.weekStart).join() === '2026-03-14,2026-03-07')
ok('pessoas em ordem alfabética, pendente antes do pago da mesma pessoa', g[1].rows.map((r) => `${r.member_name}:${r.status}`).join() === 'Ana:pending,Ana:paid,Carlos:paid,Zé:pending', g[1].rows.map((r) => `${r.member_name}:${r.status}`).join())
ok('total e contagem do que falta pagar na semana', g[1].pendingTotal === 350 && g[1].pendingCount === 2 && g[1].paidCount === 2)
ok('semana toda paga: nada pendente', groupByWeek([p('Ana', '2026-03-07', 'paid', 150)])[0].pendingTotal === 0)
ok('valor em texto soma como número', groupByWeek([{ member_name: 'A', week_start: '2026-03-07', status: 'pending' as const, payment_amount: '10.10' }, { member_name: 'B', week_start: '2026-03-07', status: 'pending' as const, payment_amount: '20.20' }])[0].pendingTotal === 30.3)
ok('não altera a lista original; vazia', lista[0].member_name === 'Zé' && groupByWeek([]).length === 0)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
