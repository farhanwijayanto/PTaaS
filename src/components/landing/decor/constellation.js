import { h } from '../../../lib/dom.js';
import { DECOR_CONFIG, isReducedOrLow, isMobileOrTouch } from './config.js';
import { useInView, usePageVisibility } from './hooks.js';
import { createInteractiveDotsRenderer } from './interactive-dots.js';

/**
 * <Constellation> — Renders BOTH the network constellation (16 nodes on the right half,
 * 1px connecting lines at 8% opacity, 4-8px slow node drift over 20-30s, max 2 traveling
 * emerald packets with destination node pulse) AND the cursor-reactive <InteractiveDots>
 * on ONE DPR-aware <canvas> (DPR capped at 2) with a single rAF loop and adaptive frame quality.
 */
export function Constellation({ hostElement }) {
  const canvas = h('canvas', {
    class: 'absolute inset-0 w-full h-full pointer-events-none select-none',
    'aria-hidden': 'true',
    'data-decor': 'constellation-canvas',
    style: 'pointer-events: none; mask-image: radial-gradient(ellipse 52% 64% at 74% 50%, black 15%, transparent 82%); -webkit-mask-image: radial-gradient(ellipse 52% 64% at 74% 50%, black 15%, transparent 82%);'
  });

  const ctx = canvas.getContext('2d', { alpha: true });
  const interactiveDots = createInteractiveDotsRenderer({
    spacing: 28,
    radius: DECOR_CONFIG.INTERACTIVE_RADIUS_PX
  });

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = null;
  let inView = true;
  let pageVisible = true;

  // Adaptive quality tracking (target 60fps; drop to 30fps or freeze if frame time > 24ms for 2s)
  let qualityMode = '60fps'; // '60fps' | '30fps' | 'frozen'
  let slowFrameAccumMs = 0;
  let frameToggle = false;
  let lastFrameTime = performance.now();

  // Deterministic 9 nodes strictly on the right 55% behind the terminal (rx in [0.56, 0.92], ry in [0.18, 0.82])
  const nodeSeeds = [
    { rx: 0.58, ry: 0.24, ax: 4, ay: 3, px: 0.2, py: 0.9, period: 24 },
    { rx: 0.70, ry: 0.18, ax: 5, ay: 4, px: 1.1, py: 2.0, period: 26 },
    { rx: 0.84, ry: 0.24, ax: 4, ay: 5, px: 2.4, py: 0.5, period: 28 },
    { rx: 0.62, ry: 0.48, ax: 5, ay: 4, px: 0.5, py: 2.5, period: 22 },
    { rx: 0.74, ry: 0.44, ax: 4, ay: 5, px: 2.1, py: 0.3, period: 27 },
    { rx: 0.88, ry: 0.50, ax: 4, ay: 4, px: 1.4, py: 1.9, period: 25 },
    { rx: 0.60, ry: 0.74, ax: 5, ay: 4, px: 1.7, py: 1.4, period: 24 },
    { rx: 0.74, ry: 0.78, ax: 4, ay: 4, px: 0.3, py: 1.1, period: 26 },
    { rx: 0.88, ry: 0.74, ax: 4, ay: 5, px: 2.2, py: 1.6, period: 29 }
  ];

  // Edges connecting nearby nodes
  const edges = [
    [0, 1], [1, 2],
    [0, 3], [1, 4], [2, 5],
    [3, 4], [4, 5],
    [3, 6], [4, 7], [5, 8],
    [6, 7], [7, 8]
  ];

  // Active traveling packets (maximum 2 at a time)
  const packets = [];
  // Active node pulses when a packet reaches its destination
  const pulses = [];
  let lastPacketSpawn = 0;

  function resize() {
    const parent = hostElement || canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderFrame(performance.now(), true);
  }

  function computeNodePositions(timeSec, staticOnly) {
    return nodeSeeds.map((n) => {
      const baseX = n.rx * width;
      const baseY = n.ry * height;
      if (staticOnly) return { x: baseX, y: baseY };
      const omega = (Math.PI * 2) / n.period;
      const dx = Math.sin(timeSec * omega + n.px) * n.ax;
      const dy = Math.cos(timeSec * omega + n.py) * n.ay;
      return { x: baseX + dx, y: baseY + dy };
    });
  }

  function spawnPacketIfNeeded(now) {
    if (packets.length >= DECOR_CONFIG.MAX_PACKETS) return;
    if (now - lastPacketSpawn < 5000) return;
    lastPacketSpawn = now;

    const edgeIdx = Math.floor(Math.random() * edges.length);
    const [a, b] = edges[edgeIdx];
    const forward = Math.random() > 0.5;
    packets.push({
      from: forward ? a : b,
      to: forward ? b : a,
      startTime: now,
      duration: 850 + Math.random() * 320 // 850-1170ms
    });
  }

  function renderFrame(now, staticOnly = false) {
    if (!ctx || width <= 0 || height <= 0) return;
    ctx.clearRect(0, 0, width, height);

    const isLightTheme = document.documentElement.dataset.theme === 'light';
    const lineRgb = isLightTheme ? '15, 17, 21' : '242, 244, 247';
    const accentRgb = '16, 185, 129';

    // Mobile or 'low' decoration level: dot grid + static glow only (no constellation canvas)
    const isMobile = isMobileOrTouch();
    if (isMobile || isReducedOrLow()) return;

    // 1. Interactive cursor dots (desktop only)
    if (!staticOnly) {
      interactiveDots.draw(ctx, width, height, isLightTheme);
    }

    const useStatic = staticOnly || qualityMode === 'frozen';
    const timeSec = now * 0.001;
    const positions = computeNodePositions(timeSec, useStatic);

    // 2. Constellation connecting lines (1px at 5% opacity)
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${lineRgb}, 0.05)`;
    ctx.beginPath();
    for (const [i, j] of edges) {
      const p1 = positions[i];
      const p2 = positions[j];
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // 3. Constellation nodes (1.5px at 15% opacity)
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${lineRgb}, 0.15)`;
      ctx.fill();
    }

    if (useStatic) return;

    // 4. Traveling emerald packets (max 2 at a time)
    spawnPacketIfNeeded(now);
    for (let i = packets.length - 1; i >= 0; i--) {
      const pkt = packets[i];
      const t = (now - pkt.startTime) / pkt.duration;
      if (t >= 1) {
        // Trigger single pulse on destination node
        pulses.push({ nodeIndex: pkt.to, startTime: now, duration: 480 });
        packets.splice(i, 1);
        continue;
      }
      const p1 = positions[pkt.from];
      const p2 = positions[pkt.to];
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;

      // Short glowing tail
      const tailT = Math.max(0, t - 0.12);
      const tx = p1.x + (p2.x - p1.x) * tailT;
      const ty = p1.y + (p2.y - p1.y) * tailT;

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.strokeStyle = `rgba(${accentRgb}, 0.55)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Packet head dot
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${accentRgb})`;
      ctx.fill();
    }

    // 5. Destination node single pulses
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      const t = (now - pulse.startTime) / pulse.duration;
      if (t >= 1) {
        pulses.splice(i, 1);
        continue;
      }
      const pos = positions[pulse.nodeIndex];
      const radius = 2.5 + t * 8;
      const alpha = (1 - t) * 0.65;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${accentRgb}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  function loop(now) {
    rafId = null;
    if (!inView || !pageVisible || isReducedOrLow() || isMobileOrTouch() || qualityMode === 'frozen') {
      renderFrame(now, true);
      return;
    }

    const dt = now - lastFrameTime;
    lastFrameTime = now;

    // Adaptive quality check: if frame time > 24ms (ignoring tab switches > 250ms)
    if (dt > DECOR_CONFIG.FRAME_BUDGET_MS && dt < 250) {
      slowFrameAccumMs += dt;
      if (slowFrameAccumMs > DECOR_CONFIG.ADAPTIVE_WINDOW_MS) {
        qualityMode = qualityMode === '60fps' ? '30fps' : 'frozen';
        slowFrameAccumMs = 0;
      }
    } else if (dt <= DECOR_CONFIG.FRAME_BUDGET_MS) {
      slowFrameAccumMs = Math.max(0, slowFrameAccumMs - dt * 0.5);
    }

    if (qualityMode === '30fps') {
      frameToggle = !frameToggle;
      if (frameToggle) {
        rafId = requestAnimationFrame(loop);
        return;
      }
    }

    renderFrame(now, false);
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId != null) return;
    if (!inView || !pageVisible || isReducedOrLow() || isMobileOrTouch() || qualityMode === 'frozen') {
      renderFrame(performance.now(), true);
      return;
    }
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // Pointer tracking on parent hero section
  const heroSection = hostElement?.closest('section') || hostElement;
  const onPointerMove = (e) => {
    if (isMobileOrTouch() || isReducedOrLow()) return;
    const rect = canvas.getBoundingClientRect();
    interactiveDots.setPointer(e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerLeave = () => {
    interactiveDots.clearPointer();
  };

  if (heroSection) {
    heroSection.addEventListener('mousemove', onPointerMove, { passive: true });
    heroSection.addEventListener('mouseleave', onPointerLeave, { passive: true });
  }

  const onResize = () => resize();
  window.addEventListener('resize', onResize, { passive: true });

  const cleanupView = useInView(hostElement || canvas, (visible) => {
    inView = visible;
    if (visible) startLoop();
    else stopLoop();
  });

  const cleanupPageVis = usePageVisibility((visible) => {
    pageVisible = visible;
    if (visible) startLoop();
    else stopLoop();
  });

  const onDecorLevelChange = () => {
    if (isReducedOrLow()) {
      stopLoop();
      renderFrame(performance.now(), true);
    } else {
      startLoop();
    }
  };
  window.addEventListener('ptaas:decor-level', onDecorLevelChange);

  if (hostElement) {
    hostElement.appendChild(canvas);
  }
  requestAnimationFrame(() => {
    resize();
    startLoop();
  });

  return {
    element: canvas,
    destroy() {
      stopLoop();
      cleanupView();
      cleanupPageVis();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('ptaas:decor-level', onDecorLevelChange);
      if (heroSection) {
        heroSection.removeEventListener('mousemove', onPointerMove);
        heroSection.removeEventListener('mouseleave', onPointerLeave);
      }
    }
  };
}
