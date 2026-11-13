import { h, icon } from '../../../lib/dom.js';
import { onCleanup } from '../../../lib/router.js';
import { useInView } from '../decor/hooks.js';

export function createIsolationVisual() {
  const container = h('div', {
    class: 'rounded-2xl p-6 sm:p-8 space-y-6 overflow-hidden relative',
    style: 'background-color: var(--surface-1); border: 1px solid var(--border-default);',
    'data-in-view': 'false'
  });
  onCleanup(useInView(container));

  const header = h('div', { class: 'flex flex-wrap items-center justify-between gap-4' },
    h('div', { class: 'space-y-1' },
      h('span', { class: 'text-xs font-mono tracking-[0.06em] uppercase font-semibold block', style: 'color: var(--accent-text);' },
        '03 / NETWORK ISOLATION',
        h('span', { class: 'eyebrow-cursor', 'aria-hidden': 'true', 'data-decor': 'eyebrow-cursor', 'data-decor-anim': 'eyebrow-blink' })
      ),
      h('h3', { class: 'text-xl font-semibold tracking-tight', style: 'color: var(--text-primary);' }, 'Zero Cross-Tenant Leakage & Strict ACL'),
      h('p', { class: 'text-xs max-w-xl', style: 'color: var(--text-secondary);' },
        'Open vSwitch VXLAN isolation guarantees that student VMs cannot communicate across tenants. All public internet egress is strictly blocked at the hypervisor boundary.'
      )
    ),
    h('div', { class: 'flex items-center gap-3 flex-wrap' },
      h('div', {
        class: 'rounded-lg px-3 py-1.5 font-mono text-xs',
        style: 'background-color: var(--surface-2); border: 1px solid var(--border-default); color: var(--text-secondary);'
      },
        'Cross-Tenant: ', h('span', { class: 'font-bold', style: 'color: var(--accent-text);' }, '0'),
        ' / Egress Blocked: ', h('span', { class: 'font-bold', style: 'color: var(--accent-text);' }, '100%')
      ),
      h('button', {
        type: 'button',
        'aria-label': 'Transmit probe test packets across network',
        class: 'touch-target min-h-[44px] rounded-lg px-3.5 py-2 text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer',
        style: 'background-color: var(--surface-2); border: 1px solid var(--border-default); color: var(--text-primary);',
        onClick: sendProbePackets
      }, icon('play', 'w-3.5 h-3.5 text-accent-text'), 'Send Test Packets')
    )
  );

  // Dark SVG canvas scope (always dark regardless of page theme)
  const svgWrapper = h('div', {
    class: 'rounded-xl p-4 relative overflow-hidden',
    'data-surface': 'dark',
    'data-diagram': 'isolation',
    style: 'background-color: var(--ink-950); border: 1px solid var(--ink-600);'
  });

  const statusToast = h('div', {
    class: 'inline-flex mb-3 rounded-md px-3 py-1.5 text-xs font-mono items-center gap-2',
    style: 'background-color: var(--ink-700); border: 1px solid var(--ink-500); color: var(--text-primary);'
  },
    h('span', { class: 'h-2 w-2 rounded-full shrink-0', style: 'background-color: var(--accent);' }),
    h('span', { id: 'iso-status-text' }, 'SDN VXLAN VNI 4096 Active · Ready')
  );

  svgWrapper.appendChild(statusToast);

  // SVG Diagram (viewBox 900x360, clean spacing so ACL badge never collides with any node)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 900 355');
  svg.setAttribute('class', 'w-full h-auto select-none');

  svg.innerHTML = `
    <!-- Cohort CS-401 Box (Your VPC - Success tint) -->
    <rect x="24" y="24" width="246" height="270" rx="14" fill="var(--ink-800)" stroke="var(--success-border)" stroke-width="1.5"/>
    <rect x="24" y="24" width="246" height="270" rx="14" fill="var(--success-bg)" pointer-events="none"/>
    <text x="44" y="54" fill="var(--text-primary)" font-size="13" font-family="Geist, sans-serif" font-weight="600">Cohort CS-401 (Your VPC)</text>
    <text x="44" y="74" fill="var(--text-secondary)" font-size="11" font-family="monospace">10.10.1.0/24 · VNI 4096</text>

    <!-- Cohort CS-401 VMs -->
    <g transform="translate(44, 94)">
      <rect width="206" height="44" rx="8" fill="var(--ink-700)" stroke="var(--ink-600)"/>
      <circle cx="20" cy="22" r="5" fill="var(--accent)"/>
      <text x="34" y="26" fill="var(--text-primary)" font-size="11" font-family="monospace">kali-lab-01</text>
      <text x="162" y="26" fill="var(--text-secondary)" font-size="10" font-family="monospace">.1.5</text>
    </g>
    <g transform="translate(44, 150)">
      <rect width="206" height="44" rx="8" fill="var(--ink-700)" stroke="var(--ink-600)"/>
      <circle cx="20" cy="22" r="5" fill="var(--accent)"/>
      <text x="34" y="26" fill="var(--text-primary)" font-size="11" font-family="monospace">parrot-sec-01</text>
      <text x="162" y="26" fill="var(--text-secondary)" font-size="10" font-family="monospace">.1.8</text>
    </g>
    <g transform="translate(44, 206)">
      <rect width="206" height="44" rx="8" fill="var(--ink-700)" stroke="var(--ink-600)"/>
      <circle cx="20" cy="22" r="5" fill="var(--ink-400)"/>
      <text x="34" y="26" fill="var(--text-primary)" font-size="11" font-family="monospace">ubuntu-dev-01</text>
      <text x="156" y="26" fill="var(--text-secondary)" font-size="10" font-family="monospace">.1.10</text>
    </g>

    <!-- Center Lab Target Network (Info tint) -->
    <g transform="translate(330, 38)">
      <rect width="240" height="224" rx="14" fill="var(--ink-800)" stroke="var(--info-border)" stroke-width="1.5"/>
      <rect width="240" height="224" rx="14" fill="var(--info-bg)" pointer-events="none"/>
      <text x="20" y="30" fill="var(--text-primary)" font-size="13" font-family="Geist, sans-serif" font-weight="600">Practice Lab Targets</text>
      <text x="20" y="48" fill="var(--text-secondary)" font-size="11" font-family="monospace">10.10.2.0/24 (Permitted)</text>

      <g transform="translate(20, 66)">
        <rect width="200" height="40" rx="6" fill="var(--ink-700)" stroke="var(--ink-600)"/>
        <text x="14" y="24" fill="var(--info-text)" font-size="11" font-family="monospace">dvwa-lab (10.10.2.10)</text>
      </g>
      <g transform="translate(20, 114)">
        <rect width="200" height="40" rx="6" fill="var(--ink-700)" stroke="var(--ink-600)"/>
        <text x="14" y="24" fill="var(--text-primary)" font-size="11" font-family="monospace">metasploitable-01 (.20)</text>
      </g>
      <g transform="translate(20, 162)">
        <rect width="200" height="40" rx="6" fill="var(--ink-700)" stroke="var(--ink-600)"/>
        <text x="14" y="24" fill="var(--warning-text)" font-size="11" font-family="monospace">juice-shop-01 (.30)</text>
      </g>
    </g>

    <!-- Cohort SEC-301 Box (Neighbor, Isolated) -->
    <rect x="630" y="24" width="246" height="270" rx="14" fill="var(--ink-800)" stroke="var(--border-strong)" stroke-width="1.5"/>
    <text x="650" y="54" fill="var(--text-primary)" font-size="13" font-family="Geist, sans-serif" font-weight="600">Cohort SEC-301 (Isolated)</text>
    <text x="650" y="74" fill="var(--text-secondary)" font-size="11" font-family="monospace">10.10.3.0/24 · VNI 4097</text>

    <!-- Cohort SEC-301 VMs -->
    <g transform="translate(650, 94)">
      <rect width="206" height="44" rx="8" fill="var(--ink-700)" stroke="var(--ink-600)"/>
      <circle cx="20" cy="22" r="5" fill="var(--info-text)"/>
      <text x="34" y="26" fill="var(--text-primary)" font-size="11" font-family="monospace">sec-kali-01</text>
      <text x="162" y="26" fill="var(--text-secondary)" font-size="10" font-family="monospace">.3.5</text>
    </g>
    <g transform="translate(650, 150)">
      <rect width="206" height="44" rx="8" fill="var(--ink-700)" stroke="var(--ink-600)"/>
      <circle cx="20" cy="22" r="5" fill="var(--info-text)"/>
      <text x="34" y="26" fill="var(--text-primary)" font-size="11" font-family="monospace">sec-parrot-02</text>
      <text x="162" y="26" fill="var(--text-secondary)" font-size="10" font-family="monospace">.3.8</text>
    </g>

    <!-- Connection Lines -->
    <!-- Line 1: CS-401 -> Lab Target (Allowed) -->
    <path id="path-allowed" d="M 250 116 C 290 116, 295 124, 350 124" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4"/>

    <!-- Line 2: CS-401 -> SEC-301 (Blocked boundary routed cleanly below Center box) -->
    <path id="path-blocked" d="M 250 228 C 320 318, 580 318, 650 172" fill="none" stroke="var(--danger-border)" stroke-width="2" stroke-dasharray="4 4"/>

    <!-- Firewall Barrier Block Marker (Positioned cleanly below center box at y=312, >= 48px clearance) -->
    <g id="firewall-barrier" transform="translate(450, 312)">
      <rect x="-24" y="-13" width="48" height="26" rx="6" fill="var(--ink-800)" stroke="var(--danger-border)" stroke-width="1.5"/>
      <text x="0" y="4" text-anchor="middle" fill="var(--danger-text)" font-size="11" font-family="monospace" font-weight="bold">ACL</text>
    </g>

    <!-- Traveling Packet Dots -->
    <circle id="pkt-allowed" r="5" fill="var(--accent)" cx="250" cy="116" opacity="0"/>
    <circle id="pkt-blocked" r="5" fill="var(--danger-text)" cx="250" cy="228" opacity="0"/>
  `;

  svgWrapper.appendChild(svg);
  container.appendChild(header);
  container.appendChild(svgWrapper);

  function sendProbePackets() {
    const statusText = container.querySelector('#iso-status-text');
    const pktAllowed = svg.querySelector('#pkt-allowed');
    const pktBlocked = svg.querySelector('#pkt-blocked');
    const barrier = svg.querySelector('#firewall-barrier');

    if (!pktAllowed || !pktBlocked) return;

    statusText.textContent = 'Transmitting probe packets from 10.10.1.5...';

    pktAllowed.setAttribute('opacity', '1');
    const pathAllowed = svg.querySelector('#path-allowed');
    const len1 = pathAllowed.getTotalLength();

    pktBlocked.setAttribute('opacity', '1');
    const pathBlocked = svg.querySelector('#path-blocked');
    const len2 = pathBlocked.getTotalLength();

    const duration = 1200;
    const start = performance.now();

    function animate(time) {
      const elapsed = time - start;
      const t = Math.min(elapsed / duration, 1);

      const p1 = pathAllowed.getPointAtLength(t * len1);
      pktAllowed.setAttribute('cx', p1.x);
      pktAllowed.setAttribute('cy', p1.y);

      const maxLen2 = len2 * 0.44; // Hits ACL barrier cleanly
      const p2 = pathBlocked.getPointAtLength(t * maxLen2);
      pktBlocked.setAttribute('cx', p2.x);
      pktBlocked.setAttribute('cy', p2.y);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        barrier.children[0].setAttribute('fill', 'var(--danger-bg)');
        statusText.innerHTML = '<span style="color: var(--warning-text); font-weight: 700;">100% BLOCKED:</span> Dropped cross-tenant packet at Open vSwitch barrier. 0 leaks.';

        setTimeout(() => {
          pktAllowed.setAttribute('opacity', '0');
          pktBlocked.setAttribute('opacity', '0');
          barrier.children[0].setAttribute('fill', 'var(--ink-800)');
        }, 800);
      }
    }

    requestAnimationFrame(animate);
  }

  // Trigger once on view
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      setTimeout(sendProbePackets, 400);
      observer.disconnect();
    }
  }, { threshold: 0.3 });
  observer.observe(container);

  return container;
}
