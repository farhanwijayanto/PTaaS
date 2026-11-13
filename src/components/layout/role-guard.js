import { useAuth } from '../../lib/auth.js';

// UI-level guard: render `children` only for the listed roles, otherwise `fallback` (or nothing).
// Route-level guarding lives in lib/router.js via the `roles` field on a route.
export function RoleGuard({ roles, children, fallback = null }) {
  const { role } = useAuth();
  return roles.includes(role) ? children : fallback;
}
