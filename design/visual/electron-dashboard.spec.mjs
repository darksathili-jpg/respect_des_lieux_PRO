import { test, expect, chromium } from '@playwright/test';
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

function rectFromQuad(quad) {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  const x = Math.round(Math.min(...xs));
  const y = Math.round(Math.min(...ys));
  return {
    x,
    y,
    width: Math.round(Math.max(...xs) - Math.min(...xs)),
    height: Math.round(Math.max(...ys) - Math.min(...ys))
  };
}

async function documentRoot(cdp) {
  const document = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  return document.root.nodeId;
}

async function queryNode(cdp, rootId, selector) {
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: rootId, selector });
  if (!nodeId) throw new Error(`Élément introuvable dans Electron empaqueté: ${selector}`);
  return nodeId;
}

async function box(cdp, rootId, selector) {
  const nodeId = await queryNode(cdp, rootId, selector);
  const model = await cdp.send('DOM.getBoxModel', { nodeId });
  return rectFromQuad(model.model.border);
}

async function outerHTML(cdp, rootId, selector) {
  const nodeId = await queryNode(cdp, rootId, selector);
  const result = await cdp.send('DOM.getOuterHTML', { nodeId });
  return result.outerHTML;
}

async function attributes(cdp, rootId, selector) {
  const nodeId = await queryNode(cdp, rootId, selector);
  const { attributes: flat } = await cdp.send('DOM.getAttributes', { nodeId });
  const result = {};
  for (let index = 0; index < flat.length; index += 2) result[flat[index]] = flat[index + 1];
  return result;
}

function textFromOuterHTML(html) {
  return html.replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ').trim();
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
    console.log(`[gate] fenêtre trouvée: ${page.url()}`);

    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('Page.enable');
    console.log('[gate] session CDP DOM/Page active');

    let rootId = 0;
    let ready = false;
    let lastAttrs = {};
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        rootId = await documentRoot(cdp);
        lastAttrs = await attributes(cdp, rootId, '#vf-dashboard');
        ready = lastAttrs['data-vf-ready'] === 'true';
        if (ready) break;
      } catch {}
      await delay(125);
    }
    if (!ready) throw new Error(`Dashboard Electron non prêt après 5 s. Attributs=${JSON.stringify(lastAttrs)}\n${output}`);

    const pendingHtml = await outerHTML(cdp, rootId, '#vf-kpi-pending');
    const interventionsHtml = await outerHTML(cdp, rootId, '#vf-kpi-interventions');
    const resolvedHtml = await outerHTML(cdp, rootId, '#vf-kpi-resolved');
    const diagnostic = {
      url: page.url(),
      vfReady: lastAttrs['data-vf-ready'] || null,
      pending: textFromOuterHTML(pendingHtml),
      interventions: textFromOuterHTML(interventionsHtml),
      resolved: textFromOuterHTML(resolvedHtml)
    };
    console.log(`[gate] DOM empaqueté ${JSON.stringify(diagnostic)}`);

    expect(diagnostic.vfReady).toBe('true');
    expect(diagnostic.pending).toBe('12');
    expect(diagnostic.interventions).toBe('8');
    expect(diagnostic.resolved).toBe('48');

    expect(await box(cdp, rootId, '#vf-dashboard')).toEqual({ x: 0, y: 0, width: 1448, height: 1086 });
    expect(await box(cdp, rootId, '.vf-sidebar')).toEqual({ x: 0, y: 77, width: 362, height: 1009 });
    expect(await box(cdp, rootId, '.vf-main')).toEqual({ x: 362, y: 77, width: 1086, height: 1009 });
    expect(await box(cdp, rootId, '.vf-hero')).toEqual({ x: 362, y: 77, width: 1086, height: 323 });
    expect(await box(cdp, rootId, '.vf-kpi')).toEqual({ x: 376, y: 412, width: 242, height: 165 });
    console.log('[gate] géométrie et données de contrôle validées par CDP');

    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 1448, height: 1086, scale: 1 }
    });
    const actualBuffer = Buffer.from(capture.data, 'base64');
    const actualPath = testInfo.outputPath('electron-dashboard-actual.png');
    fs.writeFileSync(actualPath, actualBuffer);
    await testInfo.attach('electron-dashboard-actual', { path: actualPath, contentType: 'image/png' });

    const master = PNG.sync.read(fs.readFileSync(MASTER));
    const actual = PNG.sync.read(actualBuffer);
    expect({ width: actual.width, height: actual.height }).toEqual({ width: 1448, height: 1086 });
    expect({ width: master.width, height: master.height }).toEqual({ width: 1448, height: 1086 });

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
    stopProcess(child);
    if (browser) {
      await Promise.race([browser.close().catch(() => {}), delay(1500)]);
    }
  }
});
