// Testa as regras de src/lib/team-week.ts. Uso: npx tsx scripts/test-team-week.ts
import {
  WEEKDAY_SHORT,
  addDaysISO,
  canPayWeek,
  conferenceState,
  dayMonth,
  gridTotals,
  presenceGrid,
  weekDates,
  weeksAwaitingApproval,
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

// ---------------------------------------------------------------- conferência da semana
ok('as 7 datas da semana, de sábado a sexta', weekDates('2026-03-07').join() === '2026-03-07,2026-03-08,2026-03-09,2026-03-10,2026-03-11,2026-03-12,2026-03-13' && WEEKDAY_SHORT.length === 7 && WEEKDAY_SHORT[0] === 'Sáb' && WEEKDAY_SHORT[6] === 'Sex')
ok('dia/mês', dayMonth('2026-03-07') === '07/03' && dayMonth('2026-12-25') === '25/12')
ok('estado da conferência: futura, em andamento, aguardando e aprovada', conferenceState(W, '2026-03-06', false) === 'future' && conferenceState(W, '2026-03-10', false) === 'running' && conferenceState(W, '2026-03-10', true) === 'running' && conferenceState(W, '2026-03-13', false) === 'awaiting' && conferenceState(W, '2026-03-13', true) === 'approved' && conferenceState(W, '2026-03-20', false) === 'awaiting')
const aprov = new Set(['2026-03-07'])
ok('semanas fechadas sem aprovação (sem repetir, em ordem, ignora aprovadas e abertas)', weeksAwaitingApproval(['2026-03-14', '2026-03-07', '2026-03-14', '2026-02-28', '2026-03-21'], aprov, '2026-03-20').join() === '2026-02-28,2026-03-14')
ok('data com horário é lida pelo dia', weeksAwaitingApproval(['2026-03-14T03:00:00.000Z'], aprov, '2026-03-20').join() === '2026-03-14')
ok('o financeiro paga só semana fechada e aprovada', canPayWeek('2026-03-07', '2026-03-13', aprov) && !canPayWeek('2026-03-07', '2026-03-12', aprov) && !canPayWeek('2026-03-14', '2026-03-20', aprov) && !canPayWeek('2026-03-14', '2026-03-19', new Set(['2026-03-14'])))

const membros = [
  { id: 'a', name: 'Zé', daily_cost: 150, payment_type: 'daily', status: 'active' },
  { id: 'b', name: 'Ana', daily_cost: '200.00', payment_type: 'daily', status: 'active' },
  { id: 'c', name: 'Carlos', daily_cost: 3000, payment_type: 'monthly', status: 'active' },
  { id: 'd', name: 'Dora', daily_cost: 100, payment_type: 'daily', status: 'active' }, // sem marcação nenhuma
  { id: 'e', name: 'Eva', daily_cost: 100, payment_type: 'daily', status: 'inactive' }, // inativa sem marcação: fora
  { id: 'f', name: 'Fábio', daily_cost: 100, payment_type: 'daily', status: 'inactive' }, // inativo com marcação na semana: entra
]
const registros = [
  { worker_id: 'a', date: '2026-03-07', is_present: true },
  { worker_id: 'a', date: '2026-03-09', is_present: true },
  { worker_id: 'a', date: '2026-03-10', is_present: false },
  { worker_id: 'a', date: '2026-03-14', is_present: true }, // outra semana: não conta
  { worker_id: 'b', date: '2026-03-13', is_present: true },
  { worker_id: 'c', date: '2026-03-07', is_present: true },
  { worker_id: 'f', date: '2026-03-08', is_present: true },
]
const extras = [
  { worker_id: 'a', week_start_date: '2026-03-07', extra_value: 40 },
  { worker_id: 'b', week_start_date: '2026-03-07', extra_value: '-50' }, // desconto
  { worker_id: 'a', week_start_date: '2026-02-28', extra_value: 999 }, // outra semana
]
const grade = presenceGrid(membros, registros, extras, '2026-03-07')
ok('grade: ativos e inativos com marcação, em ordem alfabética', grade.map((r) => r.member.name).join() === 'Ana,Carlos,Dora,Fábio,Zé', grade.map((r) => r.member.name).join())
const za = grade.find((r) => r.member.id === 'a')!
ok('marcas por dia (sáb a sex): presente, sem marca, presente, ausente...', za.marks.join() === 'present,none,present,absent,none,none,none' && za.days === 2, za.marks.join())
ok('valor da semana = dias x diária + extra (só os da semana)', za.total === 340 && za.extra === 40, JSON.stringify([za.total, za.extra]))
const ana = grade.find((r) => r.member.id === 'b')!
ok('diária em texto e desconto (extra negativo)', ana.total === 150 && ana.extra === -50 && ana.marks[6] === 'present')
const carlos = grade.find((r) => r.member.id === 'c')!
ok('mensalista: valor 0 (contrato) e nunca "sem marcação"', carlos.monthly && carlos.total === 0 && !carlos.unmarked)
ok('quem está ativo e não tem nenhuma marcação é sinalizado para conferir', grade.find((r) => r.member.id === 'd')!.unmarked && !za.unmarked && !grade.find((r) => r.member.id === 'f')!.unmarked)
ok('desconto maior que o valor da semana não vira valor negativo', presenceGrid([{ id: 'x', name: 'X', daily_cost: 100, status: 'active' }], [{ worker_id: 'x', date: '2026-03-07', is_present: true }], [{ worker_id: 'x', week_start_date: '2026-03-07', extra_value: -500 }], '2026-03-07')[0].total === 0)
const tot = gridTotals(grade)
ok('totais: dias, valor e pessoas com valor a pagar', tot.days === 5 && tot.total === 340 + 150 + 100 && tot.payees === 3, JSON.stringify(tot))
ok('grade vazia', presenceGrid([], [], [], '2026-03-07').length === 0 && gridTotals([]).total === 0)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
