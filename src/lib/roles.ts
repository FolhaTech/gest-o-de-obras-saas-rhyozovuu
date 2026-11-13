export type AppRole = 'admin' | 'gestor' | 'prestador' | 'financeiro'

/**
 * Normaliza qualquer valor vindo do banco/metadados para uma role canônica:
 * - 'admin' -> 'admin'
 * - 'gestor', 'manager' -> 'gestor'
 * - 'prestador' -> 'prestador'
 * - 'financeiro', 'finance' -> 'financeiro'
 * - 'engineer' (compatibilidade legado) -> 'gestor'
 * - Padrão de segurança: fallback para 'prestador' ou o default definido
 */
export function normalizeRole(rawRole?: string | null): AppRole {
  if (!rawRole) return 'admin' // Se não houver perfil/role cadastrado, mantém padrão amigável legado ou admin
  const lower = rawRole.toLowerCase().trim()

  if (lower === 'admin' || lower === 'administrador') return 'admin'
  if (
    lower === 'gestor' ||
    lower === 'gerente' ||
    lower === 'manager' ||
    lower === 'engineer' ||
    lower === 'engenheiro'
  ) {
    return 'gestor'
  }
  if (lower === 'financeiro' || lower === 'finance') return 'financeiro'
  if (lower === 'prestador' || lower === 'fornecedor' || lower === 'terceirizado') {
    return 'prestador'
  }

  // Caso desconhecido, mantém prestador por segurança
  return 'prestador'
}

export function getRoleLabel(role: AppRole | string | null | undefined): string {
  const norm = normalizeRole(role)
  switch (norm) {
    case 'admin':
      return 'Administrador'
    case 'gestor':
      return 'Gestor de Obras'
    case 'financeiro':
      return 'Financeiro'
    case 'prestador':
      return 'Prestador'
  }
}

/**
 * Valores (R$, preços, custos, receitas, ROI): o administrador e o Financeiro (que só consulta). O Gestor tem as
 * mesmas permissões do administrador, sem valores.
 */
export function canSeeValuesFor(role: AppRole | string | null | undefined): boolean {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'financeiro'
}

/** Só consulta: o Financeiro vê as áreas liberadas a ele, mas não cria, edita nem exclui (só no Faturamento). */
export function isReadOnlyFor(role: AppRole | string | null | undefined): boolean {
  return normalizeRole(role) === 'financeiro'
}

/** Valores do Faturamento (compras e pagamento da equipe): Administrador e Financeiro. */
export function canSeeBillingFor(role: AppRole | string | null | undefined): boolean {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'financeiro'
}

/** Páginas que só existem para quem vê valores (despesas e Airbnb são 100% financeiras): o Gestor não entra. */
const VALUE_ONLY_PATHS = ['/despesas', '/airbnb']

/** Rotas do Prestador (colaborador): Obras, Planner, Materiais, Diário de Obra, Manutenção das casas e Faturamento > Compras. */
const PRESTADOR_PATHS = ['/planner', '/obras', '/materiais', '/diario-obra', '/manutencao', '/faturamento']

/**
 * Rotas do Financeiro: o Faturamento (compras e pagamento da equipe) e, só para consulta, Dashboard, Obras, Despesas,
 * Equipes, Materiais e Relatórios. Fora: Planner, Diário de Obra, Manutenção, Veículos, Airbnb e Configurações.
 */
const FINANCEIRO_PATHS = ['/', '/faturamento', '/obras', '/despesas', '/equipes', '/materiais', '/relatorios']

const underPath = (clean: string, base: string) => clean === base || clean.startsWith(base + '/')

/**
 * Rotas permitidas para cada papel.
 * Admin: acesso irrestrito. Gestor: tudo, menos as páginas financeiras (despesas e Airbnb).
 * Prestador: Obras, Planner, Materiais, Diário de Obra, Manutenção e Faturamento (só Compras).
 * Financeiro: Faturamento (edita) e Dashboard, Obras, Despesas, Equipes, Materiais e Relatórios (só consulta).
 * Manual do Sistema: qualquer papel.
 */
export function canAccessPath(
  role: AppRole | string | null | undefined,
  pathname: string,
): boolean {
  const norm = normalizeRole(role)
  const cleanPath = pathname.split('?')[0].split('#')[0]

  if (norm === 'admin') return true
  if (norm === 'gestor') return !VALUE_ONLY_PATHS.some((v) => underPath(cleanPath, v))

  if (underPath(cleanPath, '/manual')) return true

  const allowed = norm === 'financeiro' ? FINANCEIRO_PATHS : PRESTADOR_PATHS
  return allowed.some((p) => underPath(cleanPath, p))
}
