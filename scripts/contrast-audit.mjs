import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:3000';
const AXE_SOURCE = fs.readFileSync(path.resolve(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');

async function runAxeContrast(page, label) {
  await page.addScriptTag({ content: AXE_SOURCE });
  const results = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] }
    });
  });
  const violations = results.violations || [];
  const items = [];
  for (const v of violations) {
    for (const node of v.nodes) {
      items.push({
        label,
        html: node.html.slice(0, 140),
        target: node.target.join(' '),
        summary: node.failureSummary?.replace(/\s+/g, ' ').slice(0, 200) || v.description
      });
    }
  }
  return { passes: results.passes?.length || 0, items };
}

async function auditSvgAndDarkPanels(page, label) {
  return await page.evaluate((lbl) => {
    function parseRgba(str) {
      const m = String(str).match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\)/i);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    }
    function lum({ r, g, b }) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }
    function ratio(fg, bg) {
      const l1 = lum(fg);
      const l2 = lum(bg);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function effectiveBg(el) {
      let cur = el;
      const layers = [];
      while (cur && cur.nodeType === 1) {
        const bg = parseRgba(getComputedStyle(cur).backgroundColor);
        if (bg && bg.a > 0) layers.push(bg);
        cur = cur.parentElement;
      }
      let out = { r: 15, g: 17, b: 21, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        out = {
          r: l.r * l.a + out.r * (1 - l.a),
          g: l.g * l.a + out.g * (1 - l.a),
          b: l.b * l.a + out.b * (1 - l.a),
          a: 1
        };
      }
      return out;
    }

    const failures = [];
    const svgTexts = document.querySelectorAll('svg text');
    for (const t of svgTexts) {
      const rect = t.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cs = getComputedStyle(t);
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const fg = parseRgba(cs.fill);
      if (!fg) continue;
      const bg = effectiveBg(t.closest('[data-surface], div') || t);
      const r = ratio(fg, bg);
      if (r < 4.5) {
        failures.push({
          label: lbl,
          text: t.textContent.trim().slice(0, 50),
          ratio: Number(r.toFixed(2)),
          fg: cs.fill,
          bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`
        });
      }
    }
    return failures;
  }, label);
}

async function setThemeAndLang(page, theme, lang) {
  await page.evaluate(({ t, l }) => {
    localStorage.setItem('theme', t);
    localStorage.setItem('lang', l);
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, { t: theme, l: lang });
}

const browser = await chromium.launch();
const allViolations = [];
const allSvgFailures = [];
const summary = [];

try {
  // 1. Landing Page matrix: light/dark x en/id x 1440/390
  for (const theme of ['light', 'dark']) {
    for (const lang of ['en', 'id']) {
      for (const vp of [{ width: 1440, height: 900, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await ctx.newPage();
        await page.addInitScript(({ t, l }) => {
          localStorage.setItem('theme', t);
          localStorage.setItem('lang', l);
        }, { t: theme, l: lang });
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
        await setThemeAndLang(page, theme, lang);
        await page.waitForTimeout(500);

        const label = `landing:${theme}:${lang}:${vp.tag}`;
        const axeRes = await runAxeContrast(page, label);
        const svgFails = await auditSvgAndDarkPanels(page, label);

        // Dynamic state check on desktop EN: trigger isolation blocked state & check
        if (vp.tag === 'desktop' && lang === 'en') {
          const btn = page.locator('#isolation button', { hasText: /Send Test Packets|Kirim Paket/i });
          if (await btn.count()) {
            await btn.scrollIntoViewIfNeeded();
            await btn.click();
            await page.waitForTimeout(1600);
            const dynRes = await runAxeContrast(page, `${label}:isolation-blocked`);
            allViolations.push(...dynRes.items);
          }
        }

        allViolations.push(...axeRes.items);
        allSvgFailures.push(...svgFails);
        summary.push({ label, axeViolations: axeRes.items.length, svgFailures: svgFails.length });
        await ctx.close();
      }
    }
  }

  // 2. Authenticated Pages: login once per theme & audit /dashboard, /vms, /terminal, /studio, /approvals
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      localStorage.setItem('theme', t);
      localStorage.setItem('lang', 'en');
    }, theme);

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await setThemeAndLang(page, theme, 'en');
    // Click first demo user (Admin or Instructor) to fill credentials & sign in
    const adminBtn = page.locator('button', { hasText: /Admin|Instructor/i }).first();
    if (await adminBtn.count()) {
      await adminBtn.click();
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(600);
      // Handle MFA step if shown
      const mfaBtn = page.locator('button[type="submit"]');
      if (await mfaBtn.count()) {
        const otpInput = page.locator('input').first();
        if (await otpInput.count()) {
          await otpInput.fill('123456').catch(() => {});
        }
        await mfaBtn.click().catch(() => {});
        await page.waitForTimeout(600);
      }
    }

    for (const route of ['/dashboard', '/vms', '/terminal', '/studio', '/approvals']) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      await setThemeAndLang(page, theme, 'en');
      await page.waitForTimeout(500);
      const label = `app:${route}:${theme}`;
      const axeRes = await runAxeContrast(page, label);
      allViolations.push(...axeRes.items);
      summary.push({ label, axeViolations: axeRes.items.length, svgFailures: 0 });
    }
    await ctx.close();
  }

  console.log('\n=== CONTRAST AUDIT SUMMARY ===');
  for (const s of summary) {
    console.log(`  ${s.label.padEnd(36)} axe=${s.axeViolations}  svg=${s.svgFailures}`);
  }

  if (allViolations.length > 0) {
    console.error(`\n[FAIL] ${allViolations.length} axe color-contrast violations:`);
    for (const v of allViolations.slice(0, 30)) {
      console.error(`  [${v.label}] ${v.target} -> ${v.summary}`);
    }
  }
  if (allSvgFailures.length > 0) {
    console.error(`\n[FAIL] ${allSvgFailures.length} SVG text contrast failures (< 4.5:1):`);
    for (const f of allSvgFailures) {
      console.error(`  [${f.label}] "${f.text}" ratio=${f.ratio} (${f.fg} on ${f.bg})`);
    }
  }

  if (allViolations.length > 0 || allSvgFailures.length > 0) {
    process.exit(1);
  }
  console.log('\n[PASS] 0 axe color-contrast violations and 0 SVG text contrast failures!');
} finally {
  await browser.close();
}
