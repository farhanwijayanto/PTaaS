import { h } from '../../lib/dom.js';
import { onCleanup } from '../../lib/router.js';
import { bentoCell } from './bento-cell.js';
import { createBootCellVisual } from './cells/boot-cell.js';
import { createQuotaCellVisual } from './cells/quota-cell.js';
import { createAuditCellVisual } from './cells/audit-cell.js';
import { createToolsCellVisual } from './cells/tools-cell.js';
import { createAccessCellVisual } from './cells/access-cell.js';
import { useInView } from './decor/hooks.js';

export function createBentoGridSection() {
  const section = h('section', {
    id: 'features',
    class: 'landing-container py-20 md:py-24 space-y-12 relative',
    'data-in-view': 'false'
  });

  const cleanupView = useInView(section);
  onCleanup(cleanupView);

  // Section Header with Eyebrow + blinking square cursor while in view
  const header = h('div', { class: 'space-y-3 max-w-2xl' },
    h('span', { class: 'text-xs font-mono tracking-[0.06em] uppercase font-semibold block', style: 'color: var(--accent-text);' },
      '01 / LAB CAPABILITIES',
      h('span', { class: 'eyebrow-cursor', 'aria-hidden': 'true', 'data-decor': 'eyebrow-cursor', 'data-decor-anim': 'eyebrow-blink' })
    ),
    h('h2', { class: 'text-2xl sm:text-3xl font-semibold tracking-tight', style: 'color: var(--text-primary);' }, 'Everything in One Lab'),
    h('p', { class: 'text-xs sm:text-sm leading-relaxed', style: 'color: var(--text-secondary);' },
      'A complete virtual cybersecurity testbed engineered for hands-on penetration testing. Zero hardware bottlenecks, zero client installation.'
    )
  );

  // Asymmetric Bento Grid (3 columns on desktop, 1 on mobile)
  const grid = h('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-5' },
    bentoCell({
      size: '2x1',
      eyebrow: 'Fast Provisioning',
      title: 'Instant KVM Boot in Under 20s',
      description: 'Pre-warmed QEMU/KVM base images boot directly into memory with cloud-init configuration.',
      visual: createBootCellVisual()
    }),
    bentoCell({
      size: '1x1',
      eyebrow: 'Resource Pooling',
      title: 'Fair-Share Resource Limits',
      description: 'Enforced hardware quotas prevent compute starvation across student cohorts.',
      visual: createQuotaCellVisual()
    }),
    bentoCell({
      size: '1x1',
      eyebrow: 'Broad Network Access',
      title: 'Dual GUI & Terminal',
      description: 'Switch seamlessly between high-res XFCE desktop VNC and low-latency SSH web shell.',
      visual: createAccessCellVisual()
    }),
    bentoCell({
      size: '2x1',
      eyebrow: 'Pre-Installed Toolkits',
      title: 'Ready-to-Use Pentest Armory',
      description: 'Hardened Kali and Parrot images packed with industry-standard scanning and exploitation suites.',
      visual: createToolsCellVisual()
    }),
    bentoCell({
      size: '3x1',
      eyebrow: 'Compliance & Safety',
      title: 'Immutable Audit Stream & Egress Filtering',
      description: 'Every port scan, terminal command, and blocked outbound packet is cryptographically recorded in real time.',
      visual: createAuditCellVisual()
    })
  );

  section.appendChild(header);
  section.appendChild(grid);

  return section;
}
