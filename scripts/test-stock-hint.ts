// Testa as regras de src/lib/stock-hint.ts. Uso: npx tsx scripts/test-stock-hint.ts
import { findStock, groupStock, normalizeName, stockAdvice } from '../src/lib/stock-hint.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

ok('nome sem acento, minúsculo e com espaço normalizado', normalizeName('  Cimento   CP-II Çá ') === 'cimento cp-ii ca')
ok('texto vazio', normalizeName('') === '')

const mats = [
  { name: 'Cimento CP-II 50 kg', unit_of_measure: 'saco', stock_quantity: 12, work_id: null },
  { name: 'cimento cp-ii 50 kg', unit_of_measure: 'saco', stock_quantity: 5, work_id: 'obra1' }, // alocado
  { name: 'Areia Média', unit_of_measure: 'm³', unidade_nativa: 'm³', stock_quantity: '3.5', work_id: null },
  { name: 'Areia Fina', unit_of_measure: 'm³', stock_quantity: 0, work_id: null },
  { name: 'Tijolo', unit_of_measure: 'un', stock_quantity: null, work_id: null },
  { name: 'Cimento Branco', unit_of_measure: 'kg', stock_quantity: 8, work_id: null },
  { name: 'Tinta', stock_quantity: 4, work_id: null },
]

const g = groupStock(mats)
ok('une os cadastros de mesmo nome (sem acento/caixa) e separa geral de alocado', g.length === 6 && g[0].general === 12 && g[0].allocated === 5, JSON.stringify(g[0]))
ok('quantidade em texto (numeric da API) e nula', g.find((x) => x.name === 'Areia Média')?.general === 3.5 && g.find((x) => x.name === 'Tijolo')?.general === 0)
ok('unidade: nativa primeiro, senão a de medida; vazia se não há', g.find((x) => x.name === 'Areia Média')?.unit === 'm³' && g[0].unit === 'saco' && g.find((x) => x.name === 'Tinta')?.unit === '')
ok('nome em branco é ignorado', groupStock([{ name: '  ', stock_quantity: 3 }]).length === 0)

ok('acha o item pelo nome exato (ignorando acento e caixa)', findStock('cimento CP-II 50 KG', mats).exact?.general === 12 && findStock('areia media', mats).exact?.name === 'Areia Média')
ok('item que não existe: sem exato e sem parecidos', (() => { const r = findStock('Furadeira', mats); return r.exact === null && r.similar.length === 0 })())
ok('texto curto demais não procura', findStock('ci', mats).exact === null && findStock('ci', mats).similar.length === 0 && findStock('', mats).exact === null)
const sim = findStock('cimento', mats)
ok('parecidos: nomes que contêm o texto, em ordem, sem o exato', sim.exact === null && sim.similar.map((s) => s.name).join('|') === 'Cimento Branco|Cimento CP-II 50 kg', sim.similar.map((s) => s.name).join('|'))
ok('parecidos: o texto digitado contém o nome do cadastro', findStock('Tijolo furado 8 furos', mats).similar[0]?.name === 'Tijolo')
const muitos = findStock('a', [])
ok('sem materiais', muitos.exact === null && muitos.similar.length === 0)
const lim = findStock('item', Array.from({ length: 6 }, (_, i) => ({ name: `Item ${i}`, stock_quantity: 1, work_id: null })))
ok('no máximo 3 parecidos', lim.similar.length === 3)

const cim = findStock('Cimento CP-II 50 kg', mats).exact!
const cobre = stockAdvice(cim, 10, 'saco')
ok('estoque cobre o pedido (mesma unidade)', cobre.level === 'enough' && cobre.missing === 0 && cobre.text.includes('12 saco') && cobre.text.includes('cobre os 10 pedidos'), cobre.text)
ok('mostra o que está alocado em obras à parte', cobre.text.includes('mais 5 saco já alocado em obras'), cobre.text)
const falta = stockAdvice(cim, 20, 'Saco')
ok('estoque cobre parte: diz quanto falta (unidade com outra caixa conta igual)', falta.level === 'partial' && falta.missing === 8 && falta.text.includes('Faltam 8 saco'), falta.text)
const igual = stockAdvice(cim, 12, 'saco')
ok('pedido igual ao estoque: cobre', igual.level === 'enough')
const outra = stockAdvice(cim, 10, 'kg')
ok('unidade diferente: informa o estoque sem comparar', outra.level === 'partial' && outra.missing === null && outra.text.includes('Você já tem 12 saco') && !outra.text.includes('Faltam'), outra.text)
const semQtd = stockAdvice(cim, 0, 'saco')
ok('quantidade zero: só informa', semQtd.missing === null && semQtd.text.includes('12 saco'))
const vazio = stockAdvice(findStock('Areia Fina', mats).exact!, 2, 'm³')
ok('estoque zerado: diz que não tem e pode comprar', vazio.level === 'empty' && vazio.text.includes('não tem') && vazio.text.includes('Pode comprar'), vazio.text)
const semUnid = stockAdvice(findStock('Tinta', mats).exact!, 2, 'un')
ok('estoque sem unidade cadastrada: informa sem comparar', semUnid.missing === null && semUnid.text.includes('Você já tem 4 em estoque'), semUnid.text)
const dec = stockAdvice(findStock('Areia Média', mats).exact!, 5, 'm³')
ok('decimais em pt-BR', dec.text.includes('3,5 m³') && dec.text.includes('Faltam 1,5 m³'), dec.text)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
