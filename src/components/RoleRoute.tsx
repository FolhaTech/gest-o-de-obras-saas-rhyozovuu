import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import AccessDenied from '@/pages/AccessDenied'

interface RoleRouteProps {
  /**
   * Se definido, permite apenas esses papéis específicos.
   * Se omitido, utiliza a função context.canAccess(pathname).
   */
  allowedRoles?: string[]
}

export function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const { role, canAccess } = useAuth()
  const location = useLocation()

  if (allowedRoles) {
    if (!allowedRoles.includes(role)) {
      return <AccessDenied />
    }
    return <Outlet />
  }

  if (!canAccess(location.pathname)) {
    return <AccessDenied />
  }

  return <Outlet />
}
