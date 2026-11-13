const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\farha\\.gemini\\antigravity\\brain\\fbdd5be8-9d26-4c37-883b-cfe6b8b98ef8';
const BASE_URL = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript((t) => localStorage.setItem('ptaas.theme', t), theme);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, `before_hero_${theme}.png`) });

    const iso = page.locator('#isolation, [data-diagram="isolation"]').first();
    if (await iso.count() > 0) {
      await iso.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await iso.screenshot({ path: path.join(ARTIFACT_DIR, `before_isolation_${theme}.png`) });
    }

    const boot = page.locator('text=Instant KVM Boot').locator('..').locator('..');
    if (await boot.count() > 0) {
      await boot.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await boot.first().screenshot({ path: path.join(ARTIFACT_DIR, `before_boot_${theme}.png`) });
    }

    const footer = page.locator('footer').first();
    if (await footer.count() > 0) {
      await footer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await footer.screenshot({ path: path.join(ARTIFACT_DIR, `before_footer_${theme}.png`) });
    }

    await context.close();
  }
  await browser.close();
  console.log('Before screenshots captured.');
})();
