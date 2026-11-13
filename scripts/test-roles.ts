// Testa as regras de papéis de src/lib/roles.ts. Uso: npx tsx scripts/test-roles.ts
import { canAccessPath, canSeeBillingFor, canSeeValuesFor, isReadOnlyFor, normalizeRole } from '../src/lib/roles.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

const ALL = ['/', '/planner', '/obras', '/obras/123', '/diario-obra', '/materiais', '/manutencao', '/faturamento', '/equipes', '/veiculos', '/despesas', '/airbnb', '/relatorios', '/configuracoes', '/manual']
const allowed = (role: string) => ALL.filter((p) => canAccessPath(role, p))

// ---------------------------------------------------------------- nomes dos papéis
ok('nomes aceitos', normalizeRole('Financeiro') === 'financeiro' && normalizeRole(' finance ') === 'financeiro' && normalizeRole('manager') === 'gestor' && normalizeRole('admin') === 'admin' && normalizeRole('fornecedor') === 'prestador')

// ---------------------------------------------------------------- financeiro: consulta + Faturamento
ok(
  'financeiro entra em Faturamento e, só para consulta, Dashboard, Obras, Despesas, Equipes, Materiais, Relatórios e Manual',
  allowed('financeiro').join() === ['/', '/obras', '/obras/123', '/materiais', '/faturamento', '/equipes', '/despesas', '/relatorios', '/manual'].join(),
  allowed('financeiro').join(),
)
ok('financeiro NÃO entra em Planner, Diário, Manutenção, Veículos, Airbnb e Configurações', ['/planner', '/diario-obra', '/manutencao', '/veiculos', '/airbnb', '/configuracoes'].every((p) => !canAccessPath('financeiro', p)))
ok('rota raiz é só "/" exata (não libera o resto por prefixo)', canAccessPath('financeiro', '/') && !canAccessPath('financeiro', '/qualquer-coisa') && !canAccessPath('financeiro', '/obrasx'))
ok('financeiro vê valores e só consulta', canSeeValuesFor('financeiro') && canSeeBillingFor('financeiro') && isReadOnlyFor('financeiro') && isReadOnlyFor(' Finance '))

// ---------------------------------------------------------------- os outros papéis seguem como antes
ok('admin entra em tudo, vê valores e edita', ALL.every((p) => canAccessPath('admin', p)) && canSeeValuesFor('admin') && canSeeBillingFor('admin') && !isReadOnlyFor('admin'))
ok('gestor entra em tudo menos Despesas e Airbnb, sem valores, e edita', allowed('gestor').join() === ALL.filter((p) => p !== '/despesas' && p !== '/airbnb').join() && !canSeeValuesFor('gestor') && !canSeeBillingFor('gestor') && !isReadOnlyFor('gestor'))
ok('prestador: Planner, Obras, Diário, Materiais, Manutenção, Faturamento e Manual', allowed('prestador').join() === ['/planner', '/obras', '/obras/123', '/diario-obra', '/materiais', '/manutencao', '/faturamento', '/manual'].join(), allowed('prestador').join())
ok('prestador sem valores e sem a trava de consulta (edita o que é dele)', !canSeeValuesFor('prestador') && !canSeeBillingFor('prestador') && !isReadOnlyFor('prestador'))
ok('papel desconhecido cai em prestador (padrão seguro)', normalizeRole('hacker') === 'prestador' && !canAccessPath('hacker', '/despesas') && !canAccessPath('hacker', '/equipes') && !canSeeValuesFor('hacker'))

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
