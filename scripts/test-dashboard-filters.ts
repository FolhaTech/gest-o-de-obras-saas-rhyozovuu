// Testa as regras de src/lib/dashboard-filters.ts. Uso: npx tsx scripts/test-dashboard-filters.ts
import {
  EMPTY_FILTERS,
  belongsToFiltered,
  distinctManagers,
  filterObras,
  hasAnyFilter,
  hasObraFilter,
  inPeriod,
  periodRange,
  type DashboardFilters,
} from '../src/lib/dashboard-filters.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}
const F = (p: Partial<DashboardFilters>): DashboardFilters => ({ ...EMPTY_FILTERS, ...p })
const hoje = '2026-11-12'

// ---------------------------------------------------------------- períodos
let r = periodRange('month', hoje)
ok('este mês: 01/11 a 30/11', r.from === '2026-11-01' && r.to === '2026-11-30', JSON.stringify(r))
r = periodRange('month', '2028-02-10')
ok('fevereiro bissexto vai até 29', r.to === '2028-02-29')
r = periodRange('last_month', hoje)
ok('mês passado: 01/10 a 31/10', r.from === '2026-10-01' && r.to === '2026-10-31', JSON.stringify(r))
r = periodRange('last_month', '2026-01-15')
ok('mês passado em janeiro: dezembro do ano anterior', r.from === '2025-12-01' && r.to === '2025-12-31', JSON.stringify(r))
r = periodRange('3m', hoje)
ok('últimos 3 meses: 01/09 a 30/11', r.from === '2026-09-01' && r.to === '2026-11-30', JSON.stringify(r))
r = periodRange('3m', '2026-02-20')
ok('últimos 3 meses em fevereiro cruzam o ano (01/12 a 28/02)', r.from === '2025-12-01' && r.to === '2026-02-28', JSON.stringify(r))
r = periodRange('year', hoje)
ok('este ano: 01/01 a 31/12', r.from === '2026-01-01' && r.to === '2026-12-31')
r = periodRange('all', hoje)
ok('todo o período é aberto', r.from === null && r.to === null)
r = periodRange('custom', hoje, '2026-03-05', '2026-04-10')
ok('personalizado usa as datas informadas', r.from === '2026-03-05' && r.to === '2026-04-10')
r = periodRange('custom', hoje, '2026-03-05', '')
ok('personalizado só com início: aberto no fim', r.from === '2026-03-05' && r.to === null)
r = periodRange('custom', hoje, '', '')
ok('personalizado vazio = aberto', r.from === null && r.to === null)

// ---------------------------------------------------------------- data dentro do período
const out = periodRange('month', hoje)
ok('dentro do período', inPeriod('2026-11-12', out) && inPeriod('2026-11-01', out) && inPeriod('2026-11-30', out))
ok('fora do período (um dia antes e um depois)', !inPeriod('2026-10-31', out) && !inPeriod('2026-12-01', out))
ok('data com horário é lida pelo dia', inPeriod('2026-11-30T23:59:00Z', out))
ok('sem data: só entra se o período for aberto', !inPeriod(null, out) && inPeriod(null, periodRange('all', hoje)) && inPeriod(undefined, periodRange('all', hoje)))
ok('início aberto', inPeriod('2020-01-01', { from: null, to: '2026-01-01' }) && !inPeriod('2026-01-02', { from: null, to: '2026-01-01' }))

// ---------------------------------------------------------------- filtro de obras
const obras = [
  { id: 'a', status: 'in_progress', manager: 'Igor Arimura ', end_date_planned: '2026-10-09' }, // atrasada
  { id: 'b', status: 'planned', manager: 'Igor Arimura', end_date_planned: '2027-01-10' },
  { id: 'c', status: 'finished', manager: 'Maria', end_date_planned: '2026-09-01' }, // vencida mas finalizada
  { id: 'd', status: 'in_progress', manager: null, end_date_planned: null },
]
const ids = (f: DashboardFilters) => filterObras(obras, f, hoje).map((o) => o.id).join(',')
ok('sem filtro: todas', ids(EMPTY_FILTERS) === 'a,b,c,d')
ok('casas escolhidas', ids(F({ workIds: ['b', 'd'] })) === 'b,d')
ok('situação: em andamento', ids(F({ status: 'in_progress' })) === 'a,d')
ok('situação "em risco": prazo vencido e não finalizada (ignora a finalizada)', ids(F({ status: 'risk' })) === 'a')
ok('responsável (ignora espaços nas pontas)', ids(F({ manager: 'Igor Arimura' })) === 'a,b')
ok('combinados: casa + situação', ids(F({ workIds: ['a', 'b'], status: 'in_progress' })) === 'a')
ok('combinados sem resultado', ids(F({ workIds: ['c'], status: 'planned' })) === '')
ok('obra sem responsável não passa no filtro de responsável', ids(F({ manager: 'Maria' })) === 'c')

// ---------------------------------------------------------------- quais registros entram
const sel = new Set(['a', 'b'])
ok('sem filtro de obra: entra tudo, até o registro sem obra', belongsToFiltered(null, sel, EMPTY_FILTERS) && belongsToFiltered('z', sel, EMPTY_FILTERS))
ok('com filtro de casa: só as das obras escolhidas', belongsToFiltered('a', sel, F({ workIds: ['a', 'b'] })) && !belongsToFiltered('c', sel, F({ workIds: ['a', 'b'] })))
ok('com filtro: registro sem obra fica de fora', !belongsToFiltered(null, sel, F({ status: 'in_progress' })))
ok('filtro de período sozinho não restringe obras', belongsToFiltered('qualquer', new Set(), F({ period: 'month' })))

ok('hasObraFilter / hasAnyFilter', !hasObraFilter(EMPTY_FILTERS) && hasObraFilter(F({ manager: 'X' })) && !hasAnyFilter(EMPTY_FILTERS) && hasAnyFilter(F({ period: 'year' })) && hasAnyFilter(F({ workIds: ['a'] })))

const gerentes = distinctManagers([{ manager: ' Zé ' }, { manager: 'Ana' }, { manager: 'Zé' }, { manager: null }, { manager: '  ' }, { manager: 'Igor' }])
ok('responsáveis distintos, sem vazios e em ordem', JSON.stringify(gerentes) === JSON.stringify(['Ana', 'Igor', 'Zé']), gerentes.join(', '))

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
