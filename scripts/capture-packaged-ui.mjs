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
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Connexion CDP impossible.'));
      }, { once: true });
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
      const { resolve, reject, timer } = this.pending.get(payload.id);
      clearTimeout(timer);
      this.pending.delete(payload.id);
      if (payload.error) reject(new Error(`${payload.error.message || 'Erreur CDP'} (${payload.error.code || 'sans code'})`));
      else resolve(payload.result || {});
    });

    this.socket.addEventListener('close', () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('Session CDP fermée avant la réponse.'));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Session CDP non ouverte pour ${method}.`));
    }
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

const metricsExpression = `(() => {
  document.querySelector('#app-shell .nav[data-view="dashboard"]')?.click();
  const shell = document.querySelector('#app-shell');
  const sidebar = shell?.querySelector(':scope > .sidebar');
  const main = shell?.querySelector(':scope > .main');
  const topbar = document.querySelector('.topbar');
  const hero = document.querySelector('#view-dashboard .hero');
  const brandMark = document.querySelector('.brand-mark');
  const heroAfter = hero ? getComputedStyle(hero, '::after') : null;
  const rect = (node) => node ? ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, right: node.getBoundingClientRect().right, bottom: node.getBoundingClientRect().bottom }) : null;
  return {
    viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight },
    scroll: { documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, documentHeight: document.documentElement.scrollHeight },
    shellCount: document.querySelectorAll('#app-shell').length,
    activeView: shell?.dataset.activeView || '',
    shell: rect(shell),
    sidebar: rect(sidebar),
    main: rect(main),
    topbar: rect(topbar),
    hero: rect(hero),
    kpiCount: document.querySelectorAll('#view-dashboard .kpi').length,
    visibleKpiCount: [...document.querySelectorAll('#view-dashboard .kpi')].filter((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length,
    brandAsset: brandMark ? getComputedStyle(brandMark).backgroundImage : '',
    heroAsset: heroAfter?.backgroundImage || '',
    heroAssetOpacity: heroAfter?.opacity || '',
    media: { max1220: matchMedia('(max-width:1220px)').matches, max980: matchMedia('(max-width:980px)').matches, max640: matchMedia('(max-width:640px)').matches }
  };
})()`;

function assertProfile(profile, metrics, screenshotBytes) {
  const layoutWidth = Number(metrics.viewport?.clientWidth || 0);
  const maxScrollWidth = Math.max(Number(metrics.scroll?.documentWidth || 0), Number(metrics.scroll?.bodyWidth || 0));
  const failures = [];
  if (metrics.shellCount !== 1) failures.push(`shellCount=${metrics.shellCount}`);
  if (metrics.activeView !== 'dashboard') failures.push(`activeView=${metrics.activeView}`);
  if (metrics.kpiCount !== 4 || metrics.visibleKpiCount !== 4) failures.push(`kpis=${metrics.visibleKpiCount}/${metrics.kpiCount}`);
  if (!String(metrics.brandAsset || '').includes('sidebar-logo-production.svg')) failures.push('logo SVG absent');
  if (!String(metrics.heroAsset || '').includes('dashboard-hero-production.svg')) failures.push('hero SVG absent');
  if (maxScrollWidth > layoutWidth + 2) failures.push(`overflow horizontal ${maxScrollWidth}>${layoutWidth}`);
  if (Math.abs(Number(metrics.sidebar?.right || 0) - Number(metrics.main?.x || 0)) > 2) failures.push('jointure sidebar/main incorrecte');
  if (Number(metrics.hero?.width || 0) < 300 || Number(metrics.hero?.height || 0) < 180) failures.push('hero non exploitable');
  if (screenshotBytes < 5000) failures.push(`capture PNG trop petite (${screenshotBytes} octets)`);
  if (profile.name === 'desktop' && metrics.media?.max1220) failures.push('profil desktop tombé sous 1220px');
  if (profile.name === 'reduced' && !metrics.media?.max1220) failures.push('profil réduit hors breakpoint <=1220px');
  if (failures.length) throw new Error(`${profile.name}: ${failures.join(' ; ')}`);
}

async function captureProfile(cdp, profile) {
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
  await wait(350);

  const evaluated = await cdp.send('Runtime.evaluate', {
    expression: metricsExpression,
    returnByValue: true,
    awaitPromise: true
  });
  const metrics = evaluated.result?.value;
  if (!metrics) throw new Error(`Mesures indisponibles pour ${profile.name}.`);

  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  const png = Buffer.from(shot.data || '', 'base64');
  const file = path.join(outDir, `home-${profile.name}-${profile.width}x${profile.height}.png`);
  fs.writeFileSync(file, png);
  assertProfile(profile, metrics, png.length);
  return { ...profile, screenshot: path.basename(file), screenshotBytes: png.length, metrics };
}

async function captureKeyboardFocus(cdp) {
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const active = document.activeElement; if (active && typeof active.blur === 'function') active.blur(); document.body.setAttribute('tabindex','-1'); document.body.focus(); return true; })()`,
    returnByValue: true
  });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await wait(150);

  const evaluated = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const el = document.activeElement; const style = el ? getComputedStyle(el) : null; return { tag: el?.tagName || '', id: el?.id || '', className: typeof el?.className === 'string' ? el.className : '', dataView: el?.dataset?.view || '', text: (el?.textContent || '').trim().slice(0,80), focusVisible: Boolean(el?.matches?.(':focus-visible')), outline: style?.outline || '', boxShadow: style?.boxShadow || '' }; })()`,
    returnByValue: true
  });
  const focus = evaluated.result?.value || {};
  if (!focus.tag || !focus.focusVisible) throw new Error(`Focus clavier non visible: ${JSON.stringify(focus)}`);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const png = Buffer.from(shot.data || '', 'base64');
  const file = path.join(outDir, 'home-desktop-keyboard-focus.png');
  fs.writeFileSync(file, png);
  return { ...focus, screenshot: path.basename(file), screenshotBytes: png.length };
}

const target = await discoverPageTarget();
const cdp = new CdpSession(target.webSocketDebuggerUrl);
await cdp.connect();

try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const profiles = [];
  profiles.push(await captureProfile(cdp, { name: 'desktop', width: 1440, height: 900 }));
  const focus = await captureKeyboardFocus(cdp);
  profiles.push(await captureProfile(cdp, { name: 'reduced', width: 1024, height: 720 }));
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  const evidence = {
    format: 1,
    capturedAt: new Date().toISOString(),
    target: { title: target.title || '', url: target.url || '', type: target.type || '' },
    profiles,
    keyboardFocus: focus
  };
  fs.writeFileSync(path.join(outDir, 'visual-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`RDL_VISUAL_EVIDENCE_PASS ${JSON.stringify({ outDir, profiles: profiles.map((p) => ({ name: p.name, width: p.width, height: p.height, screenshotBytes: p.screenshotBytes })), keyboardFocus: focus })}`);
} finally {
  cdp.close();
}
