import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '').replace(/\//g, '\\');
const CAPTURE_DIR = path.join(ROOT, 'public', 'captures');
const LIVE_URL = 'https://pocketroom-six.vercel.app/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

await fs.mkdir(CAPTURE_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--disable-gpu', '--hide-scrollbars'],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
});
const page = await context.newPage();

async function settle() {
  await page.waitForTimeout(850);
  await page.evaluate(() => document.fonts?.ready);
}

async function shot(name) {
  await settle();
  await page.screenshot({ path: path.join(CAPTURE_DIR, `${name}.png`), animations: 'disabled' });
}

async function closeSheet() {
  const close = page.locator('.sheet-head button, [data-close="1"]').first();
  if (await close.count()) {
    await close.click();
    await settle();
  }
}

async function openHotspot(area, name) {
  await page.locator(`[data-area="${area}"]`).first().click();
  await shot(name);
  await closeSheet();
}

await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 60000 });
await settle();
await shot('room');

const proof = {
  url: page.url(),
  title: await page.title(),
  capturedAt: new Date().toISOString(),
  roomButtons: await page.locator('button').allTextContents(),
  hotspots: await page.locator('[data-area]').evaluateAll((els) => els.map((el) => ({
    area: el.getAttribute('data-area'),
    label: el.getAttribute('aria-label'),
  }))),
};

await page.getByRole('button', { name: /Voice assistant/i }).click();
await shot('voice-assistant');
await closeSheet();

await openHotspot('desk', 'desk');
await openHotspot('timeline', 'timeline');
await openHotspot('doorway', 'doorway');
await openHotspot('wardrobe', 'wardrobe');
await openHotspot('storage', 'storage');

await page.locator('[data-act="decor"]').click();
await shot('decorate');
await closeSheet();

await page.locator('[data-act="sound"]').click();
await shot('clatter');
await closeSheet();

await page.locator('[data-act="keys"]').click();
await shot('ai-setup');
await closeSheet();

await page.getByRole('button', { name: 'List', exact: true }).click();
await shot('list');

await fs.writeFile(path.join(CAPTURE_DIR, 'live-proof.json'), JSON.stringify(proof, null, 2), 'utf8');
await browser.close();

console.log(`Captured live Pocketroom states from ${LIVE_URL}`);
