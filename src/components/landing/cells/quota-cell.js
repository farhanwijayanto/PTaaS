import { h, icon } from '../../../lib/dom.js';

export function createQuotaCellVisual() {
  const container = h('div', {
    class: 'rounded-xl p-4 text-xs space-y-3.5',
    style: 'background-color: var(--surface-2); border: 1px solid var(--border-default);'
  });

  const metrics = [
    { label: 'vCPU Compute', current: 4, max: 8, unit: 'Cores', pct: 50 },
    { label: 'Memory (RAM)', current: 8, max: 16, unit: 'GB DDR4', pct: 50 },
    { label: 'Fast NVMe Storage', current: 75, max: 150, unit: 'GB', pct: 50 }
  ];

  const bars = metrics.map(m => {
    const valText = h('span', { class: 'font-mono font-medium', style: 'color: var(--text-primary);' }, `0 / ${m.max} ${m.unit}`);
    const barFill = h('div', { class: 'h-full rounded-full transition-all duration-1000 ease-out', style: 'width: 0%; background-color: var(--accent);' });

    const row = h('div', { class: 'space-y-1.5' },
      h('div', { class: 'flex items-center justify-between text-xs' },
        h('span', { style: 'color: var(--text-secondary);' }, m.label),
        valText
      ),
      h('div', { class: 'h-1.5 w-full rounded-full overflow-hidden', style: 'background-color: var(--border-default);' }, barFill)
    );

    return { row, valText, barFill, target: m };
  });

  bars.forEach(b => container.appendChild(b.row));

  // Footer status indicator
  const footer = h('div', {
    class: 'pt-2 flex items-center justify-between text-xs font-mono border-t',
    style: 'border-color: var(--border-subtle); color: var(--text-muted);'
  },
    h('span', { class: 'flex items-center gap-1.5' },
      h('span', { class: 'h-1.5 w-1.5 rounded-full', style: 'background-color: var(--accent);' }),
      'NIST Resource Pool'
    ),
    h('span', { class: 'text-xs font-semibold tracking-[0.06em]', style: 'color: var(--accent-text);' }, 'Quota Enforced')
  );
  container.appendChild(footer);

  // Animate meters on reveal
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      bars.forEach(({ valText, barFill, target }, i) => {
        setTimeout(() => {
          barFill.style.width = `${target.pct}%`;
          valText.textContent = `${target.current} / ${target.max} ${target.unit} (${target.pct}%)`;
        }, i * 150);
      });
      observer.disconnect();
    }
  }, { threshold: 0.3 });
  observer.observe(container);

  return container;
}
