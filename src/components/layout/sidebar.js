import { h, icon, cx } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { useAuth } from '../../lib/auth.js';
import { visibleNav, findActive } from '../../app/nav.js';
import { initials } from '../../lib/format.js';
import { getVisibleVms, getRunningVms } from '../../lib/vm-store.js';

export function toggleSidebar() {
  const root = document.documentElement;
  const collapsed = root.dataset.sb === 'collapsed';
  if (collapsed) delete root.dataset.sb;
  else root.dataset.sb = 'collapsed';
  try {
    localStorage.setItem('ptaas.sidebar', collapsed ? 'expanded' : 'collapsed');
  } catch {}
  return !collapsed;
}

export const toggleMobileSidebar = () => {
  const root = document.documentElement;
  const isOpen = root.hasAttribute('data-sb-open');
  if (isOpen) root.removeAttribute('data-sb-open');
  else root.setAttribute('data-sb-open', '');
};

export const closeMobileSidebar = () => {
  document.documentElement.removeAttribute('data-sb-open');
};

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.documentElement.hasAttribute('data-sb-open')) {
      closeMobileSidebar();
    }
  });
}

function navLink(item, active, role) {
  const isActive = active?.path === item.path;

  // Dynamic VM badge counts ONLY running VMs; hidden when 0.
  let badgeEl = null;
  if (item.path === '/vms') {
    const runningCount = getRunningVms().length;
    if (runningCount > 0) {
      badgeEl = h('span', {
        'data-sidebar-vm-badge': 'true',
        class: 'sb-badge ml-auto rounded-full bg-[var(--accent-bg)] px-1.5 py-0.2 text-[11px] font-mono font-medium text-[var(--accent-text)]'
      }, String(runningCount));
    }
  } else if (item.path === '/approvals' && (role === 'admin' || role === 'instructor')) {
    badgeEl = h('span', {
      class: 'sb-badge ml-auto rounded-full bg-[var(--warning-bg)] px-1.5 py-0.2 text-[11px] font-mono font-medium text-[var(--warning-text)]'
    }, '1');
  } else if (item.path === '/admin/users' && (role === 'admin' || role === 'instructor')) {
    badgeEl = h('span', {
      class: 'sb-badge ml-auto rounded-full bg-[var(--warning-bg)] px-1.5 py-0.2 text-[11px] font-mono font-medium text-[var(--warning-text)]'
    }, '1');
  }

  return h('a', {
    href: item.path,
    'data-link': true,
    'aria-label': t(item.label),
    title: t(item.label),
    'aria-current': isActive ? 'page' : undefined,
    class: cx(
      'sb-link group select-none',
      isActive ? 'active' : ''
    ),
    onClick: () => {
      if (window.innerWidth < 1024) closeMobileSidebar();
    }
  },
    icon(item.icon, 'w-[18px] h-[18px] shrink-0'),
    h('span', { class: 'sb-label truncate flex-1' }, t(item.label)),
    badgeEl
  );
}

function quotaMiniMeter(user) {
  if (!user || user.role !== 'student') return null;

  const quota = user.quota || { vcpu: 8, ram: 16 };
  const ownedVms = getVisibleVms().filter((v) => v.owner === user.id);
  const runningVms = ownedVms.filter((v) => v.status === 'running' && !v.stale);
  const usedVcpu = runningVms.reduce((s, v) => s + (v.vcpu || 0), 0);
  const usedRam = runningVms.reduce((s, v) => s + (v.ram || 0), 0);
  const vmLimit = user.maxSelfServiceVms || 3;
  const usedVms = ownedVms.length;
  const vcpuPct = Math.min(100, Math.round((usedVcpu / Math.max(1, quota.vcpu)) * 100));
  const ramPct = Math.min(100, Math.round((usedRam / Math.max(1, quota.ram)) * 100));

  return h('div', { class: 'sb-quota rounded-lg border border-line bg-surface/60 p-2.5 space-y-2 mb-2 text-xs', 'data-sidebar-quota': 'true' },
    h('div', { class: 'flex items-center justify-between text-[11px] text-muted' },
      h('span', {}, 'Student Quota'),
      h('span', { class: 'font-mono text-accent' }, `${usedVms}/${vmLimit} VMs`)
    ),
    h('div', { class: 'space-y-1.5' },
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'flex justify-between text-[10px] text-subtle font-mono' },
          h('span', {}, 'VM Slots'),
          h('span', {}, `${usedVms} of ${vmLimit} used`)
        ),
        h('div', { class: 'flex gap-1 pt-0.5' },
          Array.from({ length: vmLimit }).map((_, idx) =>
            h('div', {
              class: cx(
                'h-1.5 flex-1 rounded-full transition-all',
                idx < usedVms ? 'bg-accent' : 'bg-raised border border-line'
              )
            })
          )
        )
      ),
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'flex justify-between text-[10px] text-subtle font-mono' },
          h('span', {}, 'vCPU'),
          h('span', { 'data-sidebar-vcpu': 'true' }, `${usedVcpu}/${quota.vcpu}`)
        ),
        h('div', { class: 'h-1 w-full rounded-full bg-raised overflow-hidden' },
          h('div', { class: 'h-full bg-accent rounded-full transition-[width] duration-200', style: `width: ${vcpuPct}%` })
        )
      ),
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'flex justify-between text-[10px] text-subtle font-mono' },
          h('span', {}, 'RAM'),
          h('span', { 'data-sidebar-ram': 'true' }, `${usedRam}/${quota.ram} GB`)
        ),
        h('div', { class: 'h-1 w-full rounded-full bg-raised overflow-hidden' },
          h('div', { class: 'h-full bg-accent rounded-full transition-[width] duration-200', style: `width: ${ramPct}%` })
        )
      )
    )
  );
}

export function Sidebar({ path }) {
  const { role, user } = useAuth();
  const groups = visibleNav(role);
  const active = findActive(role, path);

  const brand = h('div', {
    class: 'flex h-14 shrink-0 items-center justify-between border-b border-line px-4'
  },
    h('a', {
      href: '/dashboard',
      'data-link': true,
      'aria-label': 'PTaaS Cloud',
      class: 'flex items-center gap-2.5 font-semibold text-fg tracking-tight select-none focus-visible:outline-none'
    },
      h('span', {
        class: 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fg text-canvas font-mono text-xs font-bold'
      }, 'PT'),
      h('span', { class: 'sb-label text-sm font-semibold tracking-tight whitespace-nowrap' }, 'PTaaS Cloud')
    ),
    h('span', { class: 'sb-label rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted uppercase' }, role)
  );

  const nav = h('nav', {
    class: 'flex-1 overflow-y-auto px-3 py-3',
    'aria-label': t('nav.label')
  },
    groups.map((g) => h('div', { class: 'sb-group mt-6 first:mt-2' },
      g.group && h('div', { class: 'sb-group-label mb-2' }, t(g.group)),
      h('div', { class: 'space-y-1' }, g.items.map((item) => navLink(item, active, role)))
    ))
  );

  const userCard = h('div', {
    class: 'flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-raised/60 transition-colors select-none'
  },
    h('span', {
      class: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface border border-line font-mono text-xs font-semibold text-fg'
    }, initials(user?.name || '')),
    h('div', { class: 'sb-user-text min-w-0 flex-1' },
      h('p', { class: 'truncate text-xs font-medium text-fg' }, user?.name || ''),
      h('p', { class: 'truncate text-[11px] text-muted capitalize' }, user?.role || '')
    )
  );

  const toggle = h('button', {
    type: 'button',
    'aria-label': t('nav.collapse'),
    'aria-expanded': String(document.documentElement.dataset.sb !== 'collapsed'),
    title: t('nav.collapse'),
    class: 'sb-toggle flex h-8 w-full items-center justify-center lg:justify-start gap-2.5 rounded-lg px-2 text-xs font-medium text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer select-none',
    onClick: (e) => {
      const expanded = !toggleSidebar();
      e.currentTarget.setAttribute('aria-expanded', String(expanded));
    }
  },
    icon('chevrons-left', 'w-4 h-4 shrink-0 transition-transform'),
    h('span', { class: 'sb-label' }, t('nav.collapse'))
  );

  const footer = h('div', {
    class: 'border-t border-line p-3 space-y-2 shrink-0 bg-canvas'
  },
    quotaMiniMeter(user),
    userCard,
    toggle
  );

  return h('aside', { class: 'sidebar' },
    brand,
    nav,
    footer
  );
}
