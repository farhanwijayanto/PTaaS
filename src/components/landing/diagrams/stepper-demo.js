import { h, icon } from '../../../lib/dom.js';
import { onCleanup } from '../../../lib/router.js';
import { useInView } from '../decor/hooks.js';
import { isReducedOrLow } from '../decor/config.js';
import { isDesktopMotionEnabled, isReducedMotion, loadMotionCore } from '../../../lib/motion.js';

export function createStepperDemo() {
  let currentStep = 0;
  let selectedOs = 'kali'; // 'kali' | 'parrot' | 'ubuntu'
  let isUserInteracted = false;
  let autoTimer = null;

  const container = h('div', {
    class: 'rounded-2xl border border-line bg-surface p-6 sm:p-8 space-y-6 shadow-sm overflow-hidden relative',
    'data-in-view': 'false'
  });
  onCleanup(useInView(container));
  onCleanup(() => clearTimeout(autoTimer));

  const header = h('div', { class: 'flex flex-wrap items-center justify-between gap-4' },
    h('div', { class: 'space-y-1' },
      h('span', { class: 'text-[12px] font-mono tracking-[0.06em] uppercase text-[var(--accent-text)] font-semibold' },
        '05 / ON-DEMAND SELF SERVICE',
        h('span', { class: 'eyebrow-cursor', 'aria-hidden': 'true', 'data-decor': 'eyebrow-cursor', 'data-decor-anim': 'eyebrow-blink' })
      ),
      h('h3', { class: 'text-xl font-semibold tracking-tight text-fg' }, 'Launch a Pentest Lab in 5 Straightforward Steps'),
      h('p', { class: 'text-xs text-muted max-w-xl' },
        'Automated VM orchestration with no admin intervention. Choose an OS, configure hardware quotas, and boot into a browser desktop in under 3 minutes.'
      )
    ),
    // OS Switcher
    h('div', { class: 'flex items-center gap-1 rounded-lg border border-line bg-canvas p-1 text-xs' },
      osBtn('kali', 'Kali 2024.3'),
      osBtn('parrot', 'Parrot 6.1'),
      osBtn('ubuntu', 'Ubuntu 24.04')
    )
  );

  const steps = [
    { num: '01', title: 'Choose OS', desc: 'Select pre-installed security toolkit' },
    { num: '02', title: 'Compute & RAM', desc: 'Allocate vCPU & memory limits' },
    { num: '03', title: 'Isolated VPC', desc: 'Attach to tenant VXLAN subnet' },
    { num: '04', title: 'Review Quota', desc: 'Verify NIST fair-share limits' },
    { num: '05', title: 'Connect & Exploit', desc: 'Browser VNC & Web Terminal' }
  ];

  // Grid: Stepper navigation on Left (1/3), Matching UI snippet on Right (2/3)
  const grid = h('div', { class: 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch' });

  // Left Stepper List (Tablist pattern, C2.11) with connecting vertical dotted line that fills
  const navCol = h('div', {
    class: 'lg:col-span-5 relative flex flex-col justify-between space-y-2',
    role: 'tablist',
    'aria-label': 'Launch VM 5 steps'
  });

  // Vertical dotted track connecting the 5 numbered nodes
  const trackWrap = h('div', {
    class: 'absolute left-[25px] top-7 bottom-7 w-px border-l border-dashed border-line-strong pointer-events-none select-none',
    'aria-hidden': 'true',
    'data-decor': 'stepper-track',
    style: 'z-index: 0; pointer-events: none;'
  });
  const trackFill = h('div', {
    class: 'w-[2px] -ml-[1px] h-full bg-accent origin-top transition-transform duration-500 ease-out pointer-events-none',
    style: 'transform: scaleY(0);'
  });
  trackWrap.appendChild(trackFill);
  navCol.appendChild(trackWrap);

  const stepButtons = steps.map((s, idx) => {
    return h('button', {
      type: 'button',
      role: 'tab',
      id: `step-tab-${idx}`,
      'aria-selected': currentStep === idx ? 'true' : 'false',
      'aria-controls': 'step-panel',
      class: `w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex items-start gap-3.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        currentStep === idx
          ? 'border-accent bg-canvas shadow-sm'
          : 'border-transparent hover:bg-canvas/50 text-muted hover:text-fg'
      }`,
      onKeyDown: (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          const next = (idx + 1) % steps.length;
          stepButtons[next].focus();
          stepButtons[next].click();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const prev = (idx - 1 + steps.length) % steps.length;
          stepButtons[prev].focus();
          stepButtons[prev].click();
        }
      },
      onClick: () => {
        isUserInteracted = true;
        clearTimeout(autoTimer);
        currentStep = idx;
        renderStep();
      }
    },
      h('span', {
        class: `flex h-6 w-6 items-center justify-center rounded-md font-mono text-xs font-semibold shrink-0 transition-colors ${
          currentStep === idx ? 'bg-accent text-canvas' : 'bg-raised text-fg border border-line'
        }`
      }, s.num),
      h('div', {},
        h('span', { class: `text-xs font-semibold block ${currentStep === idx ? 'text-fg' : 'text-muted'}` }, s.title),
        h('span', { class: 'text-[11px] text-subtle block' }, s.desc)
      )
    );
  });

  stepButtons.forEach(btn => navCol.appendChild(btn));

  // Right Preview snippet
  const previewCol = h('div', {
    id: 'step-panel',
    role: 'tabpanel',
    'aria-labelledby': `step-tab-${currentStep}`,
    'data-surface': 'dark',
    style: 'background-color: var(--ink-950);',
    class: 'lg:col-span-7 rounded-xl border border-line p-5 font-mono text-xs text-muted shadow-xl flex flex-col justify-between h-[350px] overflow-hidden'
  });

  grid.appendChild(navCol);
  grid.appendChild(previewCol);

  container.appendChild(header);
  container.appendChild(grid);

  function osBtn(val, label) {
    const isCur = selectedOs === val;
    return h('button', {
      type: 'button',
      'aria-pressed': isCur ? 'true' : 'false',
      'aria-label': `Select OS ${label}`,
      class: `touch-target px-3 py-1.5 rounded-md font-mono text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        isCur ? 'bg-accent text-canvas font-semibold' : 'text-muted hover:text-fg'
      }`,
      onClick: () => {
        selectedOs = val;
        renderHeader();
        renderStep();
      }
    }, label);
  }

  function renderHeader() {
    header.children[1].replaceChildren(
      osBtn('kali', 'Kali 2024.3'),
      osBtn('parrot', 'Parrot 6.1'),
      osBtn('ubuntu', 'Ubuntu 24.04')
    );
  }

  function renderStep() {
    const fillRatio = steps.length > 1 ? currentStep / (steps.length - 1) : 1;
    trackFill.style.transform = `scaleY(${fillRatio.toFixed(3)})`;

    // Update active button state
    stepButtons.forEach((btn, idx) => {
      btn.setAttribute('aria-selected', idx === currentStep ? 'true' : 'false');
      if (idx === currentStep) {
        btn.className = 'relative z-10 w-full text-left p-3.5 rounded-xl border border-accent bg-canvas shadow-sm flex items-start gap-3.5 transition-all duration-200 cursor-pointer';
        btn.querySelector('span').className = 'flex h-6 w-6 items-center justify-center rounded-md font-mono text-xs font-semibold shrink-0 bg-accent text-canvas';
      } else {
        const isPast = idx < currentStep;
        btn.className = 'relative z-10 w-full text-left p-3.5 rounded-xl border border-transparent hover:bg-canvas/50 text-muted hover:text-fg flex items-start gap-3.5 transition-all duration-200 cursor-pointer';
        btn.querySelector('span').className = `flex h-6 w-6 items-center justify-center rounded-md font-mono text-xs font-semibold shrink-0 ${isPast ? 'bg-[var(--accent-bg)] text-[var(--accent-text)] border border-[var(--accent-border)]' : 'bg-raised text-fg border border-line'}`;
      }
    });

    previewCol.innerHTML = '';

    // Step 0: Choose OS
    if (currentStep === 0) {
      previewCol.appendChild(h('div', { class: 'fade-in space-y-3' },
        h('div', { class: 'flex items-center justify-between border-b border-line pb-2 text-muted font-sans' },
          h('span', { class: 'font-semibold text-fg' }, 'Step 1: Select Operating System Template'),
          h('span', { class: 'text-[var(--accent-text)] text-[11px]' }, 'Pre-configured')
        ),
        h('div', { class: 'grid grid-cols-3 gap-2.5 pt-2' },
          osCard('kali', 'Kali Linux', '2024.3 Rolling', '2,400+ pentest tools'),
          osCard('parrot', 'Parrot Sec', '6.1 Security', 'Anonymity & forensics'),
          osCard('ubuntu', 'Ubuntu LTS', '24.04 Hardened', 'CTF & script dev')
        ),
        h('div', { class: 'rounded bg-surface p-2.5 text-[11px] text-muted space-y-1' },
          h('div', { class: 'text-fg font-semibold' }, `Selected: ${selectedOs.toUpperCase()}`),
          h('div', {}, 'Includes: Nmap, Metasploit Framework, Burp Suite, Wireshark, SQLmap, Hydra.')
        )
      ));
    }
    // Step 1: Compute & RAM
    else if (currentStep === 1) {
      previewCol.appendChild(h('div', { class: 'fade-in space-y-3' },
        h('div', { class: 'flex items-center justify-between border-b border-line pb-2 text-muted font-sans' },
          h('span', { class: 'font-semibold text-fg' }, 'Step 2: Allocate Compute Quota'),
          h('span', { class: 'text-[var(--accent-text)] text-[11px]' }, 'NIST SP 800-145')
        ),
        h('div', { class: 'space-y-2.5 pt-2 text-[11px]' },
          specRow('vCPU Processor', '2 Virtual Cores (AMD EPYC™)', '25% of student tier quota'),
          specRow('System Memory', '4 GB DDR4 ECC RAM', '50% of student tier quota'),
          specRow('NVMe Disk', '30 GB Fast Persistent Volume', '20% of storage quota')
        ),
        h('div', { class: 'rounded bg-surface p-2 text-[10px] text-subtle' },
          'Automated idle timer: Auto-stops after 60 min of zero terminal activity.'
        )
      ));
    }
    // Step 2: Isolated VPC
    else if (currentStep === 2) {
      previewCol.appendChild(h('div', { class: 'fade-in space-y-3' },
        h('div', { class: 'flex items-center justify-between border-b border-line pb-2 text-muted font-sans' },
          h('span', { class: 'font-semibold text-fg' }, 'Step 3: Network Segmentation & Subnet'),
          h('span', { class: 'text-[var(--accent-text)] text-[11px]' }, 'VXLAN Active')
        ),
        h('div', { class: 'space-y-2 pt-2 text-[11px]' },
          specRow('Tenant VPC', 'vpc-cs401-01', 'Isolated VNI 4096'),
          specRow('Allocated Lab IP', '10.10.1.5/24', 'Static DHCP reservation'),
          specRow('Target Routing', '10.10.2.0/24 (Lab Targets)', 'Permitted route table'),
          specRow('Public Egress', '0.0.0.0/0 (Internet)', 'STRICT DROP (Firewall)')
        )
      ));
    }
    // Step 3: Review Quota
    else if (currentStep === 3) {
      previewCol.appendChild(h('div', { class: 'fade-in space-y-3' },
        h('div', { class: 'flex items-center justify-between border-b border-line pb-2 text-muted font-sans' },
          h('span', { class: 'font-semibold text-fg' }, 'Step 4: Review Configuration & SLA'),
          h('span', { class: 'text-[var(--success-text)] text-[11px]' }, '100% Validated')
        ),
        h('div', { class: 'rounded-lg border border-line bg-surface p-3 space-y-2 text-[11px]' },
          h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'VM Identifier:'), h('span', { class: 'text-fg font-bold' }, `${selectedOs}-lab-01`)),
          h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Expected Boot Time:'), h('span', { class: 'text-[var(--accent-text)]' }, '< 20 seconds (SLA target < 3 min)')),
          h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Connection Protocol:'), h('span', { class: 'text-fg' }, 'Guacamole TLS 1.3 / WSS'))
        ),
        h('div', { class: 'flex items-center gap-2 text-[var(--accent-text)] text-[11px] pt-1' },
          icon('check-circle-2', 'w-3.5 h-3.5'),
          h('span', {}, 'All parameters verified against institutional quota policy.')
        )
      ));
    }
    // Step 4: Launch & Live Terminal
    else if (currentStep === 4) {
      previewCol.appendChild(h('div', { class: 'fade-in space-y-2' },
        h('div', { class: 'flex items-center justify-between border-b border-line pb-1.5 text-muted font-sans' },
          h('div', { class: 'flex items-center gap-2' },
            h('span', { class: 'h-2 w-2 rounded-full bg-accent' }),
            h('span', { class: 'font-semibold text-fg' }, `${selectedOs}-lab-01 · Active`)
          ),
          h('span', { class: 'rounded bg-[var(--accent-bg)] text-[var(--accent-text)] px-2 py-0.5 text-[10px] font-bold' }, 'Ready in 18.4s')
        ),
        h('div', { class: 'space-y-1 text-[11px] text-muted pt-1' },
          h('div', { class: 'text-subtle' }, `[system] Connected to ${selectedOs}-lab-01 over encrypted WSS gateway.`),
          h('div', { class: 'text-[var(--accent-text)] font-semibold' }, `student@${selectedOs}-lab:~$ nmap -sV 10.10.2.10`),
          h('div', { class: 'text-muted text-[10px]' }, 'Nmap scan report for target-dvwa (10.10.2.10)'),
          h('div', { class: 'text-fg text-[10px]' }, 'PORT   STATE SERVICE VERSION'),
          h('div', { class: 'text-fg text-[10px]' }, '80/tcp open  http    Apache/2.4.52 (Ubuntu)'),
          h('div', { class: 'text-[var(--accent-text)] font-semibold pt-1' }, `student@${selectedOs}-lab:~$ `, h('span', { class: 'inline-block w-1.5 h-3 bg-accent align-middle' }))
        )
      ));
    }

    // Auto-advance loop (plays once until end, unless user clicked)
    if (!isUserInteracted) {
      clearTimeout(autoTimer);
      if (currentStep < steps.length - 1) {
        autoTimer = setTimeout(() => {
          currentStep++;
          renderStep();
        }, 2200);
      }
    }
  }

  function osCard(key, title, ver, desc) {
    const isSel = selectedOs === key;
    return h('div', {
      class: `rounded-lg border p-2.5 text-center cursor-pointer transition-colors ${
        isSel ? 'border-accent bg-[var(--accent-bg)] text-fg' : 'border-line bg-surface text-muted hover:border-line-strong'
      }`,
      onClick: () => {
        selectedOs = key;
        renderHeader();
        renderStep();
      }
    },
      h('div', { class: 'font-bold text-xs text-fg' }, title),
      h('div', { class: 'text-[10px] text-[var(--accent-text)]' }, ver),
      h('div', { class: 'text-[9px] text-subtle pt-1' }, desc)
    );
  }

  function specRow(label, val, note) {
    return h('div', { class: 'flex items-center justify-between border-b border-line pb-1' },
      h('span', { class: 'text-muted' }, label),
      h('div', { class: 'text-right' },
        h('span', { class: 'text-fg font-semibold block' }, val),
        h('span', { class: 'text-[9px] text-subtle' }, note)
      )
    );
  }

  // Trigger once on view; on desktop (>=1024px & >=640px height), link scroll to step progress
  let scrollCleanup = null;
  if (isDesktopMotionEnabled() && window.innerHeight >= 640 && !isReducedMotion()) {
    container.classList.add('lg:sticky', 'lg:top-24');
    loadMotionCore().then(({ scroll }) => {
      scrollCleanup = scroll((progress) => {
        if (isUserInteracted) return;
        const clamped = Math.max(0, Math.min(0.999, progress));
        const targetStep = Math.min(steps.length - 1, Math.floor(clamped * steps.length));
        trackFill.style.transform = `scaleY(${Math.max(0.1, progress).toFixed(3)})`;
        if (targetStep !== currentStep) {
          currentStep = targetStep;
          renderStep();
        }
      }, { target: container, offset: ['start 0.75', 'end 0.25'] });
    }).catch(() => {});
  } else {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        renderStep();
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    observer.observe(container);
    onCleanup(() => observer.disconnect());
  }
  onCleanup(() => scrollCleanup?.());

  renderStep();
  return container;
}
