import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXECUTABLE = path.resolve(HERE, '../../dist/win-unpacked/Respect des Lieux PRO.exe');

async function box(locator, label) {
  const value = await locator.boundingBox();
  if (!value) throw new Error(`Élément introuvable: ${label}`);
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Math.round(number)]));
}

test('packaged Electron dashboard — master fidelity gate', async ({}, testInfo) => {
  expect(fs.existsSync(EXECUTABLE), `Exécutable empaqueté absent: ${EXECUTABLE}`).toBe(true);

  const app = await electron.launch({
    executablePath: EXECUTABLE,
    env: {
      ...process.env,
      RDL_VISUAL_TEST: '1'
    }
  });

  try {
    const page = await app.firstWindow();

    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('Fenêtre Electron principale introuvable.');
      window.setContentSize(1448, 1086);
    });

    await expect.poll(async () => page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: 1448, height: 1086 });
    await expect(page.locator('#vf-dashboard')).toHaveAttribute('data-vf-ready', 'true');
    await page.evaluate(() => document.fonts.ready);

    expect(await box(page.locator('#vf-dashboard'), '#vf-dashboard')).toEqual({ x: 0, y: 0, width: 1448, height: 1086 });
    expect(await box(page.locator('.vf-sidebar'), '.vf-sidebar')).toEqual({ x: 0, y: 77, width: 362, height: 1009 });
    expect(await box(page.locator('.vf-main'), '.vf-main')).toEqual({ x: 362, y: 77, width: 1086, height: 1009 });
    expect(await box(page.locator('.vf-hero'), '.vf-hero')).toEqual({ x: 362, y: 77, width: 1086, height: 323 });

    const firstKpi = await box(page.locator('.vf-kpi').first(), '.vf-kpi:first');
    expect(firstKpi).toEqual({ x: 376, y: 412, width: 242, height: 165 });

    await expect(page.locator('#vf-kpi-pending')).toHaveText('12');
    await expect(page.locator('#vf-kpi-interventions')).toHaveText('8');
    await expect(page.locator('#vf-kpi-resolved')).toHaveText('48');

    const actual = testInfo.outputPath('electron-dashboard-actual.png');
    await page.locator('#vf-dashboard').screenshot({ path: actual, animations: 'disabled', caret: 'hide' });
    await testInfo.attach('electron-dashboard-actual', { path: actual, contentType: 'image/png' });

    await expect(page.locator('#vf-dashboard')).toHaveScreenshot('dashboard-master.png', {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: 0.15,
      maxDiffPixelRatio: 0.04
    });
  } finally {
    await app.close();
  }
});
