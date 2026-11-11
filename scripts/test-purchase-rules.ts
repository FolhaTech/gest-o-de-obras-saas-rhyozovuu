// Testa as regras de src/lib/purchases.ts. Uso: npx tsx scripts/test-purchase-rules.ts
import { daysLate, isBought, isOpen, sortRequests } from '../src/lib/purchases.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

ok('abertas: solicitada, em cotação e aprovada', isOpen('requested') && isOpen('quoting') && isOpen('approved'))
ok('encerradas não são abertas', !isOpen('purchased') && !isOpen('delivered') && !isOpen('rejected') && !isOpen('cancelled'))
ok('compradas: comprada e entregue', isBought('purchased') && isBought('delivered') && !isBought('approved') && !isBought('rejected'))

const r = (id: string, status: string, urgency: string, needed_by: string | null, created_at: string) => ({ id, status, urgency, needed_by, created_at })

const list = [
  r('comprada-recente', 'purchased', 'urgent', null, '2026-11-10T10:00:00Z'),
  r('normal-sem-prazo', 'requested', 'normal', null, '2026-11-01T10:00:00Z'),
  r('urgente', 'requested', 'urgent', '2026-11-20', '2026-11-05T10:00:00Z'),
  r('alta-prazo-perto', 'quoting', 'high', '2026-11-12', '2026-11-06T10:00:00Z'),
  r('alta-prazo-longe', 'approved', 'high', '2026-12-01', '2026-11-02T10:00:00Z'),
  r('cancelada-antiga', 'cancelled', 'low', null, '2026-10-01T10:00:00Z'),
  r('baixa', 'requested', 'low', null, '2026-11-03T10:00:00Z'),
]
const ordem = sortRequests(list).map((x) => x.id)
ok(
  'abertas primeiro: urgência, depois prazo mais perto; encerradas por último (mais recentes antes)',
  JSON.stringify(ordem) === JSON.stringify(['urgente', 'alta-prazo-perto', 'alta-prazo-longe', 'normal-sem-prazo', 'baixa', 'comprada-recente', 'cancelada-antiga']),
  ordem.join(', '),
)
ok('não altera a lista original', list[0].id === 'comprada-recente')

const empate = sortRequests([
  r('b-nova', 'requested', 'normal', null, '2026-11-09T10:00:00Z'),
  r('a-antiga', 'requested', 'normal', null, '2026-11-01T10:00:00Z'),
])
ok('empate total: a mais antiga (esperando há mais tempo) vem primeiro', empate[0].id === 'a-antiga')
ok('lista vazia', sortRequests([]).length === 0)
ok('urgência desconhecida cai no meio (como normal)', sortRequests([r('x', 'requested', '???', null, '2026-11-01T00:00:00Z'), r('y', 'requested', 'low', null, '2026-11-01T00:00:00Z')])[0].id === 'x')

const hoje = '2026-11-12'
ok('prazo vencido ontem: 1 dia de atraso', daysLate({ status: 'requested', needed_by: '2026-11-11' }, hoje) === 1)
ok('vence hoje: sem atraso', daysLate({ status: 'requested', needed_by: '2026-11-12' }, hoje) === 0)
ok('prazo no futuro: sem atraso', daysLate({ status: 'quoting', needed_by: '2026-11-30' }, hoje) === 0)
ok('já comprada: não conta atraso', daysLate({ status: 'purchased', needed_by: '2026-10-01' }, hoje) === 0)
ok('sem prazo: sem atraso', daysLate({ status: 'requested', needed_by: null }, hoje) === 0)
ok('atrasada 12 dias', daysLate({ status: 'approved', needed_by: '2026-10-31' }, hoje) === 12)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
