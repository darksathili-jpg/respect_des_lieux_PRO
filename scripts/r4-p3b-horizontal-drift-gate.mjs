import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const port = Number(readArg('--port', '9333'));
const outDir = path.resolve(readArg('--out', 'artifacts/rdl-visual-evidence'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Port CDP invalide: ${port}`);
}
fs.mkdirSync(outDir, { recursive: true });

async function discoverPageTarget() {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`Cible Electron CDP introuvable sur ${endpoint}: ${lastError?.message || 'délai dépassé'}`);
}

class CdpSession {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connexion CDP expirée.')), 8000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Connexion CDP impossible.')); }, { once: true });
    });

    this.socket.addEventListener('message', async (event) => {
      let text;
      if (typeof event.data === 'string') text = event.data;
      else if (event.data instanceof ArrayBuffer) text = Buffer.from(event.data).toString('utf8');
      else if (typeof event.data?.arrayBuffer === 'function') text = Buffer.from(await event.data.arrayBuffer()).toString('utf8');
      else text = String(event.data || '');
      let payload;
      try { payload = JSON.parse(text); } catch { return; }
      if (!payload.id || !this.pending.has(payload.id)) return;
      const pending = this.pending.get(payload.id);
      clearTimeout(pending.timer);
      this.pending.delete(payload.id);
      if (payload.error) pending.reject(new Error(payload.error.message || 'Erreur CDP'));
      else pending.resolve(payload.result || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Commande CDP expirée: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

const geometryExpression = `(() => {
  const rect = (node) => node ? ({
    x: node.getBoundingClientRect().x,
    y: node.getBoundingClientRect().y,
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
    right: node.getBoundingClientRect().right,
    bottom: node.getBoundingClientRect().bottom
  }) : null;
  const shell = document.querySelector('#app-shell');
  const sidebar = shell?.querySelector(':scope > .sidebar');
  const main = shell?.querySelector(':scope > .main');
  const brand = sidebar?.querySelector('.brand');
  const navs = [...(sidebar?.querySelectorAll('.nav[data-view]') || [])];
  const labels = navs.map((nav) => ({
    view: nav.dataset.view || '',
    nav: rect(nav),
    label: rect(nav.querySelector('.nav-label')),
    text: nav.querySelector('.nav-label')?.textContent?.trim() || ''
  }));
  return {
    innerWidth,
    innerHeight,
    scrollX,
    scrollLeft: document.scrollingElement?.scrollLeft || 0,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    shell: rect(shell),
    sidebar: rect(sidebar),
    main: rect(main),
    brand: rect(brand),
    labels
  };
})()`;

const adversarialExpression = `(async () => {
  window.scrollTo(0, window.scrollY);
  const probe = document.createElement('div');
  probe.id = 'rdl-horizontal-overflow-probe';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:0;top:0;width:calc(100vw + 400px);height:1px;pointer-events:none;opacity:0;';
  document.body.appendChild(probe);
  window.scrollTo(180, window.scrollY);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const result = {
    scrollX,
    scrollLeft: document.scrollingElement?.scrollLeft || 0,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  };
  probe.remove();
  window.scrollTo(0, window.scrollY);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return result;
})()`;

function expectedSidebar(profile) {
  if (profile.width <= 820) return null;
  if (profile.width <= 1060) return { min: 212, max: 220 };
  if (profile.width <= 1240) return { min: 240, max: 248 };
  return { min: 270, max: 278 };
}

function assertGeometry(profile, metrics, adversarial) {
  const failures = [];
  const epsilon = 2;
  const expected = expectedSidebar(profile);

  if (Math.abs(Number(metrics.scrollX || 0)) > epsilon || Math.abs(Number(metrics.scrollLeft || 0)) > epsilon) {
    failures.push(`viewport déjà décalé: scrollX=${metrics.scrollX}, scrollLeft=${metrics.scrollLeft}`);
  }
  if (Math.abs(Number(metrics.shell?.x || 0)) > epsilon) failures.push(`shell.x=${metrics.shell?.x}`);
  if (Math.abs(Number(metrics.sidebar?.x || 0)) > epsilon) failures.push(`sidebar.x=${metrics.sidebar?.x}`);

  if (profile.width > 820) {
    if (!expected || Number(metrics.sidebar?.width || 0) < expected.min || Number(metrics.sidebar?.width || 0) > expected.max) {
      failures.push(`sidebar.width=${metrics.sidebar?.width}, attendu ${expected?.min}-${expected?.max}`);
    }
    if (Math.abs(Number(metrics.sidebar?.right || 0) - Number(metrics.main?.x || 0)) > epsilon) {
      failures.push(`jointure sidebar/main: ${metrics.sidebar?.right} != ${metrics.main?.x}`);
    }
    if (Number(metrics.brand?.x || -1) < -epsilon || Number(metrics.brand?.right || Infinity) > Number(metrics.sidebar?.right || 0) + epsilon) {
      failures.push('marque Watteau coupée par la sidebar');
    }
    for (const entry of metrics.labels || []) {
      if (!entry.label || entry.label.x < -epsilon || entry.label.right > Number(metrics.sidebar?.right || 0) + epsilon) {
        failures.push(`libellé nav hors sidebar: ${entry.view} (${entry.text})`);
      }
    }
  }

  if (Math.abs(Number(adversarial.scrollX || 0)) > epsilon || Math.abs(Number(adversarial.scrollLeft || 0)) > epsilon) {
    failures.push(`dérive horizontale possible sous overflow forcé: scrollX=${adversarial.scrollX}, scrollLeft=${adversarial.scrollLeft}`);
  }

  if (failures.length) throw new Error(`${profile.name}: ${failures.join(' ; ')}`);
}

async function inspectProfile(cdp, profile) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: profile.width,
    screenHeight: profile.height,
    positionX: 0,
    positionY: 0,
    dontSetVisibleSize: false
  });
  await wait(260);
  await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0); true', returnByValue: true });
  await wait(80);

  const geometryResult = await cdp.send('Runtime.evaluate', { expression: geometryExpression, returnByValue: true });
  const metrics = geometryResult.result?.value;
  if (!metrics) throw new Error(`Mesures indisponibles pour ${profile.name}.`);

  const adversarialResult = await cdp.send('Runtime.evaluate', {
    expression: adversarialExpression,
    returnByValue: true,
    awaitPromise: true
  });
  const adversarial = adversarialResult.result?.value || {};
  assertGeometry(profile, metrics, adversarial);

  let screenshot = null;
  let screenshotBytes = 0;
  if (profile.capture) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const png = Buffer.from(shot.data || '', 'base64');
    screenshot = `home-${profile.name}-${profile.width}x${profile.height}.png`;
    screenshotBytes = png.length;
    fs.writeFileSync(path.join(outDir, screenshot), png);
    if (png.length < 5000) throw new Error(`${profile.name}: capture PNG trop petite (${png.length} octets)`);
  }

  return { ...profile, metrics, adversarial, screenshot, screenshotBytes };
}

const target = await discoverPageTarget();
const cdp = new CdpSession(target.webSocketDebuggerUrl);
await cdp.connect();

try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const profiles = [];
  profiles.push(await inspectProfile(cdp, { name: 'physical-wide', width: 1768, height: 1005, capture: true }));
  profiles.push(await inspectProfile(cdp, { name: 'desktop', width: 1440, height: 900 }));
  profiles.push(await inspectProfile(cdp, { name: 'desktop-breakpoint', width: 1240, height: 800 }));
  profiles.push(await inspectProfile(cdp, { name: 'reduced', width: 1024, height: 720 }));
  profiles.push(await inspectProfile(cdp, { name: 'compact', width: 760, height: 760 }));
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  const evidence = {
    format: 1,
    gate: 'R4-P3b-horizontal-drift',
    capturedAt: new Date().toISOString(),
    profiles
  };
  fs.writeFileSync(path.join(outDir, 'horizontal-drift-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`R4_P3B_HORIZONTAL_DRIFT_GREEN ${JSON.stringify(profiles.map((p) => ({
    name: p.name,
    width: p.width,
    sidebarWidth: p.metrics?.sidebar?.width || 0,
    scrollX: p.metrics?.scrollX || 0,
    forcedScrollX: p.adversarial?.scrollX || 0,
    screenshot: p.screenshot
  })))}`);
} finally {
  cdp.close();
}
