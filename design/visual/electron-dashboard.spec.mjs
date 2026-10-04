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
const MAX_DIFF_RATIO = 0.04;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stopProcess(child) {
  if (child?.pid && child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true
    });
  }
}

async function waitForRendererTarget(processLog) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${ENDPOINT}/json/list`, {
        signal: AbortSignal.timeout(1000)
      });
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page'
        && String(item.url || '').includes('/renderer/index.html'));
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

async function captureMasterSurface(session, outputPath) {
  const shot = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: MASTER_WIDTH, height: MASTER_HEIGHT, scale: 1 }
  });
  fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
}

test('Phase B — packaged Electron fidelity against dashboard master', async ({}, testInfo) => {
  test.setTimeout(90_000);
  expect(fs.existsSync(EXECUTABLE), `Exécutable empaqueté absent: ${EXECUTABLE}`).toBe(true);
  expect(fs.existsSync(MASTER), `Master absent: ${MASTER}`).toBe(true);

  let output = '';
  const child = spawn(EXECUTABLE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--remote-allow-origins=*',
    '--force-device-scale-factor=1'
  ], {
    env: { ...process.env, RDL_VISUAL_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { output += chunk.toString(); });

  let browser = null;
  let session = null;
  try {
    await waitForRendererTarget(() => output);
    browser = await chromium.connectOverCDP(ENDPOINT, { timeout: 12_000 });
    const context = browser.contexts()[0];
    expect(context, 'Contexte Chromium du binaire Electron introuvable').toBeTruthy();

    const page = context.pages().find((candidate) => candidate.url().includes('/renderer/index.html'));
    expect(page, 'Page renderer Electron absente').toBeTruthy();

    session = await context.newCDPSession(page);
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: MASTER_WIDTH,
      height: MASTER_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: MASTER_WIDTH,
      screenHeight: MASTER_HEIGHT
    });

    await page.waitForFunction(() => document.readyState === 'complete'
      && document.querySelector('#app-shell')?.dataset?.shellReady === 'true', null, { timeout: 15_000 });
    await delay(500);

    const shell = page.locator('#app-shell');
    const sidebar = page.locator('#app-shell > .sidebar');
    const main = page.locator('#app-shell > .main');
    const topbar = page.locator('#app-shell > .main > .topbar');
    const hero = page.locator('#view-dashboard .hero');
    const firstKpi = page.locator('#view-dashboard .kpi').first();

    expect(await roundedBox(shell, '#app-shell')).toEqual({ x: 0, y: 0, width: 1448, height: 1086 });
    expect(await roundedBox(sidebar, '.sidebar')).toEqual({ x: 0, y: 0, width: 362, height: 1086 });
    expect(await roundedBox(main, '.main')).toEqual({ x: 362, y: 0, width: 1086, height: 1086 });
    expect(await roundedBox(topbar, '.topbar')).toEqual({ x: 362, y: 0, width: 1086, height: 77 });
    expect(await roundedBox(hero, '.hero')).toEqual({ x: 362, y: 77, width: 1086, height: 323 });

    const kpiBox = await roundedBox(firstKpi, '.kpi:first');
    expect(Math.abs(kpiBox.x - 376)).toBeLessThanOrEqual(2);
    expect(Math.abs(kpiBox.y - 412)).toBeLessThanOrEqual(2);
    expect(Math.abs(kpiBox.height - 165)).toBeLessThanOrEqual(2);

    const safety = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      giantIcons: [...document.querySelectorAll('.sidebar svg, #view-dashboard svg')]
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 180 || box.height > 180).length,
      legacyV51Rules: [...document.styleSheets]
        .some((sheet) => String(sheet.href || '').endsWith('/v51.css') && (sheet.cssRules?.length || 0) > 0)
    }));
    expect(safety.scrollWidth).toBeLessThanOrEqual(safety.clientWidth + 1);
    expect(safety.scrollHeight).toBeLessThanOrEqual(safety.clientHeight + 1);
    expect(safety.giantIcons).toBe(0);
    expect(safety.legacyV51Rules).toBe(false);

    const actualPath = testInfo.outputPath('electron-dashboard-actual.png');
    await captureMasterSurface(session, actualPath);
    await testInfo.attach('electron-dashboard-actual', { path: actualPath, contentType: 'image/png' });

    const master = PNG.sync.read(fs.readFileSync(MASTER));
    const actual = PNG.sync.read(fs.readFileSync(actualPath));
    expect({ width: actual.width, height: actual.height }).toEqual({ width: MASTER_WIDTH, height: MASTER_HEIGHT });
    expect({ width: master.width, height: master.height }).toEqual({ width: MASTER_WIDTH, height: MASTER_HEIGHT });

    const diff = new PNG({ width: master.width, height: master.height });
    const diffPixels = pixelmatch(master.data, actual.data, diff.data, master.width, master.height, {
      threshold: 0.15,
      includeAA: false
    });
    const ratio = diffPixels / (master.width * master.height);
    const diffPath = testInfo.outputPath('electron-dashboard-diff.png');
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    await testInfo.attach('electron-dashboard-diff', { path: diffPath, contentType: 'image/png' });
    await testInfo.attach('electron-fidelity-metrics', {
      body: Buffer.from(JSON.stringify({ diffPixels, ratio, maxRatio: MAX_DIFF_RATIO, kpiBox, safety }, null, 2)),
      contentType: 'application/json'
    });

    console.log(`[gate] divergence = ${(ratio * 100).toFixed(4)}% (${diffPixels} pixels)`);
    expect(ratio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
  } finally {
    await testInfo.attach('electron-process-log', {
      body: Buffer.from(output || '(aucune sortie processus)', 'utf8'),
      contentType: 'text/plain'
    });
    try { await session?.detach(); } catch {}
    try { await browser?.close(); } catch {}
    stopProcess(child);
  }
});
