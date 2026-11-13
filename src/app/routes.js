import { DashboardPage } from '../features/vm/dashboard.js';
import { VmListPage } from '../features/vm/vm-list.js';
import { VmCreatePage } from '../features/vm/vm-create.js';
import { DesktopPage } from '../features/desktop/desktop.js';
import { TerminalPage } from '../features/terminal/terminal.js';
import { StudioPage } from '../features/studio/studio.js';
import { NetworkPage } from '../features/network/network.js';
import { TargetsPage } from '../features/targets/targets.js';
import { StoragePage } from '../features/storage/storage.js';
import { MonitoringPage } from '../features/security/monitoring.js';
import { CompliancePage } from '../features/security/compliance.js';
import { LandingPage } from '../features/landing/landing.js';
import { LoginPage } from '../features/auth/login.js';
import { UsersPage } from '../features/admin/users.js';
import { CohortsPage } from '../features/admin/cohorts.js';
import { AuditLogPage } from '../features/admin/audit.js';
import { ApprovalsPage } from '../features/admin/approvals.js';
import { PoliciesPage } from '../features/admin/policies.js';

// auth:false = public. `roles` = route guard (403 page for anyone else). layout: 'app' (default) | 'bare'.
export const routes = [
  { path: '/', auth: false, layout: 'bare', titleKey: 'landing.nav.features', view: LandingPage },
  { path: '/login', auth: false, layout: 'bare', titleKey: 'login.stub.title', view: LoginPage },

  { path: '/dashboard', titleKey: 'nav.dashboard', view: DashboardPage },
  { path: '/vms', titleKey: 'nav.vms', view: VmListPage },
  { path: '/vms/new', titleKey: 'nav.create', view: VmCreatePage },
  { path: '/desktop', titleKey: 'nav.desktop', view: DesktopPage },
  { path: '/terminal', titleKey: 'nav.terminal', view: TerminalPage },
  { path: '/studio', titleKey: 'nav.studio', view: StudioPage },
  { path: '/network', titleKey: 'nav.network', view: NetworkPage },
  { path: '/targets', titleKey: 'nav.targets', view: TargetsPage },
  { path: '/storage', titleKey: 'nav.storage', view: StoragePage },
  { path: '/monitoring', titleKey: 'nav.monitoring', view: MonitoringPage },
  { path: '/compliance', titleKey: 'nav.compliance', view: CompliancePage },

  { path: '/approvals', titleKey: 'nav.approvals', roles: ['admin', 'instructor'], view: ApprovalsPage },
  { path: '/admin/policies', titleKey: 'nav.policies', roles: ['admin'], view: PoliciesPage },
  { path: '/admin/users', titleKey: 'nav.users', roles: ['admin', 'instructor'], view: UsersPage },
  { path: '/admin/cohorts', titleKey: 'nav.cohorts', roles: ['admin', 'instructor'], view: CohortsPage },
  { path: '/admin/audit', titleKey: 'nav.audit', roles: ['admin', 'instructor'], view: AuditLogPage }
];
