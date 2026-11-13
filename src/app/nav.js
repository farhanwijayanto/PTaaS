// Single source of truth for navigation. Sidebar, breadcrumbs, command palette, and route guards all read this.
export const NAV = [
  {
    group: null,
    items: [{ path: '/dashboard', icon: 'layout-dashboard', label: 'nav.dashboard', roles: ['student', 'instructor', 'admin'] }]
  },
  {
    group: 'nav.group.compute',
    items: [
      { path: '/vms', icon: 'server', label: 'nav.vms', roles: ['student', 'instructor', 'admin'] },
      { path: '/vms/new', icon: 'circle-plus', label: 'nav.create', roles: ['student', 'instructor', 'admin'] },
      { path: '/desktop', icon: 'monitor', label: 'nav.desktop', roles: ['student', 'instructor', 'admin'] },
      { path: '/terminal', icon: 'terminal', label: 'nav.terminal', roles: ['student', 'instructor', 'admin'] },
      { path: '/studio', icon: 'code', label: 'nav.studio', roles: ['student', 'instructor', 'admin'] }
    ]
  },
  {
    group: 'nav.group.network',
    items: [
      { path: '/network', icon: 'network', label: 'nav.network', roles: ['student', 'instructor', 'admin'] },
      { path: '/targets', icon: 'crosshair', label: 'nav.targets', roles: ['student', 'instructor', 'admin'] }
    ]
  },
  {
    group: 'nav.group.storage',
    items: [{ path: '/storage', icon: 'hard-drive', label: 'nav.storage', roles: ['student', 'instructor', 'admin'] }]
  },
  {
    group: 'nav.group.security',
    items: [
      { path: '/monitoring', icon: 'activity', label: 'nav.monitoring', roles: ['student', 'instructor', 'admin'] },
      { path: '/compliance', icon: 'shield-check', label: 'nav.compliance', roles: ['student', 'instructor', 'admin'] }
    ]
  },
  {
    group: 'nav.group.instructor',
    roles: ['instructor'],
    items: [
      { path: '/approvals', icon: 'clipboard-check', label: 'nav.approvals', roles: ['instructor'] },
      { path: '/admin/users', icon: 'users', label: 'nav.students', roles: ['instructor'] },
      { path: '/admin/cohorts', icon: 'graduation-cap', label: 'nav.cohorts', roles: ['instructor'] },
      { path: '/admin/audit', icon: 'scroll-text', label: 'nav.audit', roles: ['instructor'] }
    ]
  },
  {
    group: 'nav.group.admin',
    roles: ['admin'],
    items: [
      { path: '/approvals', icon: 'clipboard-check', label: 'nav.approvals', roles: ['admin'] },
      { path: '/admin/users', icon: 'users', label: 'nav.users', roles: ['admin'] },
      { path: '/admin/cohorts', icon: 'graduation-cap', label: 'nav.cohorts', roles: ['admin'] },
      { path: '/admin/policies', icon: 'sliders', label: 'nav.policies', roles: ['admin'] },
      { path: '/admin/audit', icon: 'scroll-text', label: 'nav.audit', roles: ['admin'] }
    ]
  }
];

const allowed = (item, role) => !item.roles || item.roles.includes(role);

// Groups with role-filtered items; empty groups are dropped.
export function visibleNav(role) {
  return NAV
    .filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({
      group: g.group,
      items: g.items.filter((i) => allowed(i, role)).map((i) => ({ ...i, label: i.labelByRole?.[role] ?? i.label }))
    }))
    .filter((g) => g.items.length);
}

export const flatNav = (role) =>
  visibleNav(role).flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));

// Longest matching path wins, so /vms/new doesn't highlight /vms.
export function findActive(role, path) {
  return flatNav(role)
    .filter((i) => path === i.path || path.startsWith(`${i.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}
