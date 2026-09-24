import { test, expect } from '@playwright/test';
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

function stopProcess(child) {
  if (child?.pid && child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
}

async function discoverRendererTarget(processLog) {
  let lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page' && String(item.url || '').includes('/renderer/index.html'));
      if (target?.webSocketDebuggerUrl) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Cible renderer Electron introuvable: ${lastError?.message || 'aucune page publiée'}\n${processLog()}`);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (!message.id || !this.pending.has(message.id)) return;
      const request = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result || {});
    });
    socket.addEventListener('close', () => {
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error(`CDP fermé pendant ${request.method}`));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Ouverture WebSocket CDP expirée')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Connexion WebSocket CDP refusée')); }, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}, timeoutMs = 5000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout CDP ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.socket.close(); } catch {}
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
  // A shallow document root is sufficient for DOM.querySelector and avoids
  // serialising the entire Electron renderer tree on Windows CI.
  const document = await cdp.send('DOM.getDocument', { depth: 0, pierce: true });
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

  let cdp = null;
  try {
    const target = await discoverRendererTarget(() => output);
    console.log(`[gate] cible renderer trouvée: ${target.url}`);
    cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
    await cdp.send('DOM.enable');
    await cdp.send('Page.enable');
    console.log('[gate] protocole DevTools direct actif');

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
      url: target.url,
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
    console.log('[gate] géométrie et données de contrôle validées');

    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 1448, height: 1086, scale: 1 }
    }, 10_000);
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
    cdp?.close();
    stopProcess(child);
  }
});
