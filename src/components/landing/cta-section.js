import { h, icon } from '../../lib/dom.js';
import { onCleanup } from '../../lib/router.js';
import { button } from '../ui/button.js';
import { useInView } from './decor/hooks.js';

export function createCtaSection() {
  const section = h('section', {
    id: 'compliance',
    class: 'relative overflow-hidden border-t border-line bg-canvas text-center',
    'data-in-view': 'false'
  });
  onCleanup(useInView(section));

  // Faint dot grid fading out at the edges (pointer-events-none)
  const gridOverlay = h('div', {
    class: 'absolute inset-0 dot-grid opacity-80 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_72%)] pointer-events-none',
    'aria-hidden': 'true',
    'data-decor': 'cta-dot-grid',
    style: 'pointer-events: none;'
  });

  const content = h('div', { class: 'relative z-10 landing-container py-24 space-y-6 max-w-3xl' },
    h('span', { class: 'text-[12px] font-mono tracking-[0.06em] uppercase text-[var(--accent-text)] font-semibold block' },
      '07 / GET STARTED',
      h('span', { class: 'eyebrow-cursor', 'aria-hidden': 'true', 'data-decor': 'eyebrow-cursor', 'data-decor-anim': 'eyebrow-blink' })
    ),
    h('h2', { class: 'text-3xl sm:text-4xl font-semibold tracking-tight text-fg' },
      'Pentest labs in your browser. Ready in seconds.'
    ),
    h('p', { class: 'text-sm text-muted max-w-xl mx-auto leading-relaxed' },
      'Access is invitation-only. Accounts are provisioned directly by course instructors or institutional lab administrators.'
    ),
    h('div', { class: 'pt-2 flex flex-wrap items-center justify-center gap-3' },
      button({
        label: 'Sign in to Platform Console',
        variant: 'primary',
        size: 'lg',
        href: '/login',
        icon: 'arrow-right'
      }),
      button({
        label: 'Review Architecture Compliance',
        variant: 'outline',
        size: 'lg',
        href: '/compliance'
      })
    ),
    h('div', { class: 'pt-4 flex items-center justify-center gap-2 text-xs text-subtle font-mono' },
      icon('shield-check', 'w-4 h-4 text-[var(--accent-text)]'),
      h('span', {}, 'Institutional Single Sign-On with Keycloak MFA')
    )
  );

  section.appendChild(gridOverlay);
  section.appendChild(content);

  return section;
}
