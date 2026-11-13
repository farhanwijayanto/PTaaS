import { h, icon } from '../../../lib/dom.js';
import { onCleanup } from '../../../lib/router.js';
import { useInView } from '../decor/hooks.js';
import { isReducedOrLow } from '../decor/config.js';

export function createBranchingVisual() {
  const container = h('div', {
    class: 'rounded-2xl border border-line bg-surface p-6 sm:p-8 space-y-6 shadow-sm overflow-hidden relative',
    'data-in-view': 'false'
  });
  onCleanup(useInView(container));

  const header = h('div', { class: 'flex flex-wrap items-center justify-between gap-4' },
    h('div', { class: 'space-y-1' },
      h('span', { class: 'text-[12px] font-mono tracking-[0.06em] uppercase text-[var(--accent-text)] font-semibold' },
        '04 / INSTANT CLONING & SNAPSHOTS',
        h('span', { class: 'eyebrow-cursor', 'aria-hidden': 'true', 'data-decor': 'eyebrow-cursor', 'data-decor-anim': 'eyebrow-blink' })
      ),
      h('h3', { class: 'text-xl font-semibold tracking-tight text-fg' }, 'Copy-on-Write Branching: Golden Images to Student Labs'),
      h('p', { class: 'text-xs text-muted max-w-xl' },
        'One golden image, a dedicated VM per student. Each lab machine branches off instantly using copy-on-write storage with zero disk duplication.'
      )
    ),
    h('div', { class: 'rounded-lg border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-muted' },
      'CoW Clone Time: ', h('span', { class: 'text-[var(--accent-text)] font-bold' }, '< 0.8s')
    )
  );

  // SVG Git-Graph Diagram
  const svgWrapper = h('div', {
    class: 'rounded-xl border border-line p-4 relative overflow-hidden',
    'data-surface': 'dark',
    style: 'background-color: var(--ink-950);'
  });

  const tooltip = h('div', {
    class: 'absolute z-30 pointer-events-none rounded-md border border-line bg-surface backdrop-blur px-2.5 py-1.5 text-[11px] font-mono text-fg shadow-lg transition-opacity duration-200 opacity-0',
    style: 'top: 20px; left: 20px;'
  });
  svgWrapper.appendChild(tooltip);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 900 320');
  svg.setAttribute('class', 'w-full h-auto select-none');

  svg.innerHTML = `
    <defs>
      <linearGradient id="branchGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="var(--info)" stop-opacity="0.8"/>
      </linearGradient>
      <filter id="branchGlow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <!-- Branching Curved Paths -->
    <!-- Path 1: Root -> Student VM 1 -->
    <path id="branch-p1" d="M 160 160 C 260 160, 320 80, 480 80 L 640 80" fill="none" stroke="url(#branchGrad)" stroke-width="2.5" class="path-draw"/>

    <!-- Path 2: Root -> Student VM 2 (Main Trunk) -->
    <path id="branch-p2" d="M 160 160 L 640 160" fill="none" stroke="var(--accent)" stroke-width="2.5" class="path-draw"/>

    <!-- Path 3: Root -> Student VM 3 -->
    <path id="branch-p3" d="M 160 160 C 260 160, 320 240, 480 240 L 640 240" fill="none" stroke="url(#branchGrad)" stroke-width="2.5" class="path-draw"/>

    <!-- Path 4: Student VM 2 -> Milestone Snapshot -->
    <path id="branch-p4" d="M 440 160 C 490 160, 500 200, 560 200 L 640 200" fill="none" stroke="var(--info-text)" stroke-width="2" stroke-dasharray="4 4" class="path-draw"/>

    <!-- Traveling Light Pulse -->
    <circle id="pulse-dot" r="4.5" fill="var(--text-primary)" filter="url(#branchGlow)" cx="160" cy="160" opacity="0.85"/>

    <!-- Node 1: Golden Image (Root) -->
    <g class="branch-node cursor-pointer focus-visible:outline-none" tabindex="0" role="button" aria-label="Golden OS Image details" data-info="Golden OS Image: Kali 2024.3 · Read-Only Base · 12 GB" transform="translate(120, 160)">
      <circle r="22" fill="var(--ink-800)" stroke="var(--accent)" stroke-width="2"/>
      <circle r="8" fill="var(--accent)"/>
      <text x="-40" y="42" fill="var(--text-primary)" font-size="11" font-family="Geist, sans-serif" font-weight="600">Golden Image</text>
      <text x="-35" y="56" fill="var(--text-secondary)" font-size="9" font-family="monospace">Kali Linux 2024.3</text>
    </g>

    <!-- Node 2: Student Lab 01 -->
    <g class="branch-node cursor-pointer focus-visible:outline-none" tabindex="0" role="button" aria-label="Student VM 1 details" data-info="Student VM: kali-lab-01 · 10.10.1.5 · Running (Active)" transform="translate(640, 80)">
      <circle r="16" fill="var(--ink-800)" stroke="var(--info-text)" stroke-width="2"/>
      <circle r="6" fill="var(--info-text)"/>
      <text x="26" y="4" fill="var(--text-primary)" font-size="11" font-family="monospace" font-weight="500">kali-lab-01 (10.10.1.5)</text>
      <text x="26" y="18" fill="var(--text-secondary)" font-size="9" font-family="sans-serif">Student: John Doe · Cohort CS-401</text>
    </g>

    <!-- Node 3: Student Lab 02 -->
    <g class="branch-node cursor-pointer focus-visible:outline-none" tabindex="0" role="button" aria-label="Student VM 2 details" data-info="Student VM: kali-lab-02 · 10.10.1.12 · Running (Active)" transform="translate(640, 160)">
      <circle r="16" fill="var(--ink-800)" stroke="var(--accent)" stroke-width="2"/>
      <circle r="6" fill="var(--accent)"/>
      <text x="26" y="4" fill="var(--text-primary)" font-size="11" font-family="monospace" font-weight="500">kali-lab-02 (10.10.1.12)</text>
      <text x="26" y="18" fill="var(--text-secondary)" font-size="9" font-family="sans-serif">Student: Jane Smith · Cohort CS-401</text>
    </g>

    <!-- Node 4: Milestone Snapshot -->
    <g class="branch-node cursor-pointer focus-visible:outline-none" tabindex="0" role="button" aria-label="Snapshot details" data-info="Snapshot: snap-pre-exploit · 420 MB CoW diff · 1-click restore" transform="translate(640, 200)">
      <rect x="-10" y="-10" width="20" height="20" rx="4" fill="var(--ink-800)" stroke="var(--info-text)" stroke-width="1.5"/>
      <circle r="4" fill="var(--info-text)"/>
      <text x="26" y="4" fill="var(--info-text)" font-size="10" font-family="monospace">snap-pre-exploit (CoW)</text>
    </g>

    <!-- Node 5: Student Lab 03 -->
    <g class="branch-node cursor-pointer focus-visible:outline-none" tabindex="0" role="button" aria-label="Student VM 3 details" data-info="Student VM: kali-lab-03 · 10.10.3.10 · Stopped" transform="translate(640, 240)">
      <circle r="16" fill="var(--ink-800)" stroke="var(--text-secondary)" stroke-width="2"/>
      <circle r="6" fill="var(--text-secondary)"/>
      <text x="26" y="4" fill="var(--text-primary)" font-size="11" font-family="monospace" font-weight="500">kali-lab-03 (10.10.3.10)</text>
      <text x="26" y="18" fill="var(--text-secondary)" font-size="9" font-family="sans-serif">Student: Liam Harris · Cohort SEC-301</text>
    </g>
  `;

  svgWrapper.appendChild(svg);
  container.appendChild(header);
  container.appendChild(svgWrapper);

  // Accessible Tooltips on nodes (hover, focus, and touch, C2.11)
  const nodes = svg.querySelectorAll('.branch-node');
  const showTooltip = (node) => {
    const info = node.getAttribute('data-info');
    tooltip.textContent = info;
    tooltip.style.opacity = '1';
    const bbox = node.getBoundingClientRect();
    const wrapBox = svgWrapper.getBoundingClientRect();
    tooltip.style.left = `${Math.max(10, bbox.left - wrapBox.left - 20)}px`;
    tooltip.style.top = `${Math.max(10, bbox.top - wrapBox.top - 36)}px`;
  };
  const hideTooltip = () => {
    tooltip.style.opacity = '0';
  };

  nodes.forEach(node => {
    node.addEventListener('mouseenter', () => showTooltip(node));
    node.addEventListener('mouseleave', hideTooltip);
    node.addEventListener('focus', () => showTooltip(node));
    node.addEventListener('blur', hideTooltip);
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      showTooltip(node);
    });
  });
  document.addEventListener('click', hideTooltip);

  // One-shot pulse animation traveling along branch path on reveal (plus replay on hover)
  const pulseDot = svg.querySelector('#pulse-dot');
  const path = svg.querySelector('#branch-p1');
  let isAnimatingPulse = false;

  function triggerPulse() {
    if (!pulseDot || !path || isReducedOrLow() || isAnimatingPulse) return;
    isAnimatingPulse = true;
    const len = path.getTotalLength();
    const duration = 1400;
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const pt = path.getPointAtLength(t * len);
      pulseDot.setAttribute('cx', pt.x);
      pulseDot.setAttribute('cy', pt.y);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        isAnimatingPulse = false;
      }
    }

    requestAnimationFrame(step);
  }

  svgWrapper.addEventListener('mouseenter', triggerPulse, { passive: true });

  // Trigger pulse once on view
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      triggerPulse();
      observer.disconnect();
    }
  }, { threshold: 0.3 });
  observer.observe(container);

  return container;
}
