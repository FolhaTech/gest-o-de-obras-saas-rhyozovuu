// Testa as regras de src/lib/provider-payments.ts. Uso: npx tsx scripts/test-provider-payments.ts
import {
  EMPTY_FORM,
  PROVIDER_STATUS_LABEL,
  daysUntil,
  dueState,
  dueText,
  paymentTotals,
  sortPayments,
  summarizeByProvider,
  validateProviderPayment,
  type ProviderPaymentForm,
  type ProviderPaymentRow,
} from '../src/lib/provider-payments.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

// ---------------------------------------------------------------- formulário: os 7 dados são obrigatórios
const full: ProviderPaymentForm = {
  provider_id: '',
  provider_name: 'Pedro Pintor',
  pix_key: '123.456.789-00',
  service_type: 'Pintura externa',
  invoice_number: 'NF 1234',
  work_id: 'obra-1',
  amount: '1.500,50',
  due_date: '2026-11-30',
  notes: '',
}
ok('formulário completo passa (observação é opcional)', validateProviderPayment(full) === null)
const v = (over: Partial<ProviderPaymentForm>) => validateProviderPayment({ ...full, ...over })
ok('sem nome', /nome do prestador/.test(v({ provider_name: '  ' }) ?? ''))
ok('sem PIX', /PIX/.test(v({ pix_key: '' }) ?? ''))
ok('sem tratativa (tipo de serviço)', /tratativa/.test(v({ service_type: ' ' }) ?? ''))
ok('sem NF: orienta a escrever "sem NF"', /sem NF/.test(v({ invoice_number: '' }) ?? ''))
ok('sem casa', /casa/.test(v({ work_id: '' }) ?? ''))
ok('sem valor, valor zero, negativo ou inválido', ['', '0', '-5', 'abc'].every((a) => /valor/.test(v({ amount: a }) ?? '')))
ok('valor em reais digitado de formas diferentes', [' 1500,5', 'R$ 1.500,50', '1500.5'].every((a) => v({ amount: a }) === null))
ok('sem vencimento e vencimento que não existe (31/02)', /vencimento/.test(v({ due_date: '' }) ?? '') && /válida/.test(v({ due_date: '2026-02-31' }) ?? '') && /válida/.test(v({ due_date: '30/11/2026' }) ?? ''))
ok('formulário vazio pede o nome primeiro', /nome/.test(validateProviderPayment(EMPTY_FORM) ?? ''))

// ---------------------------------------------------------------- vencimento
const hoje = '2026-11-17'
ok('dias até o vencimento (negativo = venceu)', daysUntil('2026-11-20', hoje) === 3 && daysUntil('2026-11-17', hoje) === 0 && daysUntil('2026-11-14', hoje) === -3 && daysUntil('2026-12-01', hoje) === 14)
ok('vencimento atravessa mês e ano', daysUntil('2027-01-02', '2026-12-30') === 3 && daysUntil('2026-12-30', '2027-01-02') === -3)
ok('situação: vencida, hoje, em breve (até 7 dias), com folga', dueState('2026-11-16', hoje) === 'overdue' && dueState(hoje, hoje) === 'today' && dueState('2026-11-24', hoje) === 'soon' && dueState('2026-11-25', hoje) === 'ok')
ok('textos de vencimento', dueText('2026-11-14', hoje) === 'Venceu há 3 dias' && dueText('2026-11-16', hoje) === 'Venceu há 1 dia' && dueText(hoje, hoje) === 'Vence hoje' && dueText('2026-11-18', hoje) === 'Vence amanhã' && dueText('2026-11-22', hoje) === 'Vence em 5 dias')
ok('textos das situações', PROVIDER_STATUS_LABEL.requested === 'A pagar' && PROVIDER_STATUS_LABEL.paid === 'Pago' && PROVIDER_STATUS_LABEL.cancelled === 'Cancelada')

// ---------------------------------------------------------------- lista
const r = (id: string, name: string, status: ProviderPaymentRow['status'], due: string, amount: number, paid: string | null = null, provider: string | null = null, created = '2026-11-01T10:00:00Z'): ProviderPaymentRow => ({
  id, provider_id: provider, provider_name: name, pix_key: 'x', service_type: 'Pintura', invoice_number: 'NF', work_id: 'w', work_name: 'Casa 03', payment_amount: amount, due_date: due, notes: null, status,
  requested_by: null, paid_at: paid, paid_by: null, payment_method: null, finance_notes: null, created_at: created,
})
const lista = [
  r('pago-antigo', 'Ana', 'paid', '2026-10-01', 100, '2026-10-05'),
  r('cancelada', 'Bia', 'cancelled', '2026-11-01', 50),
  r('vence-depois', 'Ana', 'requested', '2026-12-10', 300),
  r('vencida', 'Carlos', 'requested', '2026-11-10', 200),
  r('pago-recente', 'Bia', 'paid', '2026-11-05', 400, '2026-11-12'),
  r('vence-antes', 'Bia', 'requested', '2026-11-20', 250),
]
const ordem = sortPayments(lista).map((x) => x.id).join()
ok('abertas por vencimento (a vencida primeiro), depois as pagas (a mais recente primeiro), canceladas por último', ordem === 'vencida,vence-antes,vence-depois,pago-recente,pago-antigo,cancelada', ordem)
ok('não altera a lista original; lista vazia', lista[0].id === 'pago-antigo' && sortPayments([]).length === 0)

// ---------------------------------------------------------------- cartões e resumo por prestador
const t = paymentTotals(lista, hoje)
ok('cartões: a pagar, vencidas, a vencer em 7 dias e pago no mês', t.openCount === 3 && t.openTotal === 750 && t.overdueCount === 1 && t.overdueTotal === 200 && t.soonCount === 1 && t.soonTotal === 250 && t.paidMonthCount === 1 && t.paidMonthTotal === 400, JSON.stringify(t))
ok('valor em texto (numeric da API) soma como número', paymentTotals([{ ...lista[2], payment_amount: '10.10' }, { ...lista[3], payment_amount: '20.20' }], hoje).openTotal === 30.3)
const resumo = summarizeByProvider(lista, hoje)
ok('resumo por prestador: ordem por valor a pagar; canceladas fora', resumo.map((x) => x.name).join() === 'Ana,Bia,Carlos' && !resumo.some((x) => x.paidTotal === 50), resumo.map((x) => x.name).join())
const bia = resumo.find((x) => x.name === 'Bia')!
ok('resumo: a pagar, vencidas, já pago e próximo vencimento', bia.pendingCount === 1 && bia.pendingTotal === 250 && bia.paidTotal === 400 && bia.nextDue === '2026-11-20' && bia.overdueCount === 0)
ok('resumo: vencidas e próximo vencimento do Carlos', resumo.find((x) => x.name === 'Carlos')!.overdueCount === 1 && resumo.find((x) => x.name === 'Carlos')!.nextDue === '2026-11-10')
ok('prestador cadastrado é agrupado pelo id; digitado, pelo nome sem acento e caixa', summarizeByProvider([r('1', 'Zé Pedreiro', 'requested', '2026-12-01', 10, null, 'p1'), r('2', 'Ze Pedreiro (outro nome)', 'requested', '2026-12-02', 20, null, 'p1'), r('3', 'João', 'requested', '2026-12-01', 5), r('4', ' joao ', 'requested', '2026-12-03', 5)], hoje).map((x) => `${x.pendingCount}:${x.pendingTotal}`).sort().join() === '2:10,2:30')
ok('resumo vazio', summarizeByProvider([], hoje).length === 0 && paymentTotals([], hoje).openTotal === 0)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
