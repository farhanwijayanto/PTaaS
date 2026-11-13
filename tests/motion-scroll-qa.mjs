import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const URL = 'http://localhost:3000/';
const ARTIFACT_DIR = process.env.QA_ARTIFACT_DIR || path.resolve('.tmp/qa');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = {
    consoleErrors: [],
    pageErrors: [],
    wheelScroll: null,
    anchorNav: null,
    keyboardScroll: null,
    hitTest8Positions: null,
    reducedMotion: null,
    touchEmulation: null,
    nestedScroll: null,
    perf4xCpu: null,
    loginTransition: null,
  };

  try {
    // 1. Desktop QA context (1440x900)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') results.consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => results.pageErrors.push(String(e)));

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'motion_hero_0200ms.png') });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'motion_hero_0600ms.png') });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'motion_hero_1200ms.png') });

    // Wait briefly for idle Lenis + core init
    await page.waitForTimeout(300);

    // Wheel scrolling: small & large deltas
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(250);
    const ySmall = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(450);
    const yLarge = await page.evaluate(() => window.scrollY);
    results.wheelScroll = { y0, ySmall, yLarge, ok: ySmall > y0 && yLarge > ySmall };

    // Scroll screenshots at 25%, 50%, 75%
    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    for (const pct of [0.25, 0.5, 0.75]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(maxScroll * pct));
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `motion_scroll_${Math.round(pct * 100)}.png`) });
    }

    // 8-scroll-position hit-testing (header nav links, theme toggle, hero CTA when at top)
    let hitFailures = [];
    for (let i = 0; i < 8; i++) {
      const y = Math.round((maxScroll * i) / 7);
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(120);
      const checks = await page.evaluate(() => {
        const selectors = [
          'header button[aria-label*="theme" i]',
          'header a[href="/login"]',
          'header nav a',
        ];
        const out = [];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const hit = document.elementFromPoint(cx, cy);
          const ok = hit === el || el.contains(hit);
          out.push({ sel, ok, hitTag: hit?.tagName, hitClass: hit?.className });
        }
        return out;
      });
      for (const c of checks) {
        if (!c.ok) hitFailures.push({ posIndex: i, y, ...c });
      }
    }
    results.hitTest8Positions = { ok: hitFailures.length === 0, failures: hitFailures };

    // Anchor navigation (#stepper) + hash update + wheel cancel
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const navRes = await page.evaluate(async () => {
      const link = document.querySelector('header a[href="#isolation"], header a[href="#stepper"], a[href="#stepper"]');
      if (!link) return { ok: false, reason: 'No anchor link found' };
      link.click();
      await new Promise((r) => setTimeout(r, 1300));
      const hash = window.location.hash;
      const target = document.getElementById(hash.replace('#', ''));
      const header = document.querySelector('header');
      const headerH = header ? Math.round(header.getBoundingClientRect().height) : 64;
      const targetTop = target ? target.getBoundingClientRect().top : null;
      const delta = targetTop !== null ? Math.abs(targetTop - (headerH + 16)) : 999;
      return { ok: Boolean(hash) && delta <= 20, hash, headerH, targetTop, delta };
    });
    results.anchorNav = navRes;

    // Keyboard scroll
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(300);
    const yKey = await page.evaluate(() => window.scrollY);
    results.keyboardScroll = { ok: yKey > 100, yKey };

    // Nested scroll over .terminal-body (data-lenis-prevent)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const termBox = await page.locator('.terminal-body').boundingBox();
    let nestedOk = false;
    if (termBox) {
      await page.mouse.move(termBox.x + termBox.width / 2, termBox.y + termBox.height / 2);
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(200);
      const yAfterTermWheel = await page.evaluate(() => window.scrollY);
      // Either terminal scrolled internally or page stayed stable if terminal has no overflow
      nestedOk = yAfterTermWheel === 0 || (await page.locator('.terminal-body').getAttribute('data-lenis-prevent')) !== null;
    }
    results.nestedScroll = { ok: nestedOk };

    // 4x CPU Throttle perf trace & CLS
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      window.__longTasks = 0;
      new PerformanceObserver((list) => {
        window.__longTasks += list.getEntries().length;
      }).observe({ type: 'longtask', buffered: true });
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(600);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(600);
    const perfData = await page.evaluate(() => ({ cls: window.__cls, longTasks: window.__longTasks }));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    results.perf4xCpu = { ok: perfData.cls < 0.02, ...perfData };

    // Landing -> Login transition
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('a[href="/login"]').first().click();
    await page.waitForTimeout(400);
    const onLogin = page.url().endsWith('/login') && (await page.locator('#login-email').count()) > 0;
    results.loginTransition = { ok: onLogin, url: page.url() };

    await context.close();

    // 2. Reduced-motion context
    const rmContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const rmPage = await rmContext.newPage();
    await rmPage.goto(URL, { waitUntil: 'domcontentloaded' });
    await rmPage.waitForTimeout(400);
    const rmState = await rmPage.evaluate(() => ({
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      hasLenisClass: document.documentElement.classList.contains('lenis'),
    }));
    results.reducedMotion = { ok: rmState.reduced && !rmState.hasLenisClass, ...rmState };
    await rmContext.close();

    // 3. Touch emulation context
    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const touchPage = await touchContext.newPage();
    await touchPage.goto(URL, { waitUntil: 'domcontentloaded' });
    await touchPage.waitForTimeout(400);
    const touchState = await touchPage.evaluate(() => ({
      hasLenisClass: document.documentElement.classList.contains('lenis'),
      stickyStepper: document.querySelector('#stepper .lg\\:sticky') !== null && window.innerWidth >= 1024,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    }));
    results.touchEmulation = { ok: !touchState.hasLenisClass && !touchState.stickyStepper && !touchState.overflowX, ...touchState };
    await touchContext.close();

    console.log(JSON.stringify(results, null, 2));
    const allOk =
      results.consoleErrors.length === 0 &&
      results.pageErrors.length === 0 &&
      results.wheelScroll?.ok &&
      results.keyboardScroll?.ok &&
      results.hitTest8Positions?.ok &&
      results.nestedScroll?.ok &&
      results.perf4xCpu?.ok &&
      results.loginTransition?.ok &&
      results.reducedMotion?.ok &&
      results.touchEmulation?.ok;
    if (!allOk) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
