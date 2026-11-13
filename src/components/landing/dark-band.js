import { h, icon } from '../../lib/dom.js';
import { onCleanup } from '../../lib/router.js';
import { isReducedOrLow } from './decor/config.js';
import { useInView } from './decor/hooks.js';
import { isDesktopMotionEnabled, isReducedMotion, loadMotionCore, EASINGS } from '../../lib/motion.js';

export function createDarkContrastBand() {
  const section = h('section', {
    id: 'security',
    class: 'relative w-full overflow-hidden border-y',
    'data-surface': 'dark',
    'data-in-view': 'false',
    style: 'background-color: var(--ink-850); color: var(--text-primary); border-color: var(--border-subtle);'
  });

  // 1. Subtle dot grid
  const dotGrid = h('div', {
    class: 'absolute inset-0 dot-grid opacity-90 pointer-events-none select-none',
    'aria-hidden': 'true',
    'data-decor': 'security-dot-grid',
    style: 'z-index: 0; pointer-events: none;'
  });

  // 2. One slow ambient glow behind the hypervisor card
  const ambientGlow = h('div', {
    class: 'absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[320px] blur-[110px] rounded-full pointer-events-none',
    'aria-hidden': 'true',
    'data-decor': 'security-glow',
    style: 'z-index: 0; pointer-events: none; background-color: rgb(var(--decor-accent) / 0.05);'
  });

  // 3. Hypervisor Card Spec Rows
  const specRowsData = [
    { label: 'Isolation Mechanism:', value: 'Intel VT-x / AMD-V + cgroups v2', isDrop: false },
    { label: 'Network Segmentation:', value: 'Open vSwitch VXLAN (VNI Encapsulation)', isDrop: false },
    { label: 'Public Egress Policy:', value: '100% DROP (Zero Internet Leak)', isDrop: true }
  ];

  const specValueSpans = [];
  let dropRowEl = null;

  const specBox = h('div', {
    class: 'rounded-lg p-4 font-mono text-xs space-y-2 relative z-10',
    style: 'background-color: var(--ink-700); border: 1px solid var(--ink-600);'
  },
    specRowsData.map((row) => {
      const valSpan = h('span', {
        class: row.isDrop ? 'font-semibold' : '',
        style: row.isDrop ? 'color: var(--accent-text);' : 'color: var(--text-primary);'
      }, isReducedOrLow() ? row.value : '');
      specValueSpans.push({ span: valSpan, fullText: row.value, isDrop: row.isDrop });

      const rowDiv = h('div', {
        class: `flex items-center justify-between px-1.5 py-0.5 rounded ${row.isDrop ? 'drop-highlight-sweep' : ''}`,
        style: 'color: var(--text-secondary);'
      },
        h('span', {}, row.label),
        valSpan
      );
      if (row.isDrop) dropRowEl = rowDiv;
      return rowDiv;
    })
  );

  // Left Hypervisor Hero Card (7 cols)
  const hypervisorCard = h('div', { class: 'lg:col-span-7 relative' },
    h('div', {
      id: 'sec-hypervisor-beam',
      class: 'border-beam-card p-[1px] shadow-2xl relative z-10 h-full',
      style: 'border: 1px solid var(--ink-600);'
    },
      h('div', { class: 'border-beam-inner p-6 sm:p-8 h-full flex flex-col justify-between space-y-6' },
        h('div', { class: 'space-y-4' },
          h('div', { class: 'flex items-center justify-between' },
            h('div', { class: 'flex items-center gap-2' },
              icon('shield-check', 'w-5 h-5 text-accent-text'),
              h('span', { class: 'text-xs font-mono font-semibold uppercase tracking-wider', style: 'color: var(--accent-text);' }, 'Hypervisor Boundary')
            ),
            h('span', {
              class: 'rounded-full px-2.5 py-0.5 text-[11px] font-mono',
              style: 'background-color: var(--accent-bg); border: 1px solid var(--accent-border); color: var(--accent-text);'
            }, 'KVM / QEMU Hardened')
          ),
          h('h3', { class: 'text-xl font-semibold tracking-tight', style: 'color: var(--text-primary);' }, 'Hardware-Assisted VM Sandboxing'),
          h('p', { class: 'text-xs leading-relaxed', style: 'color: var(--text-secondary);' },
            'Every student machine runs in its own hardware-isolated KVM domain. Dedicated CPU registers and virtual MMUs strictly prevent privilege escalation, cross-VM memory sniffing, and host escape vectors.'
          )
        ),
        specBox
      )
    )
  );

  // Right-side Supportive Security Pillars (5 cols)
  const pillarCards = [
    securityItem(
      'key',
      'sec-icon-key',
      'Keycloak Enterprise SSO & MFA',
      'Institutional sign-in with mandatory TOTP authenticator enrollment. Zero public registration.',
      'MFA // TOTP'
    ),
    securityItem(
      'shield-alert',
      'sec-icon-shield',
      'OWASP CRS Web Application Firewall',
      'All web terminal and desktop VNC traffic is inspected in real time for protocol anomalies.',
      'WAF // CRS 4.0'
    ),
    securityItem(
      'scroll-text',
      'sec-icon-log',
      'Tamper-Proof Audit Logging',
      'Cryptographically hashed audit trails track VM creation, network connections, and administrator approvals.',
      'SHA-256 // LOG'
    )
  ];

  const content = h('div', { class: 'relative z-10 landing-container py-20 md:py-24 space-y-12' },
    h('div', { class: 'text-center space-y-3 max-w-2xl mx-auto' },
      h('span', { class: 'text-xs font-mono tracking-[0.06em] uppercase font-semibold block', style: 'color: var(--accent-text);' },
        '06 / ZERO-TRUST ARCHITECTURE',
        h('span', { class: 'eyebrow-cursor', 'aria-hidden': 'true', 'data-decor': 'eyebrow-cursor', 'data-decor-anim': 'eyebrow-blink' })
      ),
      h('h2', { class: 'text-2xl sm:text-3xl font-semibold tracking-tight', style: 'color: var(--text-primary);' }, 'Hardened Security by Design'),
      h('p', { class: 'text-xs sm:text-sm leading-relaxed', style: 'color: var(--text-secondary);' },
        'Built specifically for universities and cybersecurity training centers where untrusted attack code must execute safely without compromising host infrastructure.'
      )
    ),

    h('div', { class: 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch' },
      hypervisorCard,
      h('div', { class: 'lg:col-span-5 flex flex-col justify-between space-y-4' },
        pillarCards
      )
    )
  );

  section.append(dotGrid, ambientGlow, content);

  let hasRevealedOnce = false;
  const timers = [];

  function triggerFirstReveal() {
    if (hasRevealedOnce) return;
    hasRevealedOnce = true;

    const beamCard = section.querySelector('#sec-hypervisor-beam');
    if (beamCard) beamCard.classList.add('is-revealed');

    pillarCards.forEach((card, idx) => {
      const t1 = setTimeout(() => {
        card.classList.add('is-revealed');
        const t2 = setTimeout(() => card.classList.remove('is-revealed'), 900);
        timers.push(t2);
      }, isReducedOrLow() ? 0 : 250 + idx * 180);
      timers.push(t1);
    });

    if (isReducedOrLow()) {
      specValueSpans.forEach((item) => {
        item.span.textContent = item.fullText;
      });
      return;
    }

    let delayAcc = 150;
    specValueSpans.forEach((item) => {
      const text = item.fullText;
      const startDelay = delayAcc;
      delayAcc += text.length * 14 + 140;

      const tRow = setTimeout(() => {
        let i = 0;
        const step = () => {
          if (i <= text.length) {
            item.span.textContent = text.slice(0, i);
            i += 2;
            timers.push(setTimeout(step, 22));
          } else {
            item.span.textContent = text;
            if (item.isDrop && dropRowEl) {
              dropRowEl.classList.add('is-swept');
            }
          }
        };
        step();
      }, startDelay);
      timers.push(tRow);
    });
  }

  const cleanupView = useInView(section, (visible) => {
    if (!visible) return;
    triggerFirstReveal();
    if (!isReducedMotion()) {
      loadMotionCore().then(({ animate, stagger }) => {
        animate(pillarCards, { opacity: [0.001, 1], y: [14, 0] }, {
          duration: 0.45,
          delay: stagger(0.08),
          ease: EASINGS.expoOut
        });
      }).catch(() => {});
    }
  }, { once: true });

  onCleanup(() => {
    cleanupView();
    timers.forEach(clearTimeout);
  });

  return section;
}

function securityItem(iconName, iconAnimClass, title, desc, codeTag) {
  const spotlight = h('div', {
    class: 'sec-pillar-spotlight',
    'aria-hidden': 'true',
    'data-decor': 'pillar-spotlight'
  });

  const card = h('div', {
    class: 'sec-pillar-card rounded-xl p-4 text-xs space-y-2',
    style: 'background-color: var(--ink-800); border: 1px solid var(--ink-600);'
  },
    spotlight,
    h('div', { class: 'relative z-10 flex items-center justify-between gap-2' },
      h('div', { class: 'flex items-center gap-2.5 font-semibold', style: 'color: var(--text-primary);' },
        h('span', {
          class: `sec-icon-wrap ${iconAnimClass} inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0`,
          style: 'background-color: var(--accent-bg); border: 1px solid var(--accent-border); color: var(--accent-text);'
        },
          icon(iconName, 'w-3.5 h-3.5 shrink-0')
        ),
        h('span', {}, title)
      ),
      h('span', {
        class: 'font-mono text-[11px] tracking-wider uppercase select-none pointer-events-none',
        style: 'color: var(--text-muted);',
        'aria-hidden': 'true'
      }, codeTag)
    ),
    h('p', { class: 'relative z-10 text-xs leading-relaxed', style: 'color: var(--text-secondary);' }, desc)
  );

  if (isDesktopMotionEnabled()) {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    }, { passive: true });
  }

  return card;
}
