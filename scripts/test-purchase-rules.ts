// Testa as regras de src/lib/purchases.ts. Uso: npx tsx scripts/test-purchase-rules.ts
import {
  MIN_QUOTES,
  STATUS_LABEL,
  buildSteps,
  byValue,
  canCancel,
  canDecide,
  canEditRequest,
  canSendQuotes,
  cheapest,
  currentRound,
  daysLate,
  distinctSuppliers,
  fulfillAction,
  isBought,
  isOpen,
  needsMyAction,
  nextFinanceStatus,
  parseMoney,
  quotesMissing,
  sortRequests,
  stepOf,
  waitingOn,
  waitingText,
} from '../src/lib/purchases.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

// ---------------------------------------------------------------- situações
const todas = ['requested', 'quoting', 'quotes_sent', 'approved', 'awaiting_payment', 'awaiting_delivery', 'awaiting_release', 'closed', 'cancelled']
ok('toda situação tem texto', todas.every((s) => !!(STATUS_LABEL as Record<string, string>)[s]) && Object.keys(STATUS_LABEL).length === todas.length)
ok('a solicitação nasce "pendente pelo financeiro"', STATUS_LABEL.requested === 'Pendente pelo financeiro')
ok('em aberto: todas menos encerrada e cancelada', todas.filter(isOpen).join() === todas.slice(0, 7).join())
ok('compra feita: do pagamento antecipado ao encerramento', todas.filter(isBought).join() === 'awaiting_payment,awaiting_delivery,awaiting_release,closed')

// ---------------------------------------------------------------- quem age
ok('quem age em cada etapa', waitingOn('requested') === 'financeiro' && waitingOn('quoting') === 'financeiro' && waitingOn('quotes_sent') === 'admin' && waitingOn('approved') === 'financeiro' && waitingOn('awaiting_payment') === 'financeiro' && waitingOn('awaiting_delivery') === 'financeiro' && waitingOn('awaiting_release') === 'financeiro')
ok('encerrada e cancelada: ninguém', waitingOn('closed') === null && waitingOn('cancelled') === null)
ok('textos de "o que falta" cobrem tudo', todas.every((s) => waitingText(s).length > 0))
ok('texto da cotação cita o mínimo', waitingText('quoting').includes(String(MIN_QUOTES)))

// ---------------------------------------------------------------- caminho do financeiro
ok('mínimo de 3 cotações', MIN_QUOTES === 3)
ok('pendente -> em cotação -> enviada ao admin', nextFinanceStatus('requested') === 'quoting' && nextFinanceStatus('quoting') === 'quotes_sent')
ok('a aprovação é do admin: o financeiro não tem próximo passo', nextFinanceStatus('quotes_sent') === null)
ok('compra antecipada: aprovada -> liberar pagamento -> aguardando entrega -> encerrada', nextFinanceStatus('approved', 'advance') === 'awaiting_payment' && nextFinanceStatus('awaiting_payment', 'advance') === 'awaiting_delivery' && nextFinanceStatus('awaiting_delivery', 'advance') === 'closed')
ok('após a entrega: aprovada -> aguardando entrega -> recebe e confere -> libera o pagamento -> encerrada', nextFinanceStatus('approved', 'after_delivery') === 'awaiting_delivery' && nextFinanceStatus('awaiting_delivery', 'after_delivery') === 'awaiting_release' && nextFinanceStatus('awaiting_release', 'after_delivery') === 'closed')
ok('terminadas não têm próximo passo', nextFinanceStatus('closed') === null && nextFinanceStatus('cancelled') === null)

ok('ação do financeiro depois da aprovação: comprar, liberar, receber, liberar', fulfillAction({ status: 'approved' })?.button === 'Comprar' && fulfillAction({ status: 'awaiting_payment' })?.button === 'Liberar pagamento' && fulfillAction({ status: 'awaiting_delivery' })?.button === 'Receber e conferir' && fulfillAction({ status: 'awaiting_release' })?.button === 'Liberar pagamento')
ok('sem ação nas outras situações (cotação e aprovação têm telas próprias)', ['requested', 'quoting', 'quotes_sent', 'closed', 'cancelled'].every((s) => fulfillAction({ status: s }) === null))

// ---------------------------------------------------------------- etapas
ok('etapa de cada situação', stepOf('requested') === 1 && stepOf('quoting') === 2 && stepOf('quotes_sent') === 3 && stepOf('approved') === 4 && stepOf('awaiting_payment') === 5 && stepOf('awaiting_delivery') === 5 && stepOf('awaiting_release') === 6 && stepOf('closed') === 7 && stepOf('cancelled') === 0)
const passos = buildSteps('quotes_sent')
ok('seis etapas; as anteriores feitas, a atual marcada, as seguintes por fazer', passos.length === 6 && passos.map((p) => p.state).join() === 'done,done,current,todo,todo,todo')
ok('encerrada: tudo feito', buildSteps('closed').every((p) => p.state === 'done'))
ok('cancelada: nada em andamento (mostra até onde chegou)', buildSteps('cancelled', 2).map((p) => p.state).join() === 'done,done,todo,todo,todo,todo' && buildSteps('cancelled').every((p) => p.state === 'todo'))
ok('as etapas têm o nome do processo', buildSteps('requested')[0].title === 'Solicitação' && buildSteps('requested')[5].title === 'Recebimento / encerramento')

// ---------------------------------------------------------------- cotações
const cot = (supplier: string, value: number, round = 1) => ({ supplier, quoted_value: value, round })
ok('sem cotações: faltam 3 e não envia', quotesMissing([]) === 3 && !canSendQuotes([]))
ok('com 2: falta 1', quotesMissing([cot('A', 1), cot('B', 2)]) === 1 && !canSendQuotes([cot('A', 1), cot('B', 2)]))
ok('com 3 fornecedores diferentes: envia', canSendQuotes([cot('A', 1), cot('B', 2), cot('C', 3)]) && quotesMissing([cot('A', 1), cot('B', 2), cot('C', 3)]) === 0)
ok('mesmo fornecedor com outras letras/espaços conta uma vez só', distinctSuppliers([cot('Loja X', 1), cot('  loja x ', 2), cot('LOJA X', 3)]) === 1 && !canSendQuotes([cot('Loja X', 1), cot(' loja x', 2), cot('LOJA X', 3)]))
ok('fornecedor em branco não conta', distinctSuppliers([cot('A', 1), cot('   ', 2), cot('', 3)]) === 1)
ok('4 fornecedores: passa do mínimo', canSendQuotes([cot('A', 1), cot('B', 2), cot('C', 3), cot('D', 4)]))

const lista = [cot('A', 500, 1), cot('B', 450, 1), cot('A', 420, 2), cot('D', 400, 2), cot('E', 410, 2)]
ok('só as cotações da rodada atual contam', currentRound(lista, 2).length === 3 && currentRound(lista, 1).length === 2 && currentRound(lista, 3).length === 0)
ok('cotação sem rodada vale como rodada 1', currentRound([{ supplier: 'A', quoted_value: 1 }], 1).length === 1)
ok('a mais barata', cheapest(currentRound(lista, 2))?.supplier === 'D' && cheapest([]) === null)
ok('do menor para o maior valor, sem alterar a lista', byValue(currentRound(lista, 2)).map((q) => q.supplier).join() === 'D,E,A' && lista[0].supplier === 'A' && lista.length === 5)
ok('valor vem como texto da API (numeric): ordena como número', byValue([cot('A', 0), { supplier: 'B', quoted_value: '99.5' }, { supplier: 'C', quoted_value: '100' }]).map((q) => q.supplier).join() === 'A,B,C')

// ---------------------------------------------------------------- quem decide, cancela e edita
const abriuAdmin = { status: 'quotes_sent', requested_by: 'adm1' }
const abriuPrestador = { status: 'quotes_sent', requested_by: 'pre1' }
ok('o admin que abriu aprova/recusa', canDecide(abriuAdmin, 'adm1', 'admin', 'admin'))
ok('outro admin não decide o pedido de um admin', !canDecide(abriuAdmin, 'adm2', 'admin', 'admin'))
ok('pedido de quem não é admin: qualquer admin decide', canDecide(abriuPrestador, 'adm2', 'admin', 'prestador') && canDecide(abriuPrestador, 'adm1', 'admin', 'gestor') && canDecide(abriuPrestador, 'adm1', 'admin', undefined))
ok('financeiro, gestor e solicitante não decidem', !canDecide(abriuPrestador, 'fin', 'financeiro') && !canDecide(abriuPrestador, 'ges', 'gestor') && !canDecide(abriuPrestador, 'pre1', 'prestador'))
ok('só decide enquanto as cotações estão com o admin', !canDecide({ status: 'quoting', requested_by: 'adm1' }, 'adm1', 'admin', 'admin') && !canDecide({ status: 'approved', requested_by: 'adm1' }, 'adm1', 'admin', 'admin'))
ok('papel com espaço/maiúscula é reconhecido', canDecide(abriuPrestador, 'adm2', ' Admin ', 'Prestador'))

ok('o solicitante cancela enquanto está pendente', canCancel({ status: 'requested', requested_by: 'pre1' }, 'pre1', 'prestador'))
ok('o solicitante não cancela depois que o financeiro começa', !canCancel({ status: 'quoting', requested_by: 'pre1' }, 'pre1', 'prestador'))
ok('outro usuário não cancela a alheia', !canCancel({ status: 'requested', requested_by: 'pre1' }, 'pre2', 'prestador') && !canCancel({ status: 'requested', requested_by: 'pre1' }, 'ges', 'gestor') && !canCancel({ status: 'requested', requested_by: 'pre1' }, 'fin', 'financeiro'))
ok('o admin cancela até a compra', ['requested', 'quoting', 'quotes_sent', 'approved'].every((s) => canCancel({ status: s, requested_by: 'pre1' }, 'adm1', 'admin')))
ok('o admin não cancela depois da compra', ['awaiting_payment', 'awaiting_delivery', 'awaiting_release', 'closed', 'cancelled'].every((s) => !canCancel({ status: s, requested_by: 'pre1' }, 'adm1', 'admin')))
ok('o solicitante edita só enquanto pendente', canEditRequest({ status: 'requested', requested_by: 'pre1' }, 'pre1') && !canEditRequest({ status: 'quoting', requested_by: 'pre1' }, 'pre1') && !canEditRequest({ status: 'requested', requested_by: 'pre1' }, 'pre2') && !canEditRequest({ status: 'requested', requested_by: 'pre1' }, null))

// ---------------------------------------------------------------- de quem é a vez
ok('financeiro: a vez dele em tudo o que está com ele, menos a aprovação', ['requested', 'quoting', 'approved', 'awaiting_payment', 'awaiting_delivery', 'awaiting_release'].every((s) => needsMyAction({ status: s, requested_by: 'pre1' }, 'fin', 'financeiro')) && !needsMyAction({ status: 'quotes_sent', requested_by: 'pre1' }, 'fin', 'financeiro') && !needsMyAction({ status: 'closed', requested_by: 'pre1' }, 'fin', 'financeiro') && !needsMyAction({ status: 'cancelled', requested_by: 'pre1' }, 'fin', 'financeiro'))
ok('admin: a vez só nas cotações que ele aprova', needsMyAction(abriuAdmin, 'adm1', 'admin', 'admin') && !needsMyAction(abriuAdmin, 'adm2', 'admin', 'admin') && needsMyAction(abriuPrestador, 'adm2', 'admin', 'prestador') && !needsMyAction({ status: 'quoting', requested_by: 'pre1' }, 'adm1', 'admin', 'prestador'))
ok('gestor e prestador nunca têm a vez', !needsMyAction(abriuPrestador, 'ges', 'gestor') && !needsMyAction({ status: 'requested', requested_by: 'pre1' }, 'pre1', 'prestador'))

// ---------------------------------------------------------------- valor digitado
ok('valor com vírgula', parseMoney('1234,56') === 1234.56 && parseMoney('0,5') === 0.5 && parseMoney('480') === 480)
ok('valor com milhar e vírgula', parseMoney('1.234,56') === 1234.56 && parseMoney('12.345.678,90') === 12345678.9)
ok('valor com ponto decimal', parseMoney('1234.56') === 1234.56 && parseMoney('12.5') === 12.5)
ok('"1.234" é mil duzentos e trinta e quatro; "0.123" segue decimal', parseMoney('1.234') === 1234 && parseMoney('1.234.567') === 1234567 && parseMoney('0.123') === 0.123)
ok('com R$ e espaços', parseMoney('R$ 1.250,00') === 1250 && parseMoney(' 99 ') === 99)
ok('vazio e lixo viram NaN', Number.isNaN(parseMoney('')) && Number.isNaN(parseMoney('   ')) && Number.isNaN(parseMoney('abc')) && Number.isNaN(parseMoney('1,2,3')) && Number.isNaN(parseMoney('12,5x')))
ok('negativo é lido (a tela recusa depois)', parseMoney('-5') === -5)

// ---------------------------------------------------------------- ordem da lista
const r = (id: string, status: string, urgency: string, needed_by: string | null, created_at: string) => ({ id, status, urgency, needed_by, created_at })

const list = [
  r('encerrada-recente', 'closed', 'urgent', null, '2026-11-10T10:00:00Z'),
  r('normal-sem-prazo', 'requested', 'normal', null, '2026-11-01T10:00:00Z'),
  r('urgente', 'requested', 'urgent', '2026-11-20', '2026-11-05T10:00:00Z'),
  r('alta-prazo-perto', 'quoting', 'high', '2026-11-12', '2026-11-06T10:00:00Z'),
  r('alta-prazo-longe', 'approved', 'high', '2026-12-01', '2026-11-02T10:00:00Z'),
  r('aguardando-entrega', 'awaiting_delivery', 'normal', null, '2026-11-02T12:00:00Z'),
  r('cancelada-antiga', 'cancelled', 'low', null, '2026-10-01T10:00:00Z'),
  r('baixa', 'quotes_sent', 'low', null, '2026-11-03T10:00:00Z'),
]
const ordem = sortRequests(list).map((x) => x.id)
ok(
  'abertas primeiro: urgência, depois prazo mais perto; encerradas e canceladas por último (mais recentes antes)',
  JSON.stringify(ordem) === JSON.stringify(['urgente', 'alta-prazo-perto', 'alta-prazo-longe', 'normal-sem-prazo', 'aguardando-entrega', 'baixa', 'encerrada-recente', 'cancelada-antiga']),
  ordem.join(', '),
)
ok('não altera a lista original', list[0].id === 'encerrada-recente')

const empate = sortRequests([
  r('b-nova', 'requested', 'normal', null, '2026-11-09T10:00:00Z'),
  r('a-antiga', 'requested', 'normal', null, '2026-11-01T10:00:00Z'),
])
ok('empate total: a mais antiga (esperando há mais tempo) vem primeiro', empate[0].id === 'a-antiga')
ok('lista vazia', sortRequests([]).length === 0)
ok('urgência desconhecida cai no meio (como normal)', sortRequests([r('x', 'requested', '???', null, '2026-11-01T00:00:00Z'), r('y', 'requested', 'low', null, '2026-11-01T00:00:00Z')])[0].id === 'x')

// ---------------------------------------------------------------- atraso do "precisa até"
const hoje = '2026-11-12'
ok('prazo vencido ontem: 1 dia de atraso', daysLate({ status: 'requested', needed_by: '2026-11-11' }, hoje) === 1)
ok('vence hoje: sem atraso', daysLate({ status: 'requested', needed_by: '2026-11-12' }, hoje) === 0)
ok('prazo no futuro: sem atraso', daysLate({ status: 'quoting', needed_by: '2026-11-30' }, hoje) === 0)
ok('aguardando entrega depois do prazo: atrasada (o item ainda não chegou)', daysLate({ status: 'awaiting_delivery', needed_by: '2026-11-02' }, hoje) === 10)
ok('já recebida, encerrada ou cancelada: não conta atraso', daysLate({ status: 'awaiting_release', needed_by: '2026-10-01' }, hoje) === 0 && daysLate({ status: 'closed', needed_by: '2026-10-01' }, hoje) === 0 && daysLate({ status: 'cancelled', needed_by: '2026-10-01' }, hoje) === 0)
ok('sem prazo: sem atraso', daysLate({ status: 'requested', needed_by: null }, hoje) === 0)
ok('atrasada 12 dias', daysLate({ status: 'approved', needed_by: '2026-10-31' }, hoje) === 12)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
