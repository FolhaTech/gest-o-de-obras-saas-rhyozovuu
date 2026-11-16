// Testa a análise de prioridades do Cronograma (server/schedule-analysis.ts e schedule-ai.ts), sem rede nem banco.
// Uso: npx tsx scripts/test-schedule-analysis.ts
import {
  PHASE_LABEL,
  analyzeByRules,
  applyNotes,
  buildPrompt,
  factsOf,
  forecastOf,
  humanize,
  phaseOf,
  validateAi,
  type NoteIn,
  type StageIn,
} from '../server/schedule-analysis.ts'
import { geminiModels, runAnalysis } from '../server/schedule-ai.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

// ---------------------------------------------------------------- fase pelo nome
const fases: [string, number][] = [
  ['Pintura de Forro Drywall', 8],
  ['Forro Drywall sala', 5],
  ['Pintura de Gesso Liso', 8],
  ['gesso liso ', 5],
  ['Contra piso - jardim de inverno', 5],
  ['assentamento de piso quartos', 6],
  ['Rejunte de Piso', 7],
  ['Rejunte quartos', 7],
  ['Base de alvenaria Pias', 2],
  ['base de pia cozinha', 7],
  ['instalação de pia e torneiras', 9],
  ['instalação de vasos sanitários', 9],
  ['Instalação de rodapés', 9],
  ['Instalações de Cantoneiras', 9],
  ['Soleiras', 7],
  ['Estrutura do pergolado', 3],
  ['envernizar vigas e pilares do pergolado e telhado', 8],
  ['retirada do telhado antigo', 1],
  ['quebrar e regularizar murro de fachada', 1],
  ['Calhas e Pingadeiras', 3],
  ['Teto de Vidro', 3],
  ['Telhado ', 3],
  ['Eletrica ', 4],
  ['ESGOTO E HIDRÁULICA ', 4],
  ['Instalação de poste Padrão', 4],
  ['Montagem de quadro', 4],
  ['Assentamento de bloco ', 2],
  ['aumento de pé direito ', 2],
  ['reboco externo ', 5],
  ['Regularização de Calçada', 6],
  ['assentamento de Bloquete', 6],
  ['Janelas Max-ar', 6],
  ['Porta Maxsystem', 6],
  ['esquadrias ', 6],
  ['revestimento dos banheiros', 6],
  ['Canaleta pluvial (grelha)', 5],
  ['limpeza e organização da obra', 10],
  ['montagem da churrasqueira', 7],
  ['Algo sem relação nenhuma', 0],
]
const erradas = fases.filter(([n, r]) => phaseOf(n) !== r).map(([n, r]) => `${n}: esperado ${r}, veio ${phaseOf(n)}`)
ok('fase pelo nome das etapas de uma obra real', erradas.length === 0, erradas.join(' | '))
ok('toda fase tem texto', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((p) => !!PHASE_LABEL[p]))

// ---------------------------------------------------------------- dados de exemplo (hoje = 16/11/2026)
const hoje = '2026-11-16'
let seq = 0
const st = (name: string, start: string | null, end: string | null, progress: number, status: string, extra: Partial<StageIn> = {}): StageIn => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  name,
  start_date: start,
  end_date_planned: end,
  progress_percentage: progress,
  status,
  manager: 'Fulano da Silva',
  ...extra,
})
const stages: StageIn[] = [
  st('Instalação de poste Padrão', '2026-11-10', '2026-11-10', 80, 'in_progress'), // atrasada, instalações
  st('Base de alvenaria Pias', '2026-11-13', '2026-11-13', 70, 'in_progress'), // atrasada, alvenaria
  st('Forro Drywall sala', '2026-11-11', '2026-11-16', 95, 'in_progress'),
  st('reboco externo ', null, null, 90, 'in_progress', { manager: null }), // sem datas e sem responsável
  st('assentamento de piso quartos', '2026-11-11', '2026-11-13', 70, 'in_progress'), // atrasada, pisos
  st('assentamento de pisos sala e cozinha', '2026-11-11', '2026-11-13', 0, 'pending'), // atrasada, não começou
  st('Instalação de portas', '2026-11-09', '2026-11-13', 0, 'pending'),
  st('Pintura de Gesso Liso', '2026-11-13', '2026-11-16', 20, 'in_progress'),
  st('Pintura de área externa (Projetado)', '2026-11-11', '2026-11-20', 0, 'pending'),
  st('instalação de vasos sanitários', '2026-11-16', '2026-11-16', 0, 'pending'),
  st('instalação de pia e torneiras', '2026-11-17', '2026-11-17', 0, 'pending'),
  st('limpeza e organização da obra', '2026-11-13', '2026-11-13', 60, 'in_progress'),
  st('Rejunte quartos', '2026-11-16', '2026-11-17', 0, 'pending'),
  st('aumento de pé direito ', null, null, 30, 'completed'), // concluída com 30%
  st('Telhado ', null, null, 100, 'completed'),
  st('Eletrica ', null, null, 80, 'in_progress', { manager: null }),
]
const work = { end_date_planned: '2026-10-09' }
const by = (n: string) => stages.find((s) => s.name.trim() === n.trim())!.id

// ---------------------------------------------------------------- fatos e previsão
const fatos = factsOf(stages, hoje)
const fato = (n: string) => fatos.find((f) => f.name === n)!
ok('concluída: status completed ou 100%', fato('Telhado').done && fato('aumento de pé direito').done && !fato('Instalação de portas').done)
ok('atrasada: prazo vencido e não concluída (dias de atraso certos)', fato('Instalação de poste Padrão').overdue && fato('Instalação de poste Padrão').daysLate === 6 && !fato('Forro Drywall sala').overdue && fato('Forro Drywall sala').daysLate === 0)
ok('concluída nunca é atrasada', !fato('Telhado').overdue)
ok('sem datas', fato('reboco externo').undated && !fato('Forro Drywall sala').undated)
ok('inconsistência: concluída com menos de 100%', fato('aumento de pé direito').inconsistent && !fato('Telhado').inconsistent)
ok('dias restantes pelo planejado e pelo progresso', fato('assentamento de piso quartos').plannedDays === 3 && fato('assentamento de piso quartos').remainingDays === 1 && fato('Instalação de portas').remainingDays === 5)
const prev = forecastOf(fatos, hoje, work)
ok('previsão: maior entre o planejado das abertas e (hoje + o que falta) das atrasadas', prev.projected_end === '2026-11-21' && prev.days_delta === 43 && prev.planned_end === '2026-10-09', JSON.stringify(prev))
ok('previsão sem etapas em aberto é nula', forecastOf(factsOf([st('x', '2026-11-01', '2026-11-02', 100, 'completed')], hoje), hoje, work).projected_end === null)

// ---------------------------------------------------------------- análise por regras
const a = analyzeByRules(stages, work, hoje, new Date('2026-11-16T12:00:00Z'))
ok('fonte, contagens e resumo', a.source === 'rules' && a.counts.total === 16 && a.counts.done === 2 && a.counts.overdue === 6 && /2 de 16 etapas concluídas/.test(a.summary) && /43 dias depois do prazo/.test(a.summary), a.summary)
ok('não há observações: sem adaptação', a.notes_used === 0 && a.adaptation === undefined)
ok('fazer primeiro: atrasadas na frente, nada concluído', a.do_first.length > 0 && a.do_first.every((i) => !['Telhado', 'aumento de pé direito'].includes(i.name.trim())) && a.do_first[0].reason.includes('Atrasada'), a.do_first.map((i) => i.name).join(' | '))
ok('fazer primeiro: fase mais cedo antes (alvenaria e instalações antes de piso)', a.do_first.findIndex((i) => i.id === by('Base de alvenaria Pias')) < a.do_first.findIndex((i) => i.id === by('assentamento de piso quartos')))
ok('pode esperar: acabamento final que nem começou (louças, pintura externa, rejunte)', ['instalação de vasos sanitários', 'instalação de pia e torneiras'].every((n) => a.can_wait.some((i) => i.name === n)), a.can_wait.map((i) => i.name).join(' | '))
ok('pode esperar: nada que já começou, esteja atrasado ou seja de fase inicial', a.can_wait.every((i) => !['Pintura de Gesso Liso', 'limpeza e organização da obra', 'Base de alvenaria Pias', 'Instalação de poste Padrão'].includes(i.name.trim())))
ok('nenhuma etapa fica nas duas listas', a.do_first.every((i) => !a.can_wait.some((w) => w.id === i.id)))
ok('em paralelo: grupos de 2 ou mais da mesma fase, só etapas em aberto', a.in_parallel.length > 0 && a.in_parallel.every((g) => g.ids.length >= 2 && g.ids.length === g.names.length))
ok('atenção: atrasadas, sem datas, sem responsável e concluída com 30%', a.attention.some((x) => /Atrasada há 6 dias/.test(x.text)) && a.attention.some((x) => /sem datas/.test(x.text)) && a.attention.some((x) => /sem responsável/.test(x.text)) && a.attention.some((x) => /30%/.test(x.text)))
ok('dicas de como acelerar', a.speedup_tips.length >= 2 && a.speedup_tips.some((t) => /atrasada/.test(t)))
ok('obra toda concluída', /Todas as 2 etapas/.test(analyzeByRules([st('a', '2026-11-01', '2026-11-02', 100, 'completed'), st('b', null, null, 100, 'completed')], work, hoje).summary))
ok('sem etapas: não quebra', analyzeByRules([], work, hoje).counts.total === 0)

// ---------------------------------------------------------------- o responsável recusa e diz o motivo
const motivo = 'Falta material, só chega na semana que vem.'
const primeiro = a.do_first[0]
const recusaPrimeiro: NoteIn[] = [{ stage_id: primeiro.id, stage_name: primeiro.name, kind: 'rejected', from_list: 'do_first', reason: motivo }]
const b = analyzeByRules(stages, work, hoje, new Date(), recusaPrimeiro)
ok('recusou "fazer primeiro": sai dessa lista', !b.do_first.some((i) => i.id === primeiro.id))
const adiada = b.can_wait.find((i) => i.id === primeiro.id)
ok('...e vai para "pode esperar" com o motivo ("adiada a pedido")', !!adiada && /Adiada a pedido/.test(adiada.reason) && adiada.reason.includes('Falta material'), adiada?.reason)
ok('...a lista de prioridades se completa com a próxima etapa', b.do_first.length >= a.do_first.length - 1 && b.do_first.length > 0)
ok('...e conta como adaptação', b.notes_used === 1 && /1 etapa adiada a pedido/.test(b.adaptation ?? ''), b.adaptation)

const esperar = a.can_wait[0]
const queroJa = applyNotes(a, [{ stage_id: esperar.id, stage_name: esperar.name, kind: 'rejected', from_list: 'can_wait', reason: 'O cliente quer isso já.' }], stages, hoje)
ok('recusou "pode esperar": vira prioridade, no topo, com o motivo', queroJa.do_first[0].id === esperar.id && /fazer já/.test(queroJa.do_first[0].reason) && !queroJa.can_wait.some((i) => i.id === esperar.id), queroJa.do_first[0].reason)
ok('...e é contado como antecipada', /1 etapa antecipada a pedido/.test(queroJa.adaptation ?? ''))

const grupo = a.in_parallel[0]
const semGrupo = applyNotes(a, [{ stage_id: grupo.ids[0], kind: 'rejected', from_list: 'in_parallel', reason: 'Mesma equipe faz as duas.' }], stages, hoje)
ok('recusou "em paralelo": sai do grupo (grupo com menos de 2 some)', !semGrupo.in_parallel.some((g) => g.ids.includes(grupo.ids[0])) && semGrupo.in_parallel.every((g) => g.ids.length >= 2))

const restr = analyzeByRules(stages, work, hoje, new Date(), [{ stage_id: null, kind: 'constraint', reason: 'A equipe de pintura só chega dia 20.' }])
ok('restrição geral: aparece nos pontos de atenção (regras) e conta como observação', restr.attention[0].text.includes('equipe de pintura só chega dia 20') && restr.notes_used === 1)
ok('observação de etapa já concluída não muda nada', analyzeByRules(stages, work, hoje, new Date(), [{ stage_id: by('Telhado '), kind: 'rejected', from_list: 'do_first', reason: 'x y z' }]).do_first.length === a.do_first.length)
ok('observação em branco é ignorada', applyNotes(a, [{ stage_id: primeiro.id, kind: 'rejected', from_list: 'do_first', reason: '   ' }], stages, hoje).notes_used === 0)

// ---------------------------------------------------------------- o que vai para a IA
const prompt = buildPrompt(stages, work, hoje, a, [
  { stage_id: by('Instalação de portas'), stage_name: 'Instalação de portas', kind: 'rejected', from_list: 'do_first', reason: 'Porta só chega dia 20. '.repeat(40) },
  { stage_id: null, kind: 'constraint', reason: 'Equipe de gesso indisponível' },
])
const dados = JSON.parse(prompt)
ok('a IA recebe ids curtos e nunca os ids reais', dados.etapas[0].id === 'e1' && !prompt.includes('00000000-0000-4000') && dados.etapas.length === stages.length)
ok('a IA não recebe nomes de pessoas', !prompt.includes('Fulano'))
ok('a IA recebe só dados da obra (datas, progresso, situação, atraso)', dados.etapas[0].situacao === 'em_andamento' && dados.etapas[0].atrasada_dias === 6 && dados.etapas[0].progresso === 80 && dados.hoje === hoje && dados.prazo_final_da_obra === '2026-10-09')
ok('as observações do responsável vão com o id curto da etapa, o tipo e o motivo (cortado)', dados.observacoes_do_responsavel.length === 2 && dados.observacoes_do_responsavel[0].etapa === 'e7' && dados.observacoes_do_responsavel[0].tipo === 'nao_vou_seguir_a_sugestao' && dados.observacoes_do_responsavel[0].estava_em === 'prioridade' && dados.observacoes_do_responsavel[0].motivo.length <= 300 && dados.observacoes_do_responsavel[1].tipo === 'restricao_geral' && dados.observacoes_do_responsavel[1].etapa === null)

// ---------------------------------------------------------------- conferência da resposta da IA
const e = (n: string) => `e${stages.findIndex((s) => s.name.trim() === n.trim()) + 1}`
const boa = {
  summary: 'A obra tem 6 etapas atrasadas. Foque nas instalações e nos pisos.',
  do_first: [
    { id: e('Instalação de poste Padrão'), reason: `A etapa ${e('Instalação de poste Padrão')} está 6 dias atrasada (${e('Instalação de poste Padrão')}).` },
    { id: 'e999', reason: 'id que não existe' },
    { id: e('Telhado'), reason: 'já concluída' },
    { id: e('Instalação de poste Padrão'), reason: 'repetida' },
    { id: e('assentamento de piso quartos'), reason: '' },
  ],
  in_parallel: [
    { ids: [e('Eletrica'), e('Instalação de poste Padrão')], reason: 'Elétrica e poste juntos.' },
    { ids: [e('Instalação de portas'), 'e999', e('Telhado')], reason: 'grupo com só 1 etapa válida' },
  ],
  can_wait: [{ id: e('instalação de vasos sanitários'), reason: 'Louça é a última fase.' }],
  attention: [{ id: e('Instalação de portas'), text: 'Atrasada.' }, { text: 'Sem id mesmo.' }, { text: '' }],
  speedup_tips: ['Mais uma equipe nos pisos.', ''],
  adaptation: 'Ajustei por causa do que você informou (e7).',
}
const v = validateAi(boa, stages, work, hoje, a)
ok('resposta boa: fonte "ai", forecast e contagens vêm das regras', v?.source === 'ai' && v.forecast.days_delta === 43 && v.counts.total === 16)
ok('só ids conhecidos, em aberto, sem repetir e com motivo', v?.do_first.length === 1 && v.do_first[0].id === by('Instalação de poste Padrão'), JSON.stringify(v?.do_first.map((i) => i.name)))
ok('o nome da etapa vem do cadastro (não da IA)', v?.do_first[0].name === 'Instalação de poste Padrão')
ok('ids internos somem dos textos (vira o nome ou desaparece)', !/\be\d+\b/.test(JSON.stringify(v)) && v!.do_first[0].reason.includes('"Instalação de poste Padrão"'), v?.do_first[0].reason)
ok('grupo em paralelo precisa de 2 etapas válidas', v?.in_parallel.length === 0 || v?.in_parallel.every((g) => g.ids.length >= 2), String(v?.in_parallel.length))
ok('pode esperar e atenção (com e sem etapa)', v?.can_wait.length === 1 && v.attention.length === 2 && v.attention[0].id === by('Instalação de portas') && v.attention[1].id === null)
const vNotas = validateAi(boa, stages, work, hoje, a, new Date(), [{ stage_id: null, kind: 'constraint', reason: 'Equipe de gesso indisponível' }])
ok('dicas limpas; sem observações não há adaptação, com observações a explicação da IA fica (sem ids)', v?.speedup_tips.length === 1 && v.adaptation === undefined && vNotas?.adaptation === 'Ajustei por causa do que você informou.', vNotas?.adaptation)
ok('resposta inútil vira nulo', validateAi({ summary: '', do_first: [] }, stages, work, hoje, a) === null && validateAi(null, stages, work, hoje, a) === null && validateAi('texto', stages, work, hoje, a) === null && validateAi({ summary: 'x', do_first: [{ id: 'e999', reason: 'x' }] }, stages, work, hoje, a) === null)
ok('textos enormes são cortados', (validateAi({ summary: 'a'.repeat(5000), do_first: [{ id: 'e1', reason: 'b'.repeat(5000) }] }, stages, work, hoje, a)?.do_first[0].reason.length ?? 0) <= 280)

// o que o responsável recusou é aplicado mesmo se a IA ignorar
const ia = { summary: 'Plano.', do_first: [{ id: 'e1', reason: 'Prioridade.' }, { id: 'e5', reason: 'Piso.' }], in_parallel: [], can_wait: [], attention: [], speedup_tips: [] }
const vn = validateAi(ia, stages, work, hoje, a, new Date(), [{ stage_id: stages[0].id, stage_name: stages[0].name, kind: 'rejected', from_list: 'do_first', reason: 'Falta o poste.' }])
ok('a IA colocou em "fazer primeiro" uma etapa recusada: ela é tirada e vai para "pode esperar"', !vn?.do_first.some((i) => i.id === stages[0].id) && !!vn?.can_wait.some((i) => i.id === stages[0].id) && vn?.notes_used === 1)

// ---------------------------------------------------------------- humanize
const nomes = (k: string) => ({ e1: 'Piso', e11: 'Portas' })[k] ?? null
ok('humanize: tira "(e1)" e troca "e11" pelo nome', humanize('Termine o piso (e1) e depois e11 está livre.', nomes) === 'Termine o piso e depois "Portas" está livre.', humanize('Termine o piso (e1) e depois e11 está livre.', nomes))
ok('humanize: lista de ids entre parênteses e id desconhecido', humanize('Aumente a equipe (e1 e e11) agora; e77 sobra.', nomes) === 'Aumente a equipe agora; sobra.', humanize('Aumente a equipe (e1 e e11) agora; e77 sobra.', nomes))
ok('humanize: texto sem ids não muda', humanize('Faça a elétrica e a hidráulica.', nomes) === 'Faça a elétrica e a hidráulica.')

// ---------------------------------------------------------------- orquestração (IA falsa)
const semIa = await runAnalysis(stages, work, hoje, [], null)
ok('sem chave: análise por regras com aviso', semIa.source === 'rules' && /não está configurada/.test(semIa.notice ?? ''))
const quebra = await runAnalysis(stages, work, hoje, [], async () => { throw new Error('Gemini respondeu 500') })
ok('a IA falhou: análise por regras com aviso (sem o erro técnico)', quebra.source === 'rules' && /não respondeu/.test(quebra.notice ?? '') && !/500/.test(quebra.notice ?? ''))
const lixo = await runAnalysis(stages, work, hoje, [], async () => ({ foo: 1 }))
ok('a IA devolveu lixo: análise por regras com aviso', lixo.source === 'rules' && /não deu para usar/.test(lixo.notice ?? ''))
let promptVisto = ''
const comIa = await runAnalysis(stages, work, hoje, recusaPrimeiro, async (p) => { promptVisto = p; return boa })
ok('a IA respondeu bem: fonte "ai" e as observações vão no pedido', comIa.source === 'ai' && !comIa.notice && JSON.parse(promptVisto).observacoes_do_responsavel.length === 1)

// ---------------------------------------------------------------- modelos
ok('modelos: o da configuração vai na frente, sem repetir, no máximo 2', geminiModels('gemini-x').join() === 'gemini-x,gemini-3.5-flash' && geminiModels('gemini-3.5-flash').join() === 'gemini-3.5-flash,gemini-3.6-flash' && geminiModels(undefined).join() === 'gemini-3.5-flash,gemini-3.6-flash' && geminiModels('  ').length === 2)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
