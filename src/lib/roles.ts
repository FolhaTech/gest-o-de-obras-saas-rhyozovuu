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

/**
 * Rotas permitidas para cada papel.
 * Prestador: SOMENTE Obras (/obras, /obras/:id), Materiais (/materiais), Diário de Obra (/diario-obra).
 * Admin e Gestor: Acesso irrestrito a todas as rotas.
 */
export function canAccessPath(
  role: AppRole | string | null | undefined,
  pathname: string,
): boolean {
  const norm = normalizeRole(role)
  if (norm === 'admin' || norm === 'gestor') {
    return true
  }

  // Normalização do pathname para validação de prefixos
  const cleanPath = pathname.split('?')[0].split('#')[0]

  // Rotas permitidas para o Prestador
  if (
    cleanPath === '/obras' ||
    cleanPath.startsWith('/obras/') ||
    cleanPath === '/materiais' ||
    cleanPath.startsWith('/materiais/') ||
    cleanPath === '/diario-obra' ||
    cleanPath.startsWith('/diario-obra/')
  ) {
    return true
  }

  return false
}
