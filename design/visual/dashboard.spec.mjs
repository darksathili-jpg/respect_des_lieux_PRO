import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD = path.resolve(HERE, '../prototype/dashboard.html');

async function box(page, selector) {
  const value = await page.locator(selector).boundingBox();
  if (!value) throw new Error(`Élément introuvable: ${selector}`);
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Math.round(number)]));
}

test('dashboard master — geometry + visual fidelity', async ({ page }, testInfo) => {
  await page.goto(pathToFileURL(DASHBOARD).href);
  await page.evaluate(() => document.fonts.ready);

  await expect(page.locator('.vf-canvas')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.readyState)).toBe('complete');

  expect(await box(page, '.vf-canvas')).toEqual({ x: 0, y: 0, width: 1448, height: 1086 });
  expect(await box(page, '.vf-sidebar')).toEqual({ x: 0, y: 77, width: 362, height: 1009 });
  expect(await box(page, '.vf-main')).toEqual({ x: 362, y: 77, width: 1086, height: 1009 });
  expect(await box(page, '.vf-hero')).toEqual({ x: 362, y: 77, width: 1086, height: 323 });

  const firstKpi = await box(page, '.vf-kpi');
  expect(firstKpi.x).toBe(376);
  expect(firstKpi.y).toBe(412);
  expect(firstKpi.width).toBe(242);
  expect(firstKpi.height).toBe(165);

  const actual = testInfo.outputPath('dashboard-actual.png');
  await page.locator('.vf-canvas').screenshot({ path: actual, animations: 'disabled', caret: 'hide' });
  await testInfo.attach('dashboard-actual', { path: actual, contentType: 'image/png' });

  // Gate de fidélité réel. Le seuil est volontairement strict pour une première
  // reconstruction HTML/CSS : moins de 8 % des pixels peuvent diverger au-delà
  // du seuil couleur. L'interface Electron ne sera pas réintégrée avant PASS.
  await expect(page.locator('.vf-canvas')).toHaveScreenshot('dashboard-master.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    threshold: 0.15,
    maxDiffPixelRatio: 0.08
  });
});
