import { h, icon, cx } from '../../lib/dom.js';
import { t, toggleLang } from '../../lib/i18n.js';
import { useAuth } from '../../lib/auth.js';
import { toggleTheme } from '../../lib/theme.js';
import { navigate } from '../../lib/router.js';
import { flatNav } from '../../app/nav.js';
import { getVisibleVms } from '../../lib/vm-store.js';
import { mountOverlay } from '../ui/overlay.js';
import { closeMenus } from '../ui/dropdown.js';

let current = null;

// Ctrl/Cmd+K. Lists pages the current role can reach, live VMs from vm-store, plus quick actions.
export function openCommandPalette() {
  closeMenus();
  if (current) { current.close(); return; }
  const { role } = useAuth();

  const vmCommands = getVisibleVms().map((vm) => {
    const running = vm.status === 'running' && !vm.stale;
    const statusLabel = t(`vm.status.${vm.status}`);
    return {
      section: 'cmd.vms',
      label: `${vm.name} (${statusLabel})`,
      icon: running ? 'monitor' : 'server',
      badge: statusLabel,
      running,
      run: () => navigate(running ? `/desktop?vm=${encodeURIComponent(vm.id)}` : '/vms'),
    };
  });

  const commands = [
    ...flatNav(role).map((item) => ({ section: 'cmd.goto', label: t(item.label), icon: item.icon, run: () => navigate(item.path) })),
    ...vmCommands,
    { section: 'cmd.actions', label: t('cmd.newvm'), icon: 'circle-plus', run: () => navigate('/vms/new') },
    { section: 'cmd.actions', label: t('cmd.theme'), icon: 'sun', run: toggleTheme },
    { section: 'cmd.actions', label: t('cmd.lang'), icon: 'languages', run: toggleLang }
  ];

  let results = commands;
  let activeIndex = 0;

  const field = h('input', {
    type: 'text', role: 'combobox', autofocus: true, autocomplete: 'off', spellcheck: 'false',
    'aria-expanded': 'true', 'aria-controls': 'cmd-list', 'aria-label': t('cmd.placeholder'),
    placeholder: t('cmd.placeholder'),
    class: 'h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle focus:outline-none'
  });
  const list = h('div', { id: 'cmd-list', role: 'listbox', class: 'max-h-80 overflow-y-auto p-2' });

  const run = (cmd) => {
    overlay.close();
    setTimeout(cmd.run, 0);
  };

  function render() {
    list.replaceChildren();
    if (!results.length) {
      list.append(h('p', { class: 'px-3 py-8 text-center text-sm text-muted' }, t('cmd.none')));
      field.removeAttribute('aria-activedescendant');
      return;
    }
    let lastSection = null;
    results.forEach((cmd, i) => {
      if (cmd.section !== lastSection) {
        lastSection = cmd.section;
        list.append(h('div', { class: 'px-3 pb-1 pt-2 text-xs text-subtle' }, t(cmd.section)));
      }
      list.append(h('div', {
        id: `cmd-opt-${i}`, role: 'option', 'aria-selected': String(i === activeIndex),
        class: cx('flex h-9 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm', i === activeIndex ? 'bg-raised text-fg' : 'text-muted'),
        onMouseMove: () => { if (activeIndex !== i) { activeIndex = i; render(); } },
        onClick: () => run(cmd)
      },
        icon(cmd.icon, 'w-4 h-4 shrink-0'),
        h('span', { class: 'truncate flex-1' }, cmd.label),
        cmd.badge
          ? h('span', {
              class: cx(
                'rounded-full px-2 py-0.5 font-mono text-[10px]',
                cmd.running ? 'bg-[var(--success-bg)] text-[var(--success-text)]' : 'bg-raised text-muted'
              )
            }, cmd.badge)
          : null
      ));
    });
    field.setAttribute('aria-activedescendant', `cmd-opt-${activeIndex}`);
    list.querySelector(`#cmd-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }

  field.addEventListener('input', () => {
    const q = field.value.trim().toLowerCase();
    results = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
    activeIndex = 0;
    render();
  });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(results.length - 1, activeIndex + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); render(); }
    else if (e.key === 'Enter' && results[activeIndex]) { e.preventDefault(); run(results[activeIndex]); }
  });

  const panel = h('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': t('top.search'),
    class: 'pop-in w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface'
  },
    h('div', { class: 'flex items-center gap-3 border-b border-line px-4' }, icon('search', 'w-4 h-4 text-subtle'), field,
      h('kbd', { class: 'rounded border border-line px-1.5 font-mono text-xs text-subtle' }, 'Esc')),
    list);

  const overlay = mountOverlay({ content: panel, variant: 'top', onClose: () => { current = null; } });
  current = overlay;
  render();
}
