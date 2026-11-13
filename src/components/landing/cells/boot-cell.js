import { h, icon } from '../../../lib/dom.js';

export function createBootCellVisual() {
  const container = h('div', {
    class: 'rounded-xl p-4 font-mono text-xs space-y-3',
    style: 'background-color: var(--surface-2); border: 1px solid var(--border-default);'
  });

  const progressTrack = h('div', { class: 'h-1.5 w-full rounded-full overflow-hidden', style: 'background-color: var(--border-default);' });
  const progressBar = h('div', { class: 'h-full rounded-full transition-all duration-1000 ease-out', style: 'width: 0%; background-color: var(--accent);' });
  progressTrack.appendChild(progressBar);

  const statusLine = h('div', { class: 'flex items-center justify-between text-[11px]' },
    h('span', { class: 'flex items-center gap-1.5', style: 'color: var(--text-secondary);' },
      h('span', { class: 'h-2 w-2 rounded-full', style: 'background-color: var(--accent);' }),
      'Booting KVM instance...'
    ),
    h('span', { class: 'font-semibold', style: 'color: var(--text-primary);' }, '0.0s')
  );

  const logBox = h('div', {
    class: 'h-28 overflow-hidden space-y-1 text-[11px] font-mono rounded-lg p-2.5',
    'data-surface': 'dark',
    style: 'background-color: var(--ink-950); border: 1px solid var(--ink-600);'
  });

  const replayBtn = h('button', {
    type: 'button',
    'aria-label': 'Replay boot sequence animation',
    class: 'touch-target min-h-[40px] text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer rounded-md px-2',
    style: 'color: var(--text-secondary);',
    onClick: runAnimation
  }, icon('rotate-ccw', 'w-3.5 h-3.5 text-accent-text'), 'Replay boot sequence');

  container.appendChild(statusLine);
  container.appendChild(progressTrack);
  container.appendChild(logBox);
  container.appendChild(replayBtn);

  const logs = [
    { t: '0.2s', msg: 'QEMU/KVM: 2 vCPU assigned to isolated tenant slot' },
    { t: '1.4s', msg: 'Kernel 6.6 cloud-init loaded Debian rootfs' },
    { t: '4.8s', msg: 'Open vSwitch: VXLAN VNI 4096 port connected' },
    { t: '12.1s', msg: 'Apache Guacamole: WSS 1.3 TLS endpoint active' },
    { t: '18.4s', msg: 'System ready: 10.10.1.5 available via browser' }
  ];

  let timer = null;

  function runAnimation() {
    clearTimeout(timer);
    logBox.innerHTML = '';
    progressBar.style.width = '0%';
    statusLine.children[0].innerHTML = '<span class="h-2 w-2 rounded-full inline-block mr-1" style="background-color: var(--accent);"></span>Booting KVM instance...';
    statusLine.children[1].textContent = '0.0s';

    let index = 0;
    function nextStep() {
      if (index >= logs.length) {
        progressBar.style.width = '100%';
        statusLine.children[0].innerHTML = '<span class="h-2 w-2 rounded-full inline-block mr-1" style="background-color: var(--accent);"></span>Boot complete';
        statusLine.children[1].textContent = 'Ready in 18.4s';
        return;
      }

      const log = logs[index];
      const line = h('div', { class: 'fade-in flex items-center gap-2' },
        h('span', { style: 'color: var(--text-muted);' }, `[${log.t}]`),
        h('span', {
          class: index === logs.length - 1 ? 'font-medium' : '',
          style: index === logs.length - 1 ? 'color: var(--accent-text);' : 'color: var(--text-secondary);'
        }, log.msg)
      );
      logBox.appendChild(line);
      logBox.scrollTop = logBox.scrollHeight;

      const pct = Math.round(((index + 1) / logs.length) * 100);
      progressBar.style.width = `${pct}%`;
      statusLine.children[1].textContent = log.t;

      index++;
      timer = setTimeout(nextStep, 380);
    }

    timer = setTimeout(nextStep, 150);
  }

  // Auto-play once when visible
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      runAnimation();
      observer.disconnect();
    }
  }, { threshold: 0.3 });
  observer.observe(container);

  return container;
}
