import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const ARTIFACT_DIR = process.env.QA_ARTIFACT_DIR || path.resolve('.tmp/qa');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const EXPECTED_MAP = {
  features: 'Features',
  lifecycle: 'Platform',
  isolation: 'Platform',
  branching: 'Platform',
  stepper: 'How it works',
  security: 'Security',
  compliance: 'Compliance',
};

async function checkSection(page, id) {
  const expectedLabel = EXPECTED_MAP[id];
  const scrollTarget = await page.evaluate((sid) => {
    const el = document.getElementById(sid);
    const h = document.querySelector('header')?.getBoundingClientRect().height || 64;
    return Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - h + 50));
  }, id);

  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'auto' }), scrollTarget);
  await page.waitForTimeout(700);

  return page.evaluate(({ sid, expectedLabel }) => {
    const currents = Array.from(document.querySelectorAll('header nav [aria-current="location"]'));
    const pill = document.querySelector('header .nav-pill-indicator');
    const pillRect = pill?.getBoundingClientRect();
    const linkRect = currents[0]?.getBoundingClientRect();
    const dx = pillRect && linkRect ? Math.abs(pillRect.left - linkRect.left) : 999;
    const dw = pillRect && linkRect ? Math.abs(pillRect.width - linkRect.width) : 999;
    const label = currents[0]?.textContent?.trim() || null;
    return {
      id: sid,
      count: currents.length,
      label,
      expectedLabel,
      dx: Math.round(dx * 10) / 10,
      dw: Math.round(dw * 10) / 10,
      pillOpacity: pill ? parseFloat(getComputedStyle(pill).opacity) : 0,
      ok: currents.length === 1 && label === expectedLabel && dx <= 2.5 && dw <= 2.5,
    };
  }, { sid: id, expectedLabel });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const report = {
    consoleErrors: [],
    pageErrors: [],
    heroAtTop: null,
    topToBottom: [],
    bottomToTop: [],
    randomOrder: [],
    bottomRule: null,
    fastScroll: null,
    clickNav: [],
    directHashes: [],
    resizeLangTheme: null,
    reducedMotion: null,
    mobileMenu: null,
    hitTest: null,
  };

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => report.pageErrors.push(String(e)));

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // 1. Hero at scrollY=0: no active item, pill hidden
    report.heroAtTop = await page.evaluate(() => {
      const currents = document.querySelectorAll('header nav [aria-current="location"]').length;
      const pillOp = parseFloat(getComputedStyle(document.querySelector('header .nav-pill-indicator')).opacity);
      return { currents, pillOp, ok: currents === 0 && pillOp === 0 };
    });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'spy_light_hero.png'), clip: { x: 0, y: 0, width: 1440, height: 140 } });

    // 2. Top-to-bottom, bottom-to-top, random
    const ids = Object.keys(EXPECTED_MAP);
    for (const id of ids) {
      const res = await checkSection(page, id);
      report.topToBottom.push(res);
      if (['features', 'isolation', 'stepper', 'security', 'compliance'].includes(id)) {
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `spy_light_${id}.png`), clip: { x: 0, y: 0, width: 1440, height: 140 } });
      }
    }
    for (const id of [...ids].reverse()) {
      report.bottomToTop.push(await checkSection(page, id));
    }
    for (const id of ['security', 'features', 'branching', 'compliance', 'lifecycle', 'stepper', 'isolation']) {
      report.randomOrder.push(await checkSection(page, id));
    }

    // 3. Bottom rule
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(350);
    report.bottomRule = await page.evaluate(() => {
      const cur = document.querySelector('header nav [aria-current="location"]')?.textContent?.trim();
      return { cur, ok: cur === 'Compliance' };
    });

    // 4. Fast scroll (5x 2000px wheel down, then up)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(550);
    const afterDown = await page.evaluate(() => document.querySelector('header nav [aria-current="location"]')?.textContent?.trim());
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -2000);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(550);
    const afterUp = await page.evaluate(() => document.querySelector('header nav [aria-current="location"]')?.textContent?.trim() || null);
    report.fastScroll = { afterDown, afterUp, ok: Boolean(afterDown) && afterUp === null };

    // 5. Click nav items + lock release
    for (const href of ['#features', '#stepper', '#security']) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.locator(`header nav a[href="${href}"]`).click();
      await page.waitForTimeout(1300);
      const res = await page.evaluate((h) => {
        const id = h.slice(1);
        const el = document.getElementById(id);
        const headerH = Math.round(document.querySelector('header').getBoundingClientRect().height);
        const top = el.getBoundingClientRect().top;
        const cur = document.querySelector('header nav [aria-current="location"]')?.getAttribute('href');
        return { href: h, cur, top: Math.round(top), expected: headerH + 16, ok: cur === h && Math.abs(top - (headerH + 16)) <= 4 };
      }, href);
      report.clickNav.push(res);
    }

    // 6. Direct hash loads & back/forward
    for (const hash of ['#security', '#how-it-works', '#compliance']) {
      await page.goto(BASE + '/' + hash, { waitUntil: 'networkidle' });
      await page.waitForTimeout(550);
      const cur = await page.evaluate(() => document.querySelector('header nav [aria-current="location"]')?.textContent?.trim());
      const expected = hash === '#security' ? 'Security' : hash === '#how-it-works' ? 'How it works' : 'Compliance';
      report.directHashes.push({ hash, cur, expected, ok: cur === expected });
    }
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const afterBack = await page.evaluate(() => document.querySelector('header nav [aria-current="location"]')?.textContent?.trim());
    report.directHashes.push({ hash: 'goBack->#how-it-works', cur: afterBack, expected: 'How it works', ok: afterBack === 'How it works' });

    // 7. Resize, ID/EN switch, Dark theme + dark theme screenshots
    await page.setViewportSize({ width: 1024, height: 768 });
    await checkSection(page, 'stepper');
    await page.locator('header button[aria-label*="theme" i]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'spy_dark_stepper.png'), clip: { x: 0, y: 0, width: 1024, height: 140 } });
    const themeAligned = await checkSection(page, 'security');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'spy_dark_security.png'), clip: { x: 0, y: 0, width: 1024, height: 140 } });
    report.resizeLangTheme = { ok: themeAligned.ok, ...themeAligned };

    // 8. Hit-test header controls
    report.hitTest = await page.evaluate(() => {
      const els = document.querySelectorAll('header nav a, header nav button, header button[aria-label*="theme" i]');
      const blocked = [];
      let tested = 0;
      els.forEach((el) => {
        if (getComputedStyle(el).pointerEvents === 'none') return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        tested++;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit !== el && !el.contains(hit)) blocked.push(el.textContent?.trim() || el.tagName);
      });
      return { tested, blocked, ok: blocked.length === 0 };
    });

    await ctx.close();

    // 9. Reduced motion
    const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const rmPage = await rmCtx.newPage();
    await rmPage.goto(BASE + '/', { waitUntil: 'networkidle' });
    await rmPage.waitForTimeout(300);
    const rmRes = await checkSection(rmPage, 'security');
    report.reducedMotion = { ok: rmRes.ok, ...rmRes };
    await rmCtx.close();

    // 10. Mobile menu sync (390x844)
    const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mobPage = await mobCtx.newPage();
    await mobPage.goto(BASE + '/', { waitUntil: 'networkidle' });
    await mobPage.waitForTimeout(550);
    await mobPage.evaluate(() => {
      const el = document.getElementById('security');
      window.scrollTo({ top: Math.round(el.getBoundingClientRect().top + window.scrollY + 40), behavior: 'auto' });
    });
    await mobPage.waitForTimeout(500);
    await mobPage.locator('button.hamburger-btn').click();
    await mobPage.waitForTimeout(300);
    const mobActive = await mobPage.evaluate(() => {
      const cur = document.querySelector('#mobile-navigation-sheet [aria-current="location"]');
      return cur ? cur.textContent.trim() : null;
    });
    report.mobileMenu = { mobActive, ok: mobActive === 'Security' };
    await mobCtx.close();

    console.log(JSON.stringify(report, null, 2));
    const allPassed =
      report.consoleErrors.length === 0 &&
      report.pageErrors.length === 0 &&
      report.heroAtTop?.ok &&
      report.topToBottom.every((r) => r.ok) &&
      report.bottomToTop.every((r) => r.ok) &&
      report.randomOrder.every((r) => r.ok) &&
      report.bottomRule?.ok &&
      report.fastScroll?.ok &&
      report.clickNav.every((r) => r.ok) &&
      report.directHashes.every((r) => r.ok) &&
      report.resizeLangTheme?.ok &&
      report.reducedMotion?.ok &&
      report.mobileMenu?.ok &&
      report.hitTest?.ok;

    if (!allPassed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
