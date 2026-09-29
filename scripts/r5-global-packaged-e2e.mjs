import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('--port', '9444'));
const outDir = path.resolve(arg('--out', 'artifacts/r5-global-e2e'));
fs.mkdirSync(outDir, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const viewports = [
  { width: 1024, height: 768, label: '1024x768' },
  { width: 1280, height: 720, label: '1280x720' },
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1440, height: 900, label: '1440x900' },
  { width: 1920, height: 1080, label: '1920x1080' }
];
const views = ['dashboard', 'signalements', 'reparations', 'sauvegardes', 'confidentialite', 'systeme'];
const evidence = {
  format: 1,
  startedAt: new Date().toISOString(),
  viewports,
  views,
  checks: [],
  focusChecks: [],
  screenshots: []
};

async function discoverTarget() {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  let lastError = null;
  for (let i = 0; i < 80; i += 1) {
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
  throw new Error(`Renderer CDP introuvable: ${lastError?.message || 'timeout'}`);
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connexion CDP expirée')), 10000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Connexion CDP impossible'));
      }, { once: true });
    });

    this.socket.addEventListener('message', async (event) => {
      const text = typeof event.data === 'string'
        ? event.data
        : Buffer.from(await event.data.arrayBuffer()).toString('utf8');
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        return;
      }
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
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(`Exception renderer: ${result.exceptionDetails.text || 'inconnue'}`);
  }
  return result.result?.value;
}

async function waitFor(cdp, expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(cdp, expression);
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await wait(120);
  }
  throw new Error(`Attente expirée: ${label}; dernière valeur=${JSON.stringify(last)}`);
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, `(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return false;
    e.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Contrôle introuvable: ${selector}`);
}

async function shot(cdp, name) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  const bytes = Buffer.from(result.data || '', 'base64');
  if (bytes.length < 5000) throw new Error(`Capture trop petite: ${name}`);
  fs.writeFileSync(path.join(outDir, name), bytes);
  evidence.screenshots.push({ file: name, bytes: bytes.length });
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();

try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady === 'true'`, 'shell prête');

  for (const viewport of viewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height
    });
    await wait(150);

    for (const view of views) {
      await click(cdp, `#app-shell .nav[data-view="${view}"]`);
      await waitFor(
        cdp,
        `document.querySelector('#app-shell')?.dataset.activeView === ${JSON.stringify(view)}`,
        `vue ${view}`
      );
      await wait(100);

      const state = await evaluate(cdp, `(() => {
        const shell = document.querySelector('#app-shell');
        const active = document.querySelector('#view-${view}');
        const doc = document.documentElement;
        const navActive = [...document.querySelectorAll('#app-shell .nav.active')].map((node) => node.dataset.view);
        const panelsVisible = [...document.querySelectorAll('#app-shell [id^="view-"]')]
          .filter((node) => !node.hidden && getComputedStyle(node).display !== 'none')
          .map((node) => node.id.replace(/^view-/, ''));
        const actionable = [...active.querySelectorAll('button:not([hidden]), input:not([type="hidden"]), select, textarea, a[href]')]
          .filter((node) => {
            const style = getComputedStyle(node);
            return style.display !== 'none' && style.visibility !== 'hidden';
          })
          .map((node) => {
            const r = node.getBoundingClientRect();
            const scrollHost = node.closest('.table-wrap');
            const scrollableHost = Boolean(scrollHost && scrollHost.scrollWidth > scrollHost.clientWidth + 1);
            return {
              tag: node.tagName,
              id: node.id || '',
              className: node.className || '',
              width: r.width,
              height: r.height,
              left: r.left,
              right: r.right,
              inScrollableTable: scrollableHost
            };
          });
        const tableWraps = [...active.querySelectorAll('.table-wrap')].map((node) => ({
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          left: node.getBoundingClientRect().left,
          right: node.getBoundingClientRect().right
        }));
        const pageTitle = document.querySelector('#page-title')?.textContent?.trim() || '';
        const localTitle = active.querySelector('h2, h3')?.textContent?.trim() || '';
        return {
          activeView: shell?.dataset.activeView || null,
          navActive,
          panelsVisible,
          pageTitle,
          localTitle,
          documentOverflow: Math.max(0, doc.scrollWidth - doc.clientWidth),
          activeOverflow: Math.max(0, active.scrollWidth - active.clientWidth),
          controlsOutside: actionable.filter((item) => (item.right > innerWidth + 1 || item.left < -1) && !item.inScrollableTable),
          scrollContainedControls: actionable.filter((item) => (item.right > innerWidth + 1 || item.left < -1) && item.inScrollableTable).length,
          undersizedButtons: actionable.filter((item) => {
            if (item.tag !== 'BUTTON' || item.height <= 0) return false;
            const standardAction = String(item.className).split(/\\s+/).includes('btn');
            return standardAction ? item.height < 39 : item.height < 24;
          }),
          tableWraps,
          viewport: { width: innerWidth, height: innerHeight }
        };
      })()`);

      if (state.activeView !== view) throw new Error(`${viewport.label}/${view}: activeView=${state.activeView}`);
      if (state.navActive.length !== 1 || state.navActive[0] !== view) {
        throw new Error(`${viewport.label}/${view}: navigation incohérente ${JSON.stringify(state.navActive)}`);
      }
      if (state.panelsVisible.length !== 1 || state.panelsVisible[0] !== view) {
        throw new Error(`${viewport.label}/${view}: panneaux visibles incohérents ${JSON.stringify(state.panelsVisible)}`);
      }
      if (!state.pageTitle) throw new Error(`${viewport.label}/${view}: titre global de vue vide`);
      if (!state.localTitle) throw new Error(`${viewport.label}/${view}: titre local de vue vide`);
      if (state.documentOverflow > 0) {
        throw new Error(`${viewport.label}/${view}: débordement document ${state.documentOverflow}px`);
      }
      if (state.activeOverflow > 1) {
        throw new Error(`${viewport.label}/${view}: débordement horizontal actif ${state.activeOverflow}px`);
      }
      if (state.controlsOutside.length) {
        throw new Error(`${viewport.label}/${view}: contrôle hors viewport hors zone scrollable ${JSON.stringify(state.controlsOutside)}`);
      }
      if (state.undersizedButtons.length) {
        throw new Error(`${viewport.label}/${view}: cible bouton sous le seuil ${JSON.stringify(state.undersizedButtons)}`);
      }
      if (state.tableWraps.some((item) => item.left < -1 || item.right > innerWidth + 1)) {
        throw new Error(`${viewport.label}/${view}: table-wrap hors viewport`);
      }

      const file = `r5-global-${view}-${viewport.label}.png`;
      await shot(cdp, file);
      evidence.checks.push({ viewport: viewport.label, view, state });
      console.log(`R5_GLOBAL_VIEWPORT_STEP ${viewport.label}/${view} ${JSON.stringify({ overflow: state.documentOverflow, pageTitle: state.pageTitle, localTitle: state.localTitle, scrollContainedControls: state.scrollContainedControls })}`);
    }
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1440,
    screenHeight: 900
  });

  for (const view of views) {
    await click(cdp, `#app-shell .nav[data-view="${view}"]`);
    await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView === ${JSON.stringify(view)}`, `focus ${view}`);
    const focus = await evaluate(cdp, `(() => {
      const active = document.querySelector('#view-${view}');
      const candidate = [...active.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href]')]
        .find((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        });
      if (!candidate) return { found: false };
      candidate.focus();
      const style = getComputedStyle(candidate);
      return {
        found: true,
        active: document.activeElement === candidate,
        focusVisible: candidate.matches(':focus-visible'),
        outlineWidth: parseFloat(style.outlineWidth) || 0,
        outlineStyle: style.outlineStyle,
        tag: candidate.tagName,
        id: candidate.id || ''
      };
    })()`);

    if (!focus.found || !focus.active || !focus.focusVisible || focus.outlineWidth < 2 || focus.outlineStyle === 'none') {
      throw new Error(`Focus clavier non perceptible dans ${view}: ${JSON.stringify(focus)}`);
    }
    evidence.focusChecks.push({ view, ...focus });
  }

  const output = path.join(outDir, 'r5-global-evidence.json');
  fs.writeFileSync(output, JSON.stringify({ ...evidence, finishedAt: new Date().toISOString() }, null, 2));

  console.log(`R5_GLOBAL_PACKAGED_E2E_PASS ${JSON.stringify({
    viewports: viewports.length,
    views: views.length,
    screenshots: evidence.screenshots.length,
    focusChecks: evidence.focusChecks.length
  })}`);
} finally {
  cdp.close();
}
