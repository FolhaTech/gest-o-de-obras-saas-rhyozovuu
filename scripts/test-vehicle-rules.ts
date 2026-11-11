// Testa as regras de src/lib/vehicles.ts. Uso: npx tsx scripts/test-vehicle-rules.ts
import { expiryState, describeExpiry, serviceDue, fuelStats, normalizePlate } from '../src/lib/vehicles.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}
const hoje = '2026-11-11'

// ---------------------------------------------------------------- vencimentos
ok('sem data: sem aviso', expiryState(null, hoje).state === 'none' && expiryState('', hoje).state === 'none')
ok('vencido ontem', expiryState('2026-11-10', hoje).state === 'overdue' && expiryState('2026-11-10', hoje).days === -1)
ok('vence hoje: aviso "soon", não vencido', expiryState('2026-11-11', hoje).state === 'soon' && describeExpiry(0) === 'vence hoje')
ok('vence em 30 dias: soon', expiryState('2026-12-11', hoje).state === 'soon')
ok('vence em 31 dias: ok', expiryState('2026-12-12', hoje).state === 'ok')
ok('texto de vencido', describeExpiry(-3) === 'vencido há 3 dia(s)' && describeExpiry(5) === 'vence em 5 dia(s)')
ok('virada de ano', expiryState('2027-01-05', '2026-12-30').days === 6)

// ---------------------------------------------------------------- revisão (data e/ou km)
ok('sem plano de revisão: sem aviso', serviceDue([{ maintenance_date: '2026-01-01' }], 50000, hoje).state === 'none')
ok('sem manutenções: sem aviso', serviceDue([], 0, hoje).state === 'none')
let s = serviceDue([{ maintenance_date: '2026-09-01', next_due_date: '2027-03-01', next_due_km: 60000 }], 52000, hoje)
ok('data longe e km longe: ok', s.state === 'ok' && s.kmLeft === 8000)
s = serviceDue([{ maintenance_date: '2026-09-01', next_due_date: '2027-03-01', next_due_km: 52300 }], 52000, hoje)
ok('faltam 300 km: aviso próximo', s.state === 'soon' && s.kmLeft === 300)
s = serviceDue([{ maintenance_date: '2026-09-01', next_due_date: '2027-03-01', next_due_km: 52500 }], 52000, hoje)
ok('faltam exatamente 500 km: aviso próximo', s.state === 'soon')
s = serviceDue([{ maintenance_date: '2026-09-01', next_due_date: '2027-03-01', next_due_km: 52501 }], 52000, hoje)
ok('faltam 501 km: ainda ok', s.state === 'ok')
s = serviceDue([{ maintenance_date: '2026-09-01', next_due_km: 52000 }], 52000, hoje)
ok('km atingido: vencida', s.state === 'overdue' && s.kmLeft === 0)
s = serviceDue([{ maintenance_date: '2026-09-01', next_due_km: 52000 }], 53000, hoje)
ok('km ultrapassado: vencida', s.state === 'overdue' && s.kmLeft === -1000)
s = serviceDue([{ maintenance_date: '2026-05-01', next_due_date: '2026-11-10' }], 1000, hoje)
ok('data passou: vencida (mesmo com km sobrando)', s.state === 'overdue' && s.daysLeft === -1)
s = serviceDue([{ maintenance_date: '2026-05-01', next_due_date: '2026-11-20' }], 1000, hoje)
ok('faltam 9 dias: aviso próximo', s.state === 'soon' && s.daysLeft === 9)
s = serviceDue([
  { maintenance_date: '2026-01-10', next_due_date: '2026-07-10' }, // antigo, vencido
  { maintenance_date: '2026-10-01', next_due_date: '2027-04-01' }, // o mais recente vale
], 0, hoje)
ok('vale a manutenção mais recente com plano', s.state === 'ok' && s.nextDate === '2027-04-01')
s = serviceDue([
  { maintenance_date: '2026-10-01' }, // mais recente, mas sem plano
  { maintenance_date: '2026-03-01', next_due_date: '2026-09-01' },
], 0, hoje)
ok('ignora manutenção sem plano e usa a última que tem', s.state === 'overdue' && s.nextDate === '2026-09-01')

// ---------------------------------------------------------------- combustível
let f = fuelStats([])
ok('sem notas: tudo zerado', f.count === 0 && f.liters === 0 && f.kmPerLiter === null && f.avgPricePerLiter === null)
f = fuelStats([{ receipt_date: '2026-10-01', liters: 40, total_value: 240, odometer_km: 10000 }])
ok('uma nota: sem consumo médio', f.kmPerLiter === null && f.liters === 40 && f.spent === 240)
f = fuelStats([
  { receipt_date: '2026-10-01', liters: 40, total_value: 240, odometer_km: 10000 },
  { receipt_date: '2026-10-10', liters: 30, total_value: 180, odometer_km: 10300 },
])
ok('consumo = km rodados ÷ litros do 2º abastecimento (300/30 = 10 km/L)', f.kmPerLiter === 10, String(f.kmPerLiter))
f = fuelStats([
  { receipt_date: '2026-10-20', liters: 50, total_value: 300, odometer_km: 10900 },
  { receipt_date: '2026-10-01', liters: 40, total_value: 240, odometer_km: 10000 },
  { receipt_date: '2026-10-10', liters: 30, total_value: 180, odometer_km: 10300 },
])
ok('ordena por km (não pela ordem recebida): 900 km / 80 L = 11,25', f.kmPerLiter === 11.25 && f.count === 3 && f.liters === 120, String(f.kmPerLiter))
ok('valor médio do litro = 720/120 = 6', f.avgPricePerLiter === 6 && f.spent === 720)
f = fuelStats([
  { receipt_date: '2026-10-01', liters: 40, odometer_km: 10000 },
  { receipt_date: '2026-10-10', liters: 30, odometer_km: 10300 },
])
ok('sem valores (gestor): consumo calcula, gasto e preço ficam vazios', f.kmPerLiter === 10 && f.spent === 0 && f.avgPricePerLiter === null)
f = fuelStats([
  { receipt_date: '2026-10-01', liters: '40', total_value: '240.00', odometer_km: 10000 },
  { receipt_date: '2026-10-10', liters: '30.5', total_value: '183', odometer_km: 10305 },
])
ok('aceita números como texto (vem do banco)', f.liters === 70.5 && f.spent === 423 && Math.abs((f.kmPerLiter as number) - 10) < 1e-9)
f = fuelStats([
  { receipt_date: '2026-10-01', liters: 40, odometer_km: 10000 },
  { receipt_date: '2026-10-10', liters: 30 }, // sem km
])
ok('nota sem km não entra no consumo', f.kmPerLiter === null && f.count === 2)
f = fuelStats([
  { receipt_date: '2026-10-01', liters: 40, odometer_km: 10000 },
  { receipt_date: '2026-10-10', liters: 30, odometer_km: 10000 },
])
ok('km igual nas duas notas: sem consumo (evita divisão por zero)', f.kmPerLiter === null)

ok('placa em maiúsculas e sem espaços nas pontas', normalizePlate('  abc1d23 ') === 'ABC1D23')

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
