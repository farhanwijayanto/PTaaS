// <InteractiveDots> — Cursor-reactive dot field renderer (shared onto the single Hero/Section <canvas>).
// Dots within ~120px of the cursor scale up 1 -> 1.8 and brighten smoothly.
// Desktop only; disabled on touch or reduced motion.

import { DECOR_CONFIG } from './config.js';

export function createInteractiveDotsRenderer({ spacing = 24, radius = DECOR_CONFIG.INTERACTIVE_RADIUS_PX } = {}) {
  let mouseX = -9999;
  let mouseY = -9999;
  let smoothX = -9999;
  let smoothY = -9999;
  let isActive = false;

  function setPointer(x, y) {
    mouseX = x;
    mouseY = y;
    if (!isActive) {
      smoothX = x;
      smoothY = y;
      isActive = true;
    }
  }

  function clearPointer() {
    isActive = false;
    mouseX = -9999;
    mouseY = -9999;
  }

  /**
   * Draws only the boosted dots within `radius` of the cursor on the shared canvas.
   * Base static dots are rendered by CSS radial-gradient (zero DOM nodes, zero idle canvas cost).
   */
  function draw(ctx, width, height, isLightTheme) {
    if (!isActive || mouseX < -1000 || mouseY < -1000) return;

    smoothX += (mouseX - smoothX) * 0.16;
    smoothY += (mouseY - smoothY) * 0.16;

    const rSq = radius * radius;
    const startCol = Math.max(0, Math.floor((smoothX - radius) / spacing));
    const endCol = Math.min(Math.floor(width / spacing), Math.ceil((smoothX + radius) / spacing));
    const startRow = Math.max(0, Math.floor((smoothY - radius) / spacing));
    const endRow = Math.min(Math.floor(height / spacing), Math.ceil((smoothY + radius) / spacing));

    const dotRgb = isLightTheme ? '15, 17, 21' : '242, 244, 247';

    for (let row = startRow; row <= endRow; row++) {
      const y = row * spacing;
      const dy = y - smoothY;
      const dySq = dy * dy;

      for (let col = startCol; col <= endCol; col++) {
        const x = col * spacing;
        const dx = x - smoothX;
        const distSq = dx * dx + dySq;

        if (distSq < rSq) {
          const dist = Math.sqrt(distSq);
          const factor = 1 - dist / radius; // 0 at edge -> 1 at cursor center
          const alpha = (0.01 + factor * 0.06).toFixed(3); // Max +6% opacity

          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${dotRgb}, ${alpha})`;
          ctx.fill();
        }
      }
    }
  }

  return {
    setPointer,
    clearPointer,
    draw
  };
}

export function InteractiveDots(options) {
  return createInteractiveDotsRenderer(options);
}
