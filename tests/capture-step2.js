import { chromium } from 'playwright';
import path from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\farha\\.gemini\\antigravity\\brain\\fbdd5be8-9d26-4c37-883b-cfe6b8b98ef8';
const URL = 'http://localhost:3000/';

const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript((t) => {
      localStorage.setItem('theme', t);
    }, theme);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
    }, theme);
    await page.waitForTimeout(800);

    // 1. Hero
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `after_step2_hero_${theme}.png`) });

    // 2. Isolation diagram
    const iso = page.locator('#isolation');
    if (await iso.count()) {
      await iso.scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      await iso.screenshot({ path: path.join(ARTIFACT_DIR, `after_step2_isolation_${theme}.png`) });
    }

    // 3. Boot log / Bento
    const features = page.locator('#features');
    if (await features.count()) {
      await features.scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await features.screenshot({ path: path.join(ARTIFACT_DIR, `after_step2_boot_${theme}.png`) });
    }

    // 4. Footer
    const footer = page.locator('footer');
    if (await footer.count()) {
      await footer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await footer.screenshot({ path: path.join(ARTIFACT_DIR, `after_step2_footer_${theme}.png`) });
    }

    await context.close();
  }
  console.log('Captured step 2 verification screenshots.');
} finally {
  await browser.close();
}
