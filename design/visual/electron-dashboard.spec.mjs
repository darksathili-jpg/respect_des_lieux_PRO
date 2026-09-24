import { chromium, test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXECUTABLE = path.resolve(HERE, '../../dist/win-unpacked/Respect des Lieux PRO.exe');
const MASTER = path.resolve(HERE, '../reference/dashboard-master.png');
const DEBUG_PORT = 9222;
const ENDPOINT = `http://127.0.0.1:${DEBUG_PORT}`;
const MASTER_WIDTH = 1448;
const MASTER_HEIGHT = 1086;

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcess(child) {
  if (child?.pid && child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
}

async function waitForRendererTarget(processLog) {
  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${ENDPOINT}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page' && String(item.url || '').includes('/renderer/index.html'));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Cible renderer Electron introuvable: ${lastError?.message || 'aucune page publiée'}\n${processLog()}`);
}

async function roundedBox(locator, label) {
  const value = await locator.boundingBox();
  if (!value) throw new Error(`Élément introuvable ou invisible: ${label}`);
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Math.round(number)]));
}

async function captureMasterSurface(context, page, outputPath) {
  // GitHub's hosted Windows desktop can expose a physical viewport as small as
  // 1024×681 even while the packaged renderer correctly owns a 1448×1086
  // master canvas. page.screenshot({ clip }) is clipped to that host viewport
  // and therefore cannot qualify fidelity. CDP's captureBeyondViewport asks the
  // *real packaged Electron renderer* to rasterize the complete CSS surface,
  // without resizing/rebuilding the DOM and without weakening the visual gate.
  const session = await context.newCDPSession(page);
  try {
    const shot = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: MASTER_WIDTH, height: MASTER_HEIGHT, scale: 1 }
    });
    fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
  } finally {
    await session.detach();
  }
}

test('packaged Electron dashboard — master fidelity gate', async ({}, testInfo) => {
  test.setTimeout(60_000);
  expect(fs.existsSync(EXECUTABLE), `Exécutable empaqueté absent: ${EXECUTABLE}`).toBe(true);
  expect(fs.existsSync(MASTER), `Master absent: ${MASTER}`).toBe(true);

  let output = '';
  console.log('[gate] lancement du binaire empaqueté');
  const child = spawn(EXECUTABLE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--remote-allow-origins=*',
    '--force-device-scale-factor=1',
    '--rdl-visual-test=1'
  ], {
    env: { ...process.env, RDL_VISUAL_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { output += chunk.toString(); });

  let browser = null;
  try {
    const target = await waitForRendererTarget(() => output);
    console.log(`[gate] cible renderer trouvée: ${target.url}`);

    browser = await chromium.connectOverCDP(ENDPOINT, { timeout: 10_000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error('Contexte Chromium du binaire Electron introuvable');

    let page = context.pages().find((candidate) => candidate.url().includes('/renderer/index.html'));
    for (let attempt = 0; !page && attempt < 20; attempt += 1) {
      await delay(100);
      page = context.pages().find((candidate) => candidate.url().includes('/renderer/index.html'));
    }
    if (!page) throw new Error('Page renderer Electron absente après connexion CDP');
    console.log('[gate] Playwright est connecté à la vraie fenêtre Electron empaquetée');

    const dashboard = page.locator('#vf-dashboard');
    await expect(dashboard).toHaveAttribute('data-vf-ready', 'true', { timeout: 10_000 });

    const diagnostic = {
      url: page.url(),
      vfReady: await dashboard.getAttribute('data-vf-ready'),
      pending: (await page.locator('#vf-kpi-pending').textContent())?.trim(),
      interventions: (await page.locator('#vf-kpi-interventions').textContent())?.trim(),
      resolved: (await page.locator('#vf-kpi-resolved').textContent())?.trim()
    };
    console.log(`[gate] DOM empaqueté ${JSON.stringify(diagnostic)}`);
    expect(diagnostic.vfReady).toBe('true');
    expect(diagnostic.pending).toBe('12');
    expect(diagnostic.interventions).toBe('8');
    expect(diagnostic.resolved).toBe('48');

    expect(await roundedBox(dashboard, '#vf-dashboard')).toEqual({ x: 0, y: 0, width: MASTER_WIDTH, height: MASTER_HEIGHT });
    expect(await roundedBox(page.locator('.vf-sidebar'), '.vf-sidebar')).toEqual({ x: 0, y: 77, width: 362, height: 1009 });
    expect(await roundedBox(page.locator('.vf-main'), '.vf-main')).toEqual({ x: 362, y: 77, width: 1086, height: 1009 });
    expect(await roundedBox(page.locator('.vf-hero'), '.vf-hero')).toEqual({ x: 362, y: 77, width: 1086, height: 323 });
    expect(await roundedBox(page.locator('.vf-kpi').first(), '.vf-kpi:first')).toEqual({ x: 376, y: 412, width: 242, height: 165 });
    console.log('[gate] géométrie et données de contrôle validées');

    const actualPath = testInfo.outputPath('electron-dashboard-actual.png');
    await captureMasterSurface(context, page, actualPath);
    await testInfo.attach('electron-dashboard-actual', { path: actualPath, contentType: 'image/png' });

    const master = PNG.sync.read(fs.readFileSync(MASTER));
    const actual = PNG.sync.read(fs.readFileSync(actualPath));
    expect({ width: actual.width, height: actual.height }).toEqual({ width: MASTER_WIDTH, height: MASTER_HEIGHT });
    expect({ width: master.width, height: master.height }).toEqual({ width: MASTER_WIDTH, height: MASTER_HEIGHT });

    const diff = new PNG({ width: master.width, height: master.height });
    const diffPixels = pixelmatch(master.data, actual.data, diff.data, master.width, master.height, { threshold: 0.15 });
    const ratio = diffPixels / (master.width * master.height);
    const diffPath = testInfo.outputPath('electron-dashboard-diff.png');
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    await testInfo.attach('electron-dashboard-diff', { path: diffPath, contentType: 'image/png' });
    console.log(`[gate] divergence pixels = ${(ratio * 100).toFixed(4)}% (${diffPixels} pixels)`);
    expect(ratio).toBeLessThanOrEqual(0.04);
    console.log('[gate] comparaison maître validée');
  } finally {
    await testInfo.attach('electron-process-log', { body: Buffer.from(output || '(aucune sortie processus)', 'utf8'), contentType: 'text/plain' });
    try { await browser?.close(); } catch {}
    stopProcess(child);
  }
});
