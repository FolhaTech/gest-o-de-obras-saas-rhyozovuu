// Testa as regras de src/lib/work-clock.ts. Uso: npx tsx scripts/test-work-clock.ts
import { clockTime, formatDuration, stayMs, toIsoFromLocal, toTimeInput, totalStayMs } from '../src/lib/work-clock.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}
const MIN = 60_000
const H = 60 * MIN

// ---------------------------------------------------------------- formatação do tempo
ok('menos de 1 minuto', formatDuration(0) === 'menos de 1min' && formatDuration(59_999) === 'menos de 1min')
ok('45 minutos', formatDuration(45 * MIN) === '45min')
ok('1 hora exata', formatDuration(H) === '1h')
ok('3h 28min', formatDuration(3 * H + 28 * MIN) === '3h 28min')
ok('minutos com zero à esquerda (2h 05min)', formatDuration(2 * H + 5 * MIN) === '2h 05min')
ok('mais de um dia (26h 10min)', formatDuration(26 * H + 10 * MIN) === '26h 10min')
ok('valor inválido', formatDuration(-5) === '-' && formatDuration(NaN) === '-')
ok('arredonda para baixo os segundos', formatDuration(2 * MIN + 59_000) === '2min')

// ---------------------------------------------------------------- permanência
const entrada = '2026-11-12T11:12:00.000Z' // 08:12 em Brasília
const saida = '2026-11-12T14:40:00.000Z' // 11:40
ok('concluída: saída − entrada = 3h 28min', stayMs({ status: 'done', check_in_at: entrada, check_out_at: saida }) === 3 * H + 28 * MIN)
const agora = Date.parse('2026-11-12T13:27:00.000Z')
ok('em andamento: agora − entrada (2h 15min)', stayMs({ status: 'in_progress', check_in_at: entrada }, agora) === 2 * H + 15 * MIN)
ok('sem hora de entrada: sem tempo', stayMs({ status: 'done' }) === null && stayMs({ status: 'in_progress' }, agora) === null)
ok('concluída sem saída registrada: sem tempo (não inventa)', stayMs({ status: 'done', check_in_at: entrada }, agora) === null)
ok('relógio adiantado nunca dá tempo negativo', stayMs({ status: 'in_progress', check_in_at: '2026-11-12T15:00:00.000Z' }, agora) === 0)

// ---------------------------------------------------------------- horas no fuso de Brasília
ok('11:12Z aparece como 08:12', clockTime(entrada) === '08:12', clockTime(entrada))
ok('14:40Z aparece como 11:40', clockTime(saida) === '11:40')
ok('meia-noite local (03:00Z) aparece como 00:00', clockTime('2026-11-12T03:00:00.000Z') === '00:00', clockTime('2026-11-12T03:00:00.000Z'))
ok('sem hora: traço', clockTime(null) === '-' && clockTime(undefined) === '-')

// ---------------------------------------------------------------- campo de hora <-> ISO
ok('08:12 do dia 12/11 vira 11:12Z', toIsoFromLocal('2026-11-12', '08:12') === '2026-11-12T11:12:00.000Z', toIsoFromLocal('2026-11-12', '08:12'))
ok('ida e volta do campo de hora', toTimeInput(toIsoFromLocal('2026-11-12', '17:45')) === '17:45')
ok('21:30 local passa para o dia seguinte em UTC (00:30Z)', toIsoFromLocal('2026-11-12', '21:30') === '2026-11-13T00:30:00.000Z', toIsoFromLocal('2026-11-12', '21:30'))
ok('campo de hora vazio fica vazio', toTimeInput('') === '' && toTimeInput(null) === '')

// ---------------------------------------------------------------- total do mês
const a = { status: 'done', check_in_at: entrada, check_out_at: saida } // 3h28
const b = { status: 'done', check_in_at: '2026-11-13T11:00:00.000Z', check_out_at: '2026-11-13T12:30:00.000Z' } // 1h30
const aberta = { status: 'in_progress', check_in_at: '2026-11-14T11:00:00.000Z' }
ok('soma só as concluídas (3h28 + 1h30 = 4h 58min)', formatDuration(totalStayMs([a, b, aberta])) === '4h 58min', formatDuration(totalStayMs([a, b, aberta])))
ok('lista vazia soma zero', totalStayMs([]) === 0)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
