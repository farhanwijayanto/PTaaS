import { h, icon } from '../../../lib/dom.js';
import { onCleanup } from '../../../lib/router.js';
import { useInView } from '../decor/hooks.js';

export function createLifecycleDiagram() {
  const container = h('div', {
    class: 'rounded-2xl border border-line bg-surface p-6 sm:p-8 space-y-6 shadow-sm overflow-hidden relative',
    'data-in-view': 'false'
  });
  onCleanup(useInView(container));

  const header = h('div', { class: 'flex flex-wrap items-center justify-between gap-4' },
    h('div', { class: 'space-y-1' },
      h('span', { class: 'text-[12px] font-mono tracking-[0.06em] uppercase text-[var(--accent-text)] font-semibold' },
        '02 / RESOURCE LIFECYCLE',
        h('span', { class: 'eyebrow-cursor', 'aria-hidden': 'true', 'data-decor': 'eyebrow-cursor', 'data-decor-anim': 'eyebrow-blink' })
      ),
      h('h3', { class: 'text-xl font-semibold tracking-tight text-fg' }, 'Scale to Zero: Automatic Idle Reclaim'),
      h('p', { class: 'text-xs text-muted max-w-xl' },
        'You only use resources while you are actually working. VMs automatically freeze state and release vCPU/RAM after sitting idle.'
      )
    ),
    h('button', {
      type: 'button',
      'aria-label': 'Replay resource lifecycle animation',
      class: 'touch-target min-h-[44px] rounded-lg border border-line bg-canvas px-3.5 py-2 text-xs font-mono text-muted hover:text-fg hover:border-line-strong flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      onClick: startAnimation
    }, icon('rotate-ccw', 'w-3.5 h-3.5 text-[var(--accent-text)]'), 'Replay Lifecycle')
  );

  // Horizontal Timeline stages
  const stages = [
    { key: 'running', title: '1. Running', desc: 'Active student lab session', cpu: '45% CPU', ram: '2.1 GB RAM' },
    { key: 'idle', title: '2. Idle (60m)', desc: 'No user input detected', cpu: '2% CPU', ram: '2.1 GB RAM' },
    { key: 'stopped', title: '3. Auto-Stopped', desc: 'vCPU & RAM released to pool', cpu: '0% CPU', ram: '0 GB RAM' },
    { key: 'resume', title: '4. Instant Resume', desc: 'Restored in < 15 seconds', cpu: '38% CPU', ram: '2.1 GB RAM' }
  ];

  const timelineTrack = h('div', { class: 'relative py-6' });

  // Background connecting line
  const trackLine = h('div', { class: 'absolute top-1/2 left-6 right-6 h-0.5 -translate-y-1/2 bg-line' });
  const progressLine = h('div', {
    class: 'absolute top-1/2 left-6 right-6 h-0.5 -translate-y-1/2 bg-accent origin-left transition-transform duration-700 ease-out',
    style: 'transform: scaleX(0);'
  });

  // Traveling glowing dot (uses transform only, no left animation)
  const travelingDot = h('div', {
    class: 'absolute top-1/2 left-6 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent transition-opacity duration-300',
    style: 'opacity: 0; box-shadow: 0 0 12px var(--accent-glow);'
  });

  const stageNodes = h('div', { class: 'relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4' });

  const nodeElements = stages.map((st, i) => {
    const dot = h('div', { class: 'h-4 w-4 rounded-full border-2 border-line bg-canvas flex items-center justify-center transition-colors duration-300' });
    const card = h('div', {
      class: 'rounded-xl border border-line bg-canvas p-3.5 text-xs space-y-2 transition-all duration-300'
    },
      h('div', { class: 'flex items-center gap-2' },
        dot,
        h('span', { class: 'font-semibold text-fg text-xs' }, st.title)
      ),
      h('p', { class: 'text-[11px] text-muted' }, st.desc),
      h('div', { class: 'flex items-center justify-between font-mono text-[10px] text-subtle pt-1 border-t border-line' },
        h('span', { class: 'metric-cpu' }, st.cpu),
        h('span', { class: 'metric-ram' }, st.ram)
      )
    );
    return { card, dot, index: i };
  });

  nodeElements.forEach(n => stageNodes.appendChild(n.card));

  timelineTrack.appendChild(trackLine);
  timelineTrack.appendChild(progressLine);
  timelineTrack.appendChild(travelingDot);
  timelineTrack.appendChild(stageNodes);

  // Resource curve visual (SVG sparkline)
  const chartWrapper = h('div', { class: 'rounded-xl border border-line bg-canvas p-4 space-y-2' },
    h('div', { class: 'flex items-center justify-between text-xs font-mono text-muted' },
      h('span', {}, 'Hypervisor Resource Allocation Line'),
      h('span', { class: 'text-[var(--accent-text)] font-semibold' }, 'Scale-to-Zero Efficiency: 100%')
    ),
    h('svg', {
      viewBox: '0 0 800 120',
      class: 'w-full h-24 stroke-accent fill-none',
      xmlns: 'http://www.w3.org/2000/svg'
    },
      // Grid lines
      h('line', { x1: '0', y1: '30', x2: '800', y2: '30', stroke: 'rgb(var(--line))', 'stroke-dasharray': '4 4' }),
      h('line', { x1: '0', y1: '70', x2: '800', y2: '70', stroke: 'rgb(var(--line))', 'stroke-dasharray': '4 4' }),
      h('line', { x1: '0', y1: '110', x2: '800', y2: '110', stroke: 'rgb(var(--line))' }),

      // The usage path: High (running) -> dropping to 0 (auto-stopped) -> surging back on resume
      h('path', {
        d: 'M 10 40 Q 150 40 200 45 L 350 45 Q 400 45 420 110 L 600 110 Q 640 110 660 50 L 790 40',
        stroke: 'rgb(var(--accent))',
        'stroke-width': '2.5',
        class: 'path-draw'
      }),
      // Fill area under curve
      h('path', {
        d: 'M 10 40 Q 150 40 200 45 L 350 45 Q 400 45 420 110 L 600 110 Q 640 110 660 50 L 790 40 L 790 110 L 10 110 Z',
        fill: 'rgb(var(--accent) / 0.08)',
        stroke: 'none'
      })
    )
  );

  container.appendChild(header);
  container.appendChild(timelineTrack);
  container.appendChild(chartWrapper);

  let animTimer = null;
  onCleanup(() => clearTimeout(animTimer));

  function startAnimation() {
    clearTimeout(animTimer);
    travelingDot.style.opacity = '1';
    progressLine.style.transform = 'scaleX(0)';
    travelingDot.style.transform = 'translate(0px, -50%)';

    nodeElements.forEach(n => {
      n.card.classList.remove('border-accent', 'shadow-md');
      n.dot.classList.remove('bg-accent', 'border-accent');
    });

    const scales = [0, 0.33, 0.66, 1];
    let step = 0;

    function nextStep() {
      if (step >= stages.length) {
        return;
      }

      const scale = scales[step];
      const trackWidth = Math.max(0, trackLine.offsetWidth);
      progressLine.style.transform = `scaleX(${scale})`;
      travelingDot.style.transform = `translate(${Math.round(trackWidth * scale)}px, -50%)`;

      const current = nodeElements[step];
      current.card.classList.add('border-accent');
      current.dot.classList.add('bg-accent', 'border-accent');

      step++;
      animTimer = setTimeout(nextStep, 1000);
    }

    nextStep();
  }

  // Trigger once on viewport intersection
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      startAnimation();
      observer.disconnect();
    }
  }, { threshold: 0.3 });
  observer.observe(container);
  onCleanup(() => observer.disconnect());

  return container;
}
