import { h, icon } from '../../../lib/dom.js';

export function createAccessCellVisual() {
  let mode = 'gui'; // 'gui' | 'terminal'

  const container = h('div', {
    class: 'rounded-xl p-3 text-xs space-y-3',
    style: 'background-color: var(--surface-2); border: 1px solid var(--border-default);'
  });

  // Toggle switch (Accessible tablist, C2.11)
  const toggleBar = h('div', { class: 'flex items-center justify-between gap-2 flex-wrap' },
    h('div', {
      class: 'inline-flex p-0.5 rounded-lg text-xs',
      style: 'background-color: var(--surface-1); border: 1px solid var(--border-default);',
      role: 'tablist',
      'aria-label': 'Lab access interface'
    },
      tabBtn('gui', 'Desktop GUI (VNC)'),
      tabBtn('terminal', 'Web Terminal (SSH)')
    ),
    h('span', { class: 'text-xs font-mono flex items-center gap-1.5 font-semibold', style: 'color: var(--accent-text);' },
      h('span', { class: 'h-1.5 w-1.5 rounded-full', style: 'background-color: var(--accent);' }),
      'TLS / WSS Gateway'
    )
  );

  const displayArea = h('div', {
    class: 'h-40 rounded-lg overflow-hidden relative',
    'data-surface': 'dark',
    style: 'background-color: var(--ink-950); border: 1px solid var(--ink-600);',
    role: 'tabpanel',
    'aria-label': 'Lab access preview'
  });

  function renderMode() {
    displayArea.innerHTML = '';

    if (mode === 'gui') {
      displayArea.appendChild(h('div', { class: 'fade-in h-full flex flex-col font-sans select-none text-[11px]' },
        h('div', {
          class: 'h-6 border-b flex items-center justify-between px-2',
          style: 'background-color: var(--ink-800); border-color: var(--ink-600); color: var(--text-secondary);'
        },
          h('span', { class: 'font-medium flex items-center gap-1', style: 'color: var(--accent-text);' },
            icon('monitor', 'w-3 h-3'), 'kali-desktop:1'
          ),
          h('span', { class: 'text-[10px] font-mono', style: 'color: var(--text-muted);' }, '60 FPS · 18ms')
        ),
        h('div', {
          class: 'flex-1 p-2 dot-grid flex items-center justify-center'
        },
          h('div', {
            class: 'w-4/5 rounded p-2 shadow-md space-y-1',
            style: 'background-color: var(--ink-700); border: 1px solid var(--ink-500); color: var(--text-secondary);'
          },
            h('div', {
              class: 'flex items-center justify-between text-[10px] border-b pb-1',
              style: 'border-color: var(--ink-600); color: var(--text-muted);'
            },
              h('span', { class: 'font-semibold', style: 'color: var(--text-primary);' }, 'Burp Suite Community'),
              h('span', { style: 'color: var(--accent-text);' }, 'Intercept ON')
            ),
            h('div', { class: 'font-mono text-[10px] pt-1', style: 'color: var(--text-secondary);' }, 'GET /dvwa/login.php HTTP/1.1'),
            h('div', { class: 'font-mono text-[10px]', style: 'color: var(--text-muted);' }, 'Host: 10.10.2.10')
          )
        )
      ));
    } else {
      displayArea.appendChild(h('div', {
        class: 'fade-in h-full p-2.5 font-mono text-[11px] space-y-1 overflow-hidden',
        style: 'color: var(--text-secondary);'
      },
        h('div', { style: 'color: var(--text-muted);' }, 'Connected to kali-lab-01 via WSS SSH.'),
        h('div', { class: 'font-semibold', style: 'color: var(--accent-text);' }, 'student@kali-lab:~$ nmap -F 10.10.2.10'),
        h('div', { class: 'text-[10px]', style: 'color: var(--text-muted);' }, 'Starting Nmap 7.94 ( https://nmap.org )'),
        h('div', { class: 'text-[10px]', style: 'color: var(--text-secondary);' }, 'PORT   STATE SERVICE'),
        h('div', { class: 'text-[10px]', style: 'color: var(--text-primary);' }, '80/tcp open  http'),
        h('div', { class: 'font-semibold pt-1', style: 'color: var(--accent-text);' },
          'student@kali-lab:~$ ',
          h('span', { class: 'inline-block w-1.5 h-3 align-middle', style: 'background-color: var(--accent);' })
        )
      ));
    }
  }

  function tabBtn(val, label) {
    const isCur = mode === val;
    return h('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': isCur ? 'true' : 'false',
      class: 'touch-target min-h-[38px] px-3 rounded-md font-medium text-xs transition-colors cursor-pointer',
      style: isCur
        ? 'background-color: var(--surface-2); color: var(--text-primary);'
        : 'color: var(--text-muted);',
      onClick: () => {
        mode = val;
        updateButtons();
        renderMode();
      }
    }, label);
  }

  function updateButtons() {
    const btns = toggleBar.querySelectorAll('button');
    btns.forEach((btn, i) => {
      const val = i === 0 ? 'gui' : 'terminal';
      const isCur = mode === val;
      btn.setAttribute('aria-selected', isCur ? 'true' : 'false');
      btn.style.backgroundColor = isCur ? 'var(--surface-2)' : 'transparent';
      btn.style.color = isCur ? 'var(--text-primary)' : 'var(--text-muted)';
    });
  }

  container.appendChild(toggleBar);
  container.appendChild(displayArea);
  renderMode();

  return container;
}
