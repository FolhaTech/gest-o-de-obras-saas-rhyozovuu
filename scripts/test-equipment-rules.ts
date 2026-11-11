import { addMonths, equipmentStatus, daysBetween, describeDue } from '../src/lib/equipment.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

ok('31/08 + 6 meses = 28/02 (fim de mês)', addMonths('2026-08-31', 6) === '2027-02-28', addMonths('2026-08-31', 6))
ok('31/08/2027 + 6 = 29/02/2028 (bissexto)', addMonths('2027-08-31', 6) === '2028-02-29', addMonths('2027-08-31', 6))
ok('15/11 + 6 meses = 15/05 do ano seguinte', addMonths('2026-11-15', 6) === '2027-05-15')
ok('+12 meses', addMonths('2026-03-10', 12) === '2027-03-10')
ok('dias entre datas', daysBetween('2026-11-11', '2026-12-11') === 30)

const hoje = '2026-11-11'
// comprado há mais de 6 meses, sem manutenção: vencida desde a compra + 6 meses
let s = equipmentStatus({ purchase_date: '2026-03-01' }, hoje)
ok('sem manutenção, comprado em 01/03: próxima 01/09 (vencida)', s.nextDate === '2026-09-01' && s.maintenanceAlert === 'overdue' && s.count === 0, JSON.stringify(s))
// comprado recentemente
s = equipmentStatus({ purchase_date: '2026-10-01' }, hoje)
ok('comprado em 01/10: tudo certo (ok)', s.nextDate === '2027-04-01' && s.maintenanceAlert === 'ok')
// vence em 30 dias = "soon"; em 31 = ok
s = equipmentStatus({ purchase_date: '2026-06-11' }, hoje)
ok('vence daqui a 30 dias: próxima manutenção (soon)', s.daysToNext === 30 && s.maintenanceAlert === 'soon', `${s.daysToNext}`)
s = equipmentStatus({ purchase_date: '2026-06-12' }, hoje)
ok('vence daqui a 31 dias: ainda ok', s.daysToNext === 31 && s.maintenanceAlert === 'ok')
// vence hoje não é vencida
s = equipmentStatus({ purchase_date: '2026-05-11' }, hoje)
ok('vence hoje: soon (não vencida)', s.daysToNext === 0 && s.maintenanceAlert === 'soon' && describeDue(s.daysToNext) === 'vence hoje')
s = equipmentStatus({ purchase_date: '2026-05-10' }, hoje)
ok('venceu ontem: vencida há 1 dia', s.daysToNext === -1 && s.maintenanceAlert === 'overdue' && describeDue(s.daysToNext) === 'vencida há 1 dia(s)')

// a última manutenção reinicia a contagem
s = equipmentStatus({ purchase_date: '2025-01-01', equipment_maintenances: [{ maintenance_date: '2026-09-20' }] }, hoje)
ok('manutenção em 20/09: próxima 20/03 (ok); conta 1', s.lastDate === '2026-09-20' && s.nextDate === '2027-03-20' && s.count === 1 && s.maintenanceAlert === 'ok')
// pega a mais recente, em qualquer ordem
s = equipmentStatus({ equipment_maintenances: [{ maintenance_date: '2026-01-10' }, { maintenance_date: '2026-08-05' }, { maintenance_date: '2025-12-01' }] }, hoje)
ok('usa a manutenção mais recente', s.lastDate === '2026-08-05' && s.count === 3)
// manutenções anteriores ao cadastro somam
s = equipmentStatus({ initial_maintenance_count: 3, last_maintenance_date: '2026-05-01', equipment_maintenances: [{ maintenance_date: '2026-09-01' }] }, hoje)
ok('anteriores (3) + registradas (1) = 4; última = 01/09', s.count === 4 && s.lastDate === '2026-09-01' && !s.replaceAlert)

// 5 manutenções: movimentar ou comprar
s = equipmentStatus({ initial_maintenance_count: 4, equipment_maintenances: [{ maintenance_date: '2026-09-01' }] , purchase_date: '2024-01-01'}, hoje)
ok('5ª manutenção liga o alerta de movimentar/comprar', s.count === 5 && s.replaceAlert)
s = equipmentStatus({ initial_maintenance_count: 4, purchase_date: '2024-01-01', last_maintenance_date: '2026-09-01' }, hoje)
ok('4 manutenções não liga o alerta', s.count === 4 && !s.replaceAlert)
s = equipmentStatus({ initial_maintenance_count: 6, purchase_date: '2024-01-01' }, hoje)
ok('6 manutenções também alerta', s.replaceAlert)

// intervalo configurável
s = equipmentStatus({ purchase_date: '2026-10-01', maintenance_interval_months: 3 }, hoje)
ok('intervalo de 3 meses: próxima 01/01', s.nextDate === '2027-01-01')
s = equipmentStatus({ purchase_date: '2026-10-01', maintenance_interval_months: 0 }, hoje)
ok('intervalo inválido cai no padrão de 6 meses', s.nextDate === '2027-04-01')

// aposentado não alerta
s = equipmentStatus({ status: 'retired', purchase_date: '2020-01-01', initial_maintenance_count: 9 }, hoje)
ok('aposentado não gera nenhum alerta', s.maintenanceAlert === 'none' && !s.replaceAlert && s.nextDate === null)

// sem nenhuma data
s = equipmentStatus({}, hoje)
ok('sem datas: sem alerta de prazo', s.maintenanceAlert === 'none' && s.nextDate === null)
s = equipmentStatus({ created_at: '2026-01-05T10:00:00Z' }, hoje)
ok('sem compra: usa a data do cadastro', s.nextDate === '2026-07-05' && s.maintenanceAlert === 'overdue')

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
