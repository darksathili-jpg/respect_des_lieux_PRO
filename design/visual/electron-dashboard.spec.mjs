import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXECUTABLE = path.resolve(HERE, '../../dist/win-unpacked/Respect des Lieux PRO.exe');
const DEBUG_PORT = 9222;

async function box(locator, label) {
  const value = await locator.boundingBox();
  if (!value) throw new Error(`Élément introuvable: ${label}`);
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Math.round(number)]));
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectToPackagedElectron(processLog) {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`, { timeout: 1000 });
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`CDP Electron inaccessible sur le port ${DEBUG_PORT}: ${lastError?.message || 'erreur inconnue'}\n${processLog()}`);
}

function stopProcess(child) {
  if (child?.pid && child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
}

test('packaged Electron dashboard — master fidelity gate', async ({}, testInfo) => {
  test.setTimeout(45_000);
  expect(fs.existsSync(EXECUTABLE), `Exécutable empaqueté absent: ${EXECUTABLE}`).toBe(true);

  let output = '';
  console.log('[gate] lancement du binaire empaqueté');
  const child = spawn(EXECUTABLE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--remote-allow-origins=*',
    '--force-device-scale-factor=1'
  ], {
    env: {
      ...process.env,
      RDL_VISUAL_TEST: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { output += chunk.toString(); });

  let browser = null;
  try {
    console.log('[gate] connexion CDP');
    browser = await connectToPackagedElectron(() => output);
    console.log('[gate] CDP connecté');

    const context = browser.contexts()[0];
    if (!context) throw new Error(`Contexte Chromium Electron introuvable.\n${output}`);

    let page = context.pages()[0] || null;
    for (let attempt = 0; !page && attempt < 40; attempt += 1) {
      await delay(125);
      page = context.pages()[0] || null;
    }
    if (!page) throw new Error(`Fenêtre Electron principale introuvable.\n${output}`);
    page.setDefaultTimeout(10_000);
    console.log(`[gate] fenêtre trouvée: ${page.url()}`);

    await expect(page.locator('#vf-dashboard')).toHaveAttribute('data-vf-ready', 'true', { timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready);
    console.log(`[gate] viewport Electron ${await page.evaluate(() => `${innerWidth}x${innerHeight}`)}`);

    expect(await box(page.locator('#vf-dashboard'), '#vf-dashboard')).toEqual({ x: 0, y: 0, width: 1448, height: 1086 });
    expect(await box(page.locator('.vf-sidebar'), '.vf-sidebar')).toEqual({ x: 0, y: 77, width: 362, height: 1009 });
    expect(await box(page.locator('.vf-main'), '.vf-main')).toEqual({ x: 362, y: 77, width: 1086, height: 1009 });
    expect(await box(page.locator('.vf-hero'), '.vf-hero')).toEqual({ x: 362, y: 77, width: 1086, height: 323 });

    const firstKpi = await box(page.locator('.vf-kpi').first(), '.vf-kpi:first');
    expect(firstKpi).toEqual({ x: 376, y: 412, width: 242, height: 165 });

    await expect(page.locator('#vf-kpi-pending')).toHaveText('12');
    await expect(page.locator('#vf-kpi-interventions')).toHaveText('8');
    await expect(page.locator('#vf-kpi-resolved')).toHaveText('48');
    console.log('[gate] géométrie et données de contrôle validées');

    const actual = testInfo.outputPath('electron-dashboard-actual.png');
    await page.locator('#vf-dashboard').screenshot({ path: actual, animations: 'disabled', caret: 'hide', timeout: 10_000 });
    await testInfo.attach('electron-dashboard-actual', { path: actual, contentType: 'image/png' });
    console.log('[gate] capture réelle obtenue');

    await expect(page.locator('#vf-dashboard')).toHaveScreenshot('dashboard-master.png', {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: 0.15,
      maxDiffPixelRatio: 0.04,
      timeout: 10_000
    });
    console.log('[gate] comparaison maître validée');
  } finally {
    await testInfo.attach('electron-process-log', { body: Buffer.from(output || '(aucune sortie processus)', 'utf8'), contentType: 'text/plain' });
    stopProcess(child);
    if (browser) {
      await Promise.race([browser.close().catch(() => {}), delay(1500)]);
    }
  }
});
