import { h, icon } from '../../../lib/dom.js';

export function createToolsCellVisual() {
  const container = h('div', {
    class: 'rounded-xl p-4 overflow-hidden space-y-3',
    style: 'background-color: var(--surface-2); border: 1px solid var(--border-default);'
  });

  const tools = [
    { name: 'Nmap', desc: 'Port scanner & host discovery', icon: 'radar' },
    { name: 'Metasploit', desc: 'Exploitation framework', icon: 'shield-alert' },
    { name: 'Burp Suite', desc: 'Web vulnerability proxy', icon: 'bug' },
    { name: 'Wireshark', desc: 'Packet analyzer', icon: 'activity' },
    { name: 'SQLmap', desc: 'Automated SQL injection', icon: 'database' },
    { name: 'Hydra', desc: 'Parallel network logon cracker', icon: 'key' },
    { name: 'John the Ripper', desc: 'Password hash cracking', icon: 'unlock' },
    { name: 'Gobuster', desc: 'URI & DNS bruteforcer', icon: 'folder-search' }
  ];

  // Repeat twice for infinite scroll
  const marqueeItems = [...tools, ...tools];

  const maskWrapper = h('div', { class: 'mask-fade-x overflow-hidden py-1' });

  const track = h('div', {
    class: 'marquee-track flex items-center gap-3 pl-7',
    'data-decor-anim': 'marquee'
  });

  marqueeItems.forEach(t => {
    track.appendChild(h('div', {
      class: 'flex items-center gap-2.5 rounded-lg px-3.5 py-2 shrink-0 select-none',
      style: 'background-color: var(--surface-1); border: 1px solid var(--border-default);'
    },
      icon('terminal', 'w-3.5 h-3.5 text-accent-text shrink-0'),
      h('div', {},
        h('span', { class: 'text-xs font-semibold block font-mono', style: 'color: var(--text-primary);' }, t.name),
        h('span', { class: 'text-[11px] block', style: 'color: var(--text-secondary);' }, t.desc)
      )
    ));
  });

  maskWrapper.appendChild(track);
  container.appendChild(maskWrapper);

  const caption = h('div', {
    class: 'flex items-center justify-between text-xs pt-2 font-mono border-t',
    style: 'color: var(--text-muted); border-color: var(--border-subtle);'
  },
    h('span', {}, 'Pre-compiled on Kali 2024.3 & Parrot 6.1'),
    h('span', { class: 'text-xs font-semibold tracking-[0.06em]', style: 'color: var(--accent-text);' }, 'Hover to pause')
  );
  container.appendChild(caption);

  return container;
}
