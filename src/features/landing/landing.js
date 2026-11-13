import { h, icon } from '../../lib/dom.js';
import { t, getLang } from '../../lib/i18n.js';
import { button } from '../../components/ui/button.js';
import { onCleanup } from '../../lib/router.js';
import { createSiteHeader } from '../../components/layout/header/site-header.js';
import { createBentoGridSection } from '../../components/landing/bento-grid.js';
import { createLifecycleDiagram } from '../../components/landing/diagrams/lifecycle.js';
import { createIsolationVisual } from '../../components/landing/diagrams/isolation.js';
import { createBranchingVisual } from '../../components/landing/diagrams/branching.js';
import { createStepperDemo } from '../../components/landing/diagrams/stepper-demo.js';
import { createDarkContrastBand } from '../../components/landing/dark-band.js';
import { createCodeSnippet } from '../../components/landing/code-snippet.js';
import { createCtaSection } from '../../components/landing/cta-section.js';
import { applyDecorationLevelAttr, resolveDecorationLevel, isReducedOrLow, isMobileOrTouch } from '../../components/landing/decor/config.js';
import { useInView, usePageVisibility } from '../../components/landing/decor/hooks.js';
import { DotGrid } from '../../components/landing/decor/dot-grid.js';
import { CornerBrackets } from '../../components/landing/decor/corner-brackets.js';
import { SectionDivider } from '../../components/landing/decor/section-divider.js';
import { BorderBeam } from '../../components/landing/decor/border-beam.js';
import { FloatingChip } from '../../components/landing/decor/floating-chip.js';
import { ScanLine } from '../../components/landing/decor/scan-line.js';
import {
  DURATIONS,
  EASINGS,
  STAGGER,
  isReducedMotion,
  isDesktopMotionEnabled,
  loadMotionMini,
  loadMotionCore,
  attachReveal,
} from '../../lib/motion.js';
import { initLandingSmoothScroll, scrollToTarget } from '../../lib/scroll-controller.js';
import { initActiveSectionSpy, resetActiveSection } from '../../lib/active-section.js';

export function LandingPage() {
  const currentLang = getLang();
  applyDecorationLevelAttr();

  // Track page visibility to pause decorative loops when tab is hidden
  const cleanupVisibility = usePageVisibility();
  onCleanup(cleanupVisibility);

  // Layer A: Lazy smooth inertial scrolling (desktop fine-pointer only, tied to Motion frame loop)
  onCleanup(initLandingSmoothScroll());

  // Instantiate Rebuilt Clean Header with Grid Layout & Scroll States
  const siteHeader = createSiteHeader();
  onCleanup(() => siteHeader.destroy());

  // Initialize Single-Source-of-Truth Scroll Spy after DOM mount
  const stopActiveSpy = initActiveSectionSpy();
  onCleanup(() => {
    stopActiveSpy?.();
    resetActiveSection();
  });

  // 1. Realistic Terminal Typewriter Mockup (C1.4: fixed height, no scrollbar, preformatted)
  const termBody = h('div', { class: 'terminal-body', 'data-lenis-prevent': 'true' });
  const typedSpan = h('span', { id: 'term-typed', style: 'color: var(--text-primary);' });
  const cursor = h('span', { class: 'terminal-cursor' });
  termBody.append(
    h('span', { style: 'color: var(--accent-text);' }, 'kali@ptaas-lab-01:~$ '),
    typedSpan,
    cursor
  );

  let typeAnim = null;
  let scanTimeout = null;
  const fullCommand = 'nmap -sV 10.10.1.0/24';

  function appendScanOutput() {
    cursor.remove();
    const lines = [
      h('div', { class: 'mt-2', style: 'color: var(--text-muted);' }, 'Starting Nmap 7.94 at 09:30 UTC'),
      h('div', { style: 'color: var(--text-primary);' }, 'Nmap scan report for dvwa-lab.internal (10.10.1.15)'),
      h('div', { style: 'color: var(--text-muted);' }, 'PORT     STATE SERVICE     VERSION'),
      h('div', { style: 'color: var(--accent-text);' }, '21/tcp   open  ftp         vsftpd 2.3.4'),
      h('div', { style: 'color: var(--accent-text);' }, '80/tcp   open  http        Apache 2.4.52 (DVWA 2.0)'),
      h('div', { style: 'color: var(--accent-text);' }, '3306/tcp open  mysql       MySQL 5.7.38'),
      h('div', { class: 'mt-2', style: 'color: var(--text-muted);' }, 'Nmap done: 1 IP scanned in 1.84 seconds')
    ];
    termBody.append(...lines);
    if (!isReducedMotion()) {
      loadMotionMini().then(({ animate }) => {
        lines.forEach((line, idx) => {
          animate(line, { opacity: [0.001, 1], y: [4, 0] }, { duration: DURATIONS.fast, delay: idx * 0.04, ease: EASINGS.expoOut });
        });
      }).catch(() => {});
    }
  }

  if (isReducedOrLow()) {
    typedSpan.textContent = fullCommand;
    appendScanOutput();
  } else {
    loadMotionMini().then(({ animate }) => {
      typeAnim = animate(0, fullCommand.length, {
        duration: 0.9,
        delay: 0.25,
        ease: EASINGS.linear,
        onUpdate: (v) => {
          typedSpan.textContent = fullCommand.slice(0, Math.round(v));
        },
        onComplete: () => {
          scanTimeout = setTimeout(appendScanOutput, 180);
        }
      });
    }).catch(() => {
      typedSpan.textContent = fullCommand;
      appendScanOutput();
    });
  }
  onCleanup(() => {
    typeAnim?.stop?.();
    clearTimeout(scanTimeout);
  });

  // Hero Background Layers (Max 4 decorative layers total in Hero: dot-grid, ambient-blob, constellation, terminal chips)
  const heroBgLayers = h('div', {
    class: 'absolute inset-0 overflow-hidden pointer-events-none select-none',
    'aria-hidden': 'true',
    'data-decor': 'hero-bg',
    style: 'z-index: var(--z-bg); pointer-events: none;'
  });

  // Layer 1: Calm radial masked dot grid (1px dots, 28px spacing)
  const heroDotGrid = DotGrid({ variant: 'hero' });

  // Layer 2: Single soft accent glow behind terminal (600px, blur 120px, 30s 20px drift)
  const ambientBlobWrap = h('div', {
    class: 'absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none',
    'aria-hidden': 'true',
    'data-decor': 'ambient-blob-parallax',
    style: 'pointer-events: none;'
  });
  const ambientBlob = h('div', {
    class: 'hero-ambient-blob w-full h-full rounded-full pointer-events-none',
    'aria-hidden': 'true',
    'data-decor': 'ambient-blob',
    'data-decor-anim': 'blob-drift',
    style: 'pointer-events: none;'
  });
  ambientBlobWrap.appendChild(ambientBlob);

  // Layer 3: Constellation + interactive dots canvas (clipped to right 55% on desktop)
  const canvasHost = h('div', {
    id: 'hero-canvas-host',
    class: 'absolute inset-y-0 right-0 w-full lg:w-[55%] pointer-events-none',
    'aria-hidden': 'true',
    'data-decor': 'canvas-host',
    style: 'pointer-events: none;'
  });

  if (resolveDecorationLevel() !== 'off') {
    heroBgLayers.append(heroDotGrid, ambientBlobWrap, canvasHost);
  }

  // Lazy-load the <Constellation> + <InteractiveDots> canvas module after first paint
  let constellationInstance = null;
  let cancelledMount = false;
  if (resolveDecorationLevel() === 'balanced') {
    const scheduleLazy = window.requestIdleCallback || ((cb) => requestAnimationFrame(() => setTimeout(cb, 16)));
    scheduleLazy(() => {
      if (cancelledMount) return;
      import('../../components/landing/decor/constellation.js')
        .then(({ Constellation }) => {
          if (cancelledMount) return;
          constellationInstance = Constellation({ hostElement: canvasHost });
        })
        .catch(() => {});
    });
  }
  onCleanup(() => {
    cancelledMount = true;
    constellationInstance?.destroy();
  });

  // Layer 4: 2 Floating Status Chips positioned cleanly OUTSIDE terminal bounds (>= 16px clearance)
  const chipReady = FloatingChip({
    iconName: 'zap',
    text: 'VM ready in 18.4s',
    positionStyle: 'top: -48px; right: 12px;',
    duration: '6.8s',
    delay: '0s',
    revealDelayMs: 420
  });
  const chipEgress = FloatingChip({
    iconName: 'shield-check',
    text: 'Egress blocked 100%',
    positionStyle: 'bottom: -48px; left: 12px;',
    duration: '7.4s',
    delay: '0.7s',
    revealDelayMs: 680
  });
  onCleanup(() => {
    chipReady.destroy();
    chipEgress.destroy();
  });

  // Border beam on main terminal card
  const termBorderBeam = BorderBeam();

  // Main Terminal Window (always dark surface scope)
  const terminalCard = h('div', {
    class: 'terminal-window relative z-10',
    'data-surface': 'dark',
    onMouseEnter: () => termBorderBeam.triggerSweep()
  },
    termBorderBeam.element,
    ScanLine(),
    // Window top bar (ink-800 + ink-600 hairline)
    h('div', { class: 'terminal-titlebar flex items-center justify-between px-4 py-2.5 select-none' },
      h('div', { class: 'flex items-center gap-2', 'aria-hidden': 'true' },
        h('span', { class: 'h-2.5 w-2.5 rounded-full', style: 'background-color: var(--ink-500);' }),
        h('span', { class: 'h-2.5 w-2.5 rounded-full', style: 'background-color: var(--ink-500);' }),
        h('span', { class: 'h-2.5 w-2.5 rounded-full', style: 'background-color: var(--ink-500);' }),
        h('span', { class: 'ml-2 font-mono text-xs', style: 'color: var(--text-secondary);' }, t('landing.terminal.title'))
      ),
      h('span', {
        class: 'rounded px-2 py-0.5 font-mono text-[10px] font-medium',
        style: 'background-color: var(--accent-bg); border: 1px solid var(--accent-border); color: var(--accent-text);'
      }, 'TLS 1.3 / WSS')
    ),
    termBody
  );

  // Right Terminal Composition (aligned to container right edge, single faint stacked card behind)
  const terminalStack = h('div', {
    class: 'relative py-10 min-w-0'
  },
    h('div', { class: 'relative z-10' },
      h('div', { class: 'terminal-stack-back', 'aria-hidden': 'true', 'data-surface': 'dark' }),
      CornerBrackets({ size: 12, offset: -5, tone: 'mixed' }),
      terminalCard,
      chipReady.element,
      chipEgress.element
    )
  );

  // Desktop-only subtle terminal tilt (max 2 deg) & spotlight using Motion frame/animate
  if (isDesktopMotionEnabled()) {
    terminalCard.style.transformStyle = 'preserve-3d';
    let tiltTargetX = 0;
    let tiltTargetY = 0;
    let tiltCurrentX = 0;
    let tiltCurrentY = 0;
    let tiltFrameStop = null;
    let isHoveringTerminal = false;

    const startTiltLoop = () => {
      if (tiltFrameStop) return;
      loadMotionCore().then(({ frame, cancelFrame }) => {
        if (cancelledMount) return;
        const tick = () => {
          tiltCurrentX += (tiltTargetX - tiltCurrentX) * 0.14;
          tiltCurrentY += (tiltTargetY - tiltCurrentY) * 0.14;
          terminalCard.style.transform = `perspective(900px) rotateX(${tiltCurrentX.toFixed(2)}deg) rotateY(${tiltCurrentY.toFixed(2)}deg)`;
          if (!isHoveringTerminal && Math.abs(tiltCurrentX) < 0.02 && Math.abs(tiltCurrentY) < 0.02) {
            terminalCard.style.transform = '';
            tiltFrameStop?.();
            tiltFrameStop = null;
          }
        };
        const task = frame.update(tick, true);
        tiltFrameStop = () => cancelFrame(task);
      }).catch(() => {});
    };

    terminalCard.addEventListener('pointermove', (e) => {
      const rect = terminalCard.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      tiltTargetY = Math.max(-2, Math.min(2, nx * 2));
      tiltTargetX = Math.max(-2, Math.min(2, -ny * 2));
      isHoveringTerminal = true;
      startTiltLoop();
    }, { passive: true });

    terminalCard.addEventListener('pointerleave', () => {
      isHoveringTerminal = false;
      tiltTargetX = 0;
      tiltTargetY = 0;
    }, { passive: true });

    onCleanup(() => tiltFrameStop?.());
  }

  // 2. Hero Section (96-120px vertical padding, 24px gap between text blocks)
  const heroBadge = h('div', { class: 'space-y-4 min-w-0' },
    h('div', { class: 'h-[2px] w-12 rounded-full', style: 'background-color: var(--accent);', 'aria-hidden': 'true' }),
    h('div', {
      class: 'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs max-w-full',
      style: 'border: 1px solid var(--border-default); background-color: var(--surface-1); color: var(--text-secondary);'
    },
      h('span', { class: 'h-1.5 w-1.5 rounded-full shrink-0', style: 'background-color: var(--accent);' }),
      h('span', { class: 'truncate' }, currentLang === 'id' ? 'Arsitektur IaaS · Sesuai NIST SP 800-145' : 'IaaS Architecture · NIST SP 800-145 Compliant')
    )
  );

  const heroHeadline = h('h1', { class: 't-hero' },
    h('span', { class: 'block overflow-hidden' },
      h('span', { class: 'hero-line block font-semibold', style: 'color: var(--text-primary);' }, t('landing.hero.line1'))
    ),
    h('span', { class: 'block overflow-hidden' },
      h('span', { class: 'hero-line block', style: 'color: var(--text-muted);' }, t('landing.hero.line2'))
    )
  );

  const heroSub = h('p', { class: 'max-w-xl text-base md:text-lg leading-relaxed t-body', style: 'color: var(--text-secondary);' }, t('landing.hero.desc'));

  const heroSnippet = createCodeSnippet({ command: 'ssh student@lab.example.edu -p 2222' });

  // Hero CTAs (always opacity 1)
  const heroCtaRow = h('div', { class: 'hero-cta-row flex flex-wrap items-center gap-4 pt-1' },
    button({
      label: t('landing.cta.signin'),
      variant: 'primary',
      size: 'md',
      href: '/login',
      icon: 'arrow-right'
    }),
    button({
      label: t('landing.cta.how'),
      variant: 'secondary',
      size: 'md',
      onClick: () => siteHeader.scrollToSection('stepper')
    })
  );

  const heroNotice = h('div', { class: 'pt-1 flex items-start gap-2 text-sm', style: 'color: var(--text-muted);' },
    icon('lock', 'w-4 h-4 mt-0.5 shrink-0 text-accent-text'),
    h('p', { class: 'leading-relaxed' }, t('landing.notice'))
  );

  const heroTextCol = h('div', { class: 'space-y-6 min-w-0' },
    heroBadge,
    heroHeadline,
    heroSub,
    heroSnippet,
    heroCtaRow,
    heroNotice
  );

  const hero = h('section', {
    id: 'hero-section',
    class: 'relative overflow-hidden py-24 lg:py-[112px]',
    'data-in-view': 'true'
  },
    heroBgLayers,
    h('div', { class: 'landing-container relative z-10' },
      h('div', { class: 'grid gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:items-center' },
        heroTextCol,
        terminalStack
      )
    )
  );

  // Hero entrance sequence (LCP-safe: runs after first paint, animate transform + opacity only)
  if (!isReducedMotion()) {
    const heroAnims = [];
    requestAnimationFrame(() => {
      if (cancelledMount) return;
      loadMotionMini().then(({ animate }) => {
        if (cancelledMount) return;
        const lines = heroHeadline.querySelectorAll('.hero-line');
        const ease = EASINGS.expoOut;
        const enterBlocks = [heroBadge, heroSub, heroSnippet, heroNotice];
        enterBlocks.forEach((el, idx) => {
          heroAnims.push(animate(el, { y: [12, 0], opacity: [0.001, 1] }, { duration: 0.5, delay: idx * 0.07, ease }));
        });
        lines.forEach((line, idx) => {
          heroAnims.push(animate(line, { y: ['100%', '0%'] }, { duration: 0.55, delay: 0.05 + idx * 0.07, ease }));
        });
        heroAnims.push(animate(terminalStack, { x: [24, 0], opacity: [0.001, 1] }, { duration: 0.6, delay: 0.14, ease }));
      }).catch(() => {});
    });
    onCleanup(() => heroAnims.forEach((a) => a?.stop?.()));
  }

  // Track Hero visibility to pause Hero continuous loops when scrolled off-screen
  const cleanupHeroView = useInView(hero);
  onCleanup(cleanupHeroView);

  // 3. Metrics Strip (Clean 4-column strip: big number + one-line label, hairline dividers, 1px top accent line)
  const metricCols = [
    metricCol({ finalVal: t('landing.metrics.bootVal'), label: t('landing.metrics.bootLabel'), extra: 'pt-0 md:pt-0 pb-4 md:pb-0 md:pr-6' }),
    metricCol({ finalVal: t('landing.metrics.connectVal'), label: t('landing.metrics.connectLabel'), extra: 'pt-4 md:pt-0 pb-4 md:pb-0 md:px-6' }),
    metricCol({ finalVal: t('landing.metrics.leaksVal'), label: t('landing.metrics.leaksLabel'), extra: 'pt-4 md:pt-0 pb-4 md:pb-0 md:px-6' }),
    metricCol({ finalVal: t('landing.metrics.egressVal'), label: t('landing.metrics.egressLabel'), extra: 'pt-4 md:pt-0 pb-0 md:pb-0 md:pl-6' })
  ];

  const metricsAccentLine = h('div', {
    class: 'metrics-accent-line',
    'aria-hidden': 'true',
    style: isReducedMotion() ? '' : 'transform: scaleX(0); transform-origin: left center;'
  });

  const metrics = h('section', {
    class: 'metrics-strip relative border-y overflow-hidden',
    style: 'border-color: var(--border-default); background-color: var(--surface-2);',
    'data-in-view': 'false'
  },
    metricsAccentLine,
    h('div', { class: 'landing-container py-10 relative z-10' },
      h('div', { class: 'grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x', style: '--tw-divide-opacity: 1; border-color: var(--border-default);' },
        metricCols
      )
    )
  );

  const metricAnims = [];
  const cleanupMetricsView = useInView(metrics, (visible) => {
    if (!visible) return;
    metrics.setAttribute('data-in-view', 'true');
    if (isReducedMotion()) return;
    loadMotionMini().then(({ animate }) => {
      if (cancelledMount) return;
      metricAnims.push(animate(metricsAccentLine, { scaleX: [0, 1] }, { duration: 0.7, ease: EASINGS.expoOut }));
      const numEls = metrics.querySelectorAll('[data-metric-final]');
      numEls.forEach((el) => {
        const raw = el.getAttribute('data-metric-final') || '';
        const match = raw.match(/^(.*?)(\d+(?:\.\d+)?)(.*)$/);
        if (!match) return;
        const [, prefix, numStr, suffix] = match;
        const target = parseFloat(numStr);
        const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
        metricAnims.push(animate(0, target, {
          duration: 1.2,
          ease: 'easeOut',
          onUpdate: (latest) => {
            el.textContent = `${prefix}${decimals > 0 ? latest.toFixed(decimals) : Math.round(latest)}${suffix}`;
          },
          onComplete: () => {
            el.textContent = raw;
          }
        }));
      });
    }).catch(() => {});
  }, { once: true });
  onCleanup(() => {
    cleanupMetricsView?.();
    metricAnims.forEach((a) => a?.stop?.());
  });

  function metricCol({ finalVal, label, extra = '' }) {
    return h('div', { class: `flex flex-col justify-center space-y-1 ${extra}`, style: 'border-color: var(--border-default);' },
      h('div', {
        class: 'text-3xl sm:text-4xl font-bold tracking-tight font-sans num tabular-nums',
        style: 'color: var(--text-primary);',
        'data-metric-final': finalVal
      }, finalVal),
      h('div', { class: 'text-sm font-medium font-sans', style: 'color: var(--text-muted);' }, label)
    );
  }

  // Simple hairline divider with Motion scaleX reveal
  const dividers = [];
  const hairline = () => {
    const div = SectionDivider();
    dividers.push(div);
    return div;
  };

  // 4. Section B1: Bento Grid
  const bentoSection = createBentoGridSection();

  // 5. Section B2: Lifecycle Diagram
  const lifecycleSection = h('section', { id: 'lifecycle', class: 'landing-container py-16' },
    createLifecycleDiagram()
  );

  // 6. Section B3: Network Isolation Visual
  const isolationSection = h('section', { id: 'isolation', class: 'landing-container py-16' },
    createIsolationVisual()
  );

  // 7. Section B4: Branching Visual
  const branchingSection = h('section', { id: 'branching', class: 'landing-container py-16' },
    createBranchingVisual()
  );

  // 8. Section B5: Interactive Stepper Demo
  const stepperSection = h('section', { id: 'stepper', class: 'landing-container py-16' },
    createStepperDemo()
  );

  // Clean Light -> Dark transition zone
  const lightToDarkTransition = h('div', {
    class: 'theme-transition-zone select-none',
    'aria-hidden': 'true',
    'data-decor': 'theme-transition-zone',
    style: 'pointer-events: none;'
  });

  // 9. Section B6: Dark Contrast Band
  const darkBand = createDarkContrastBand();

  // 10. FAQ Section
  const faqs = [
    { q: 'landing.faq.q1', a: 'landing.faq.a1' },
    { q: 'landing.faq.q2', a: 'landing.faq.a2' },
    { q: 'landing.faq.q3', a: 'landing.faq.a3' }
  ];

  const faq = h('section', {
    class: 'border-t',
    style: 'border-color: var(--border-default); background-color: var(--surface-2);',
    'data-in-view': 'false'
  },
    h('div', { class: 'landing-container py-20 md:py-24 max-w-3xl' },
      h('div', { class: 'text-center space-y-2 mb-10' },
        h('span', { class: 'text-xs font-mono tracking-[0.06em] uppercase font-semibold block', style: 'color: var(--accent-text);' },
          'FAQ',
          h('span', { class: 'eyebrow-cursor', 'aria-hidden': 'true', 'data-decor': 'eyebrow-cursor', 'data-decor-anim': 'eyebrow-blink' })
        ),
        h('h2', { class: 't-display', style: 'color: var(--text-primary);' }, t('landing.faq.title'))
      ),
      h('div', { class: 'divide-y', style: 'border-color: var(--border-default);' },
        faqs.map((f) =>
          h('div', { class: 'py-5 space-y-1.5', style: 'border-color: var(--border-default);' },
            h('h3', { class: 'text-base font-semibold', style: 'color: var(--text-primary);' }, t(f.q)),
            h('p', { class: 'text-sm leading-relaxed t-body', style: 'color: var(--text-secondary);' }, t(f.a))
          )
        )
      )
    )
  );
  onCleanup(useInView(faq));

  // 11. Final CTA Section
  const cta = createCtaSection();

  // 12. Footer (no colliding wordmark, crisp accessible links)
  const footer = h('footer', {
    class: 'relative border-t py-10 overflow-hidden',
    style: 'border-color: var(--border-default); background-color: var(--bg);'
  },
    h('div', { class: 'landing-container relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs', style: 'color: var(--text-muted);' },
      h('div', { class: 'flex flex-wrap items-center gap-3' },
        h('span', { class: 'font-semibold', style: 'color: var(--text-primary);' }, 'PTaaS Cloud Platform'),
        h('span', {}, '· Versi 1.0 IaaS'),
        h('span', { class: 'hidden md:inline' }, '· NIST SP 800-145 Compliant'),
        h('span', {
          class: 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px]',
          style: 'border: 1px solid var(--border-default); background-color: var(--surface-1); color: var(--text-secondary);'
        },
          h('span', { class: 'h-1.5 w-1.5 rounded-full', style: 'background-color: var(--accent);' }),
          'All systems operational'
        )
      ),
      h('div', { class: 'flex items-center gap-6 font-mono text-xs' },
        h('a', { href: '/compliance', 'data-link': true, class: 'hover:underline transition-colors', style: 'color: var(--text-secondary);' }, t('landing.nav.docs')),
        h('a', { href: '/login', 'data-link': true, class: 'font-semibold hover:underline transition-colors', style: 'color: var(--accent-text);' }, t('landing.cta.signin'))
      )
    )
  );

  // Back-to-top button (appears after 600px scroll with small SVG progress ring)
  const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  progressCircle.setAttribute('cx', '20');
  progressCircle.setAttribute('cy', '20');
  progressCircle.setAttribute('r', '17');
  progressCircle.setAttribute('fill', 'none');
  progressCircle.setAttribute('stroke', 'var(--accent-text)');
  progressCircle.setAttribute('stroke-width', '2');
  progressCircle.setAttribute('stroke-dasharray', '106.8');
  progressCircle.setAttribute('stroke-dashoffset', '106.8');
  progressCircle.setAttribute('stroke-linecap', 'round');

  const progressSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  progressSvg.setAttribute('viewBox', '0 0 40 40');
  progressSvg.setAttribute('class', 'absolute inset-0 w-full h-full -rotate-90 pointer-events-none');
  progressSvg.setAttribute('aria-hidden', 'true');
  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('cx', '20');
  bgCircle.setAttribute('cy', '20');
  bgCircle.setAttribute('r', '17');
  bgCircle.setAttribute('fill', 'none');
  bgCircle.setAttribute('stroke', 'var(--border-strong)');
  bgCircle.setAttribute('stroke-width', '1.5');
  progressSvg.append(bgCircle, progressCircle);

  const backToTopBtn = h('button', {
    type: 'button',
    'aria-label': 'Back to top',
    title: 'Back to top',
    class: 'fixed bottom-6 right-6 z-40 h-11 w-11 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 opacity-0 pointer-events-none translate-y-2 cursor-pointer',
    style: 'background-color: var(--surface-1); border: 1px solid var(--border-default); color: var(--text-primary);',
    onClick: () => scrollToTarget('top')
  },
    progressSvg,
    icon('arrow-up', 'w-4 h-4 relative z-10')
  );

  // Layer B: Section reveals, Hero exit parallax, Light->Dark crossfade, and Back-to-Top via Motion
  const layerBCleanups = [];
  if (!isReducedMotion()) {
    layerBCleanups.push(
      attachReveal(bentoSection, { preset: 'fadeUp' }),
      attachReveal(lifecycleSection, { preset: 'fadeUp' }),
      attachReveal(isolationSection, { preset: 'fadeUp' }),
      attachReveal(branchingSection, { preset: 'fadeUp' }),
      attachReveal(stepperSection, { preset: 'fadeUp' }),
      attachReveal(faq, { preset: 'fadeUp' }),
      attachReveal(cta, { preset: 'fadeUp' })
    );
  }

  // Light -> Dark transition crossfade overlay
  const transitionDarkWash = h('div', {
    class: 'absolute inset-0 pointer-events-none',
    'aria-hidden': 'true',
    style: 'background: linear-gradient(to bottom, transparent, var(--ink-850)); opacity: 0;'
  });
  lightToDarkTransition.style.position = 'relative';
  lightToDarkTransition.appendChild(transitionDarkWash);

  const scheduleCore = window.requestIdleCallback || ((cb) => requestAnimationFrame(() => setTimeout(cb, 32)));
  scheduleCore(() => {
    if (cancelledMount) return;
    loadMotionCore().then(({ animate, scroll, inView }) => {
      if (cancelledMount) return;

      // Back-to-top scroll progress & visibility
      let backToTopVisible = false;
      layerBCleanups.push(scroll((progress) => {
        const dashOffset = 106.8 * (1 - progress);
        progressCircle.setAttribute('stroke-dashoffset', dashOffset.toFixed(1));
        const shouldShow = window.scrollY > 600;
        if (shouldShow !== backToTopVisible) {
          backToTopVisible = shouldShow;
          if (shouldShow) {
            backToTopBtn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
            backToTopBtn.classList.add('opacity-100', 'translate-y-0');
          } else {
            backToTopBtn.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            backToTopBtn.classList.remove('opacity-100', 'translate-y-0');
          }
        }
      }));

      if (isReducedMotion()) return;

      // Section divider scaleX reveals
      dividers.forEach((div) => {
        div.style.transformOrigin = 'left center';
        div.style.transform = 'scaleX(0)';
        layerBCleanups.push(inView(div, () => {
          animate(div, { scaleX: [0, 1] }, { duration: 0.65, ease: EASINGS.expoOut });
        }, { amount: 0.2 }));
      });

      // Light -> Dark transition crossfade linked to scroll
      layerBCleanups.push(scroll(
        animate(transitionDarkWash, { opacity: [0, 1] }, { ease: 'linear' }),
        { target: lightToDarkTransition, offset: ['start end', 'end start'] }
      ));

      // Desktop-only Hero -> Metrics exit parallax (keep heroCtaRow opacity 1)
      if (isDesktopMotionEnabled()) {
        layerBCleanups.push(scroll(
          animate(heroTextCol, { y: [0, -40], scale: [1, 0.98] }, { ease: 'linear' }),
          { target: hero, offset: ['start start', 'end start'] }
        ));
        layerBCleanups.push(scroll(
          animate(terminalStack, { y: [0, -64] }, { ease: 'linear' }),
          { target: hero, offset: ['start start', 'end start'] }
        ));
        layerBCleanups.push(scroll(
          animate(heroBgLayers, { y: [0, 80] }, { ease: 'linear' }),
          { target: hero, offset: ['start start', 'end start'] }
        ));
      }
    }).catch(() => {});
  });

  onCleanup(() => {
    layerBCleanups.forEach((fn) => typeof fn === 'function' && fn());
  });

  return h('div', {
    class: 'landing-page min-h-screen relative overflow-x-clip',
    style: 'background-color: var(--bg); color: var(--text-primary);'
  },
    siteHeader.element,
    siteHeader.mobileSheet,
    hero,
    metrics,
    bentoSection,
    hairline(),
    lifecycleSection,
    hairline(),
    isolationSection,
    hairline(),
    branchingSection,
    hairline(),
    stepperSection,
    lightToDarkTransition,
    darkBand,
    faq,
    cta,
    footer,
    backToTopBtn
  );
}
