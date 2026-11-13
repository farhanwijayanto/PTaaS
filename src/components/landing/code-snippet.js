import { h, icon } from '../../lib/dom.js';

export function createCodeSnippet({ command = 'ssh student@lab.example.edu -p 2222', label = 'Quick connect via terminal' }) {
  let copied = false;

  const container = h('div', {
    class: 'rounded-xl border border-line bg-canvas p-3 font-mono text-xs flex items-center justify-between gap-4 max-w-lg shadow-sm'
  });

  const cmdSpan = h('div', { class: 'flex items-center gap-2 overflow-x-auto text-muted' },
    h('span', { class: 'text-[var(--accent-text)] select-none font-bold' }, '$'),
    h('span', { class: 'text-fg select-all' }, command),
    h('span', {
      class: 'inline-block w-1.5 h-3.5 bg-accent select-none pointer-events-none',
      'aria-hidden': 'true',
      'data-decor': 'snippet-caret',
      'data-decor-anim': 'caret-blink',
      style: 'animation: cursor-blink 1.1s step-end infinite;'
    })
  );

  const copyBtn = h('button', {
    type: 'button',
    'aria-label': 'Copy terminal connection command',
    class: 'touch-target rounded-lg border border-line bg-surface px-3 py-2 text-xs font-sans text-muted hover:text-fg hover:border-line-strong transition-all flex items-center gap-1.5 shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-accent',
    onClick: () => {
      navigator.clipboard?.writeText(command);
      copied = true;
      renderBtn();
      setTimeout(() => {
        copied = false;
        renderBtn();
      }, 1500);
    }
  });

  function renderBtn() {
    copyBtn.innerHTML = '';
    if (copied) {
      copyBtn.classList.add('text-accent', 'border-accent');
      copyBtn.appendChild(icon('check', 'w-3 h-3 text-accent'));
      copyBtn.append('Copied');
    } else {
      copyBtn.classList.remove('text-accent', 'border-accent');
      copyBtn.appendChild(icon('copy', 'w-3 h-3'));
      copyBtn.append('Copy');
    }
  }

  renderBtn();
  container.appendChild(cmdSpan);
  container.appendChild(copyBtn);

  return container;
}
