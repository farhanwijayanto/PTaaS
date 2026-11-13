import { h, icon, cx } from '../../lib/dom.js';
import { t, getLang, toggleLang } from '../../lib/i18n.js';
import { useAuth, viewAs, setTenant, signOut } from '../../lib/auth.js';
import { toggleTheme } from '../../lib/theme.js';
import { createThemeToggle } from './header/theme-toggle.js';
import { initials } from '../../lib/format.js';
import { findActive } from '../../app/nav.js';
import { button } from '../ui/button.js';
import { dropdown } from '../ui/dropdown.js';
import { toggleMobileSidebar } from './sidebar.js';
import { openCommandPalette } from './command-palette.js';

function breadcrumb({ path, route, role }) {
  const active = findActive(role, path);
  const crumbs = [];
  if (active?.group) crumbs.push({ label: t(active.group) });
  if (active) crumbs.push({ label: t(active.label) });
  else if (route?.titleKey) crumbs.push({ label: t(route.titleKey) });
  if (route?.crumbs) crumbs.splice(0, crumbs.length, ...route.crumbs());

  return h('nav', { 'aria-label': 'Breadcrumb', class: 'min-w-0' },
    h('ol', { class: 'flex items-center gap-2 text-[13px] select-none' },
      crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return h('li', { class: 'flex min-w-0 items-center gap-2' },
          i > 0 && icon('chevron-right', 'w-3.5 h-3.5 text-subtle shrink-0'),
          c.href
            ? h('a', {
                href: c.href,
                'data-link': true,
                class: 'truncate text-muted hover:text-fg transition-colors'
              }, c.label)
            : h('span', {
                class: last ? 'truncate font-medium text-fg' : 'truncate text-muted',
                'aria-current': last ? 'page' : undefined
              }, c.label)
        );
      })
    )
  );
}

function tenantSwitcher(auth) {
  const options = auth.tenants || [];
  if (options.length <= 1) return null;

  const current = options.find((o) => o.value === auth.tenant) ?? options[0];

  const trigger = h('button', {
    type: 'button',
    'aria-label': t('top.tenant'),
    title: t('top.tenant'),
    class: 'hidden lg:flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-fg hover:bg-raised transition-colors cursor-pointer select-none'
  },
    icon('building-2', 'w-4 h-4 text-muted'),
    h('span', { class: 'truncate max-w-[130px]' }, current.label),
    icon('chevrons-up-down', 'w-3.5 h-3.5 text-subtle')
  );

  return dropdown({
    trigger,
    items: () => [
      { type: 'label', label: t('top.tenant') },
      ...options.map((o) => ({
        label: o.label,
        checked: o.value === auth.tenant,
        onSelect: () => setTenant(o.value)
      }))
    ]
  });
}

function accountMenu(auth) {
  const { user } = auth;
  const trigger = h('button', {
    type: 'button',
    'aria-label': `${user.name} account menu`,
    class: 'flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-fg hover:bg-raised transition-colors cursor-pointer select-none'
  },
    h('span', {
      class: 'flex h-6 w-6 items-center justify-center rounded-full bg-raised font-mono text-[11px] font-semibold text-fg'
    }, initials(user.name)),
    h('span', { class: 'hidden md:inline font-medium text-xs max-w-[100px] truncate' }, user.name.split(' ')[0]),
    icon('chevron-down', 'w-3.5 h-3.5 text-muted')
  );

  return dropdown({
    trigger,
    items: () => [
      {
        type: 'label',
        label: `${user.name} (${t(`role.${user.role}`)})`
      },
      { type: 'label', label: user.email },
      { type: 'separator' },
      {
        label: 'Security & 2FA',
        icon: 'shield',
        onSelect: () => window.location.href = '/compliance'
      },
      { type: 'separator' },
      { type: 'label', label: `${t('top.viewAs')} (Dev)` },
      ...['admin', 'instructor', 'student'].map((role) => ({
        label: t(`role.${role}`),
        checked: role === user.role,
        onSelect: () => viewAs(role)
      })),
      { type: 'separator' },
      { label: t('top.signout'), icon: 'log-out', onSelect: signOut }
    ]
  });
}

export function Topbar({ path, route }) {
  const auth = useAuth();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

  // 280px fixed width search trigger (min 200px, collapses to icon below 1100px)
  const search = h('button', {
    type: 'button',
    'aria-label': t('top.search'),
    title: `${t('top.search')} (${isMac ? '⌘K' : 'Ctrl+K'})`,
    onClick: openCommandPalette,
    class: 'hidden min-[1100px]:flex h-9 w-[280px] shrink-0 items-center justify-between rounded-lg border border-line bg-surface px-3 text-xs text-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg whitespace-nowrap cursor-pointer'
  },
    h('div', { class: 'flex items-center gap-2 min-w-0 overflow-hidden' },
      icon('search', 'w-4 h-4 shrink-0 text-muted'),
      h('span', { class: 'truncate' }, t('top.search') || 'Search or jump to...')
    ),
    h('kbd', {
      class: 'shrink-0 rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted'
    }, isMac ? '⌘K' : 'Ctrl K')
  );

  // Compact search icon button for screens below 1100px
  const searchCompact = button({
    icon: 'search',
    variant: 'ghost',
    size: 'sm',
    ariaLabel: t('top.search'),
    title: 'Search (Ctrl+K)',
    class: 'min-[1100px]:hidden h-9 w-9 p-0',
    onClick: openCommandPalette
  });

  // Notification Bell with unread indicator dot
  const notificationsBtn = h('button', {
    type: 'button',
    'aria-label': 'Notifications (1 unread)',
    title: 'System Notifications (1 unread)',
    class: 'relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer'
  },
    icon('bell', 'w-4 h-4'),
    h('span', { class: 'absolute top-2 right-2 h-2 w-2 rounded-full bg-accent ring-2 ring-canvas' })
  );

  // Topbar inner wrapper sharing exact same padding as page-container
  const inner = h('div', {
    class: 'page-container flex h-full items-center justify-between gap-4'
  },
    // Left: mobile toggle + breadcrumb
    h('div', { class: 'flex items-center gap-3 min-w-0' },
      button({
        icon: 'menu',
        variant: 'ghost',
        size: 'sm',
        ariaLabel: t('top.menu'),
        onClick: toggleMobileSidebar,
        class: 'lg:hidden h-9 w-9 p-0'
      }),
      breadcrumb({ path, route, role: auth.role })
    ),

    // Right: search, switcher, bell, lang, theme, user menu
    h('div', { class: 'flex items-center gap-2 shrink-0' },
      search,
      searchCompact,
      tenantSwitcher(auth),
      notificationsBtn,
      button({
        label: getLang().toUpperCase(),
        icon: 'languages',
        variant: 'ghost',
        size: 'sm',
        ariaLabel: t('top.lang'),
        class: 'h-9 px-2 text-xs font-mono font-medium',
        onClick: toggleLang
      }),
      createThemeToggle(),
      accountMenu(auth)
    )
  );

  return h('header', { class: 'app-topbar' }, inner);
}
