export type AppRole = 'admin' | 'gestor' | 'prestador'

/**
 * Normaliza qualquer valor vindo do banco/metadados para uma role canônica:
 * - 'admin' -> 'admin'
 * - 'gestor', 'manager' -> 'gestor'
 * - 'prestador' -> 'prestador'
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
    case 'prestador':
      return 'Prestador'
  }
}

/** Valores (R$, preços, custos, receitas, ROI): só o administrador. O Gestor tem as mesmas permissões, sem valores. */
export function canSeeValuesFor(role: AppRole | string | null | undefined): boolean {
  return normalizeRole(role) === 'admin'
}

/** Páginas que só existem para quem vê valores (despesas e Airbnb são 100% financeiras). */
const VALUE_ONLY_PATHS = ['/despesas', '/airbnb']

/**
 * Rotas permitidas para cada papel.
 * Prestador: Obras (/obras, /obras/:id), Planner (/planner), Materiais (/materiais), Diário de Obra (/diario-obra),
 * Manutenção das casas (/manutencao).
 * Admin: acesso irrestrito. Gestor: tudo, menos as páginas financeiras (despesas e Airbnb).
 */
export function canAccessPath(
  role: AppRole | string | null | undefined,
  pathname: string,
): boolean {
  const norm = normalizeRole(role)
  if (norm === 'admin') return true
  if (norm === 'gestor') {
    const p = pathname.split('?')[0].split('#')[0]
    return !VALUE_ONLY_PATHS.some((v) => p === v || p.startsWith(v + '/'))
  }

  // Normalização do pathname para validação de prefixos
  const cleanPath = pathname.split('?')[0].split('#')[0]

  // Manual do Sistema: acessível a qualquer papel logado
  if (cleanPath === '/manual' || cleanPath.startsWith('/manual/')) {
    return true
  }

  // Rotas permitidas para o Prestador
  if (
    cleanPath === '/planner' ||
    cleanPath.startsWith('/planner/') ||
    cleanPath === '/obras' ||
    cleanPath.startsWith('/obras/') ||
    cleanPath === '/materiais' ||
    cleanPath.startsWith('/materiais/') ||
    cleanPath === '/diario-obra' ||
    cleanPath.startsWith('/diario-obra/') ||
    cleanPath === '/manutencao' ||
    cleanPath.startsWith('/manutencao/')
  ) {
    return true
  }

  return false
}
