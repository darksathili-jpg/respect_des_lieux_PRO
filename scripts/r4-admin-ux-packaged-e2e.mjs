import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('--port', '9444'));
const outDir = path.resolve(arg('--out', 'artifacts/r4-packaged-e2e'));
fs.mkdirSync(outDir, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = { format: 1, startedAt: new Date().toISOString(), checks: [], screenshots: [] };
const viewports = [
  { width: 1024, height: 768, label: '1024x768' },
  { width: 1280, height: 720, label: '1280x720' },
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1440, height: 900, label: '1440x900' },
  { width: 1920, height: 1080, label: '1920x1080' }
];
const views = ['sauvegardes', 'confidentialite', 'systeme'];

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
    } catch (error) { lastError = error; }
    await wait(250);
  }
  throw new Error(`Renderer CDP introuvable: ${lastError?.message || 'timeout'}`);
}

class Cdp {
  constructor(url) { this.url = url; this.socket = null; this.nextId = 1; this.pending = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connexion CDP expirée')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Connexion CDP impossible')); }, { once: true });
    });
    this.socket.addEventListener('message', async (event) => {
      const text = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString('utf8');
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
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Commande CDP expirée: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.socket?.close(); } catch {} }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`Exception renderer: ${result.exceptionDetails.text || 'inconnue'}`);
  return result.result?.value;
}

async function waitFor(cdp, expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(cdp, expression);
      if (last) return last;
    } catch (error) { last = error.message; }
    await wait(120);
  }
  throw new Error(`Attente expirée: ${label}; dernière valeur=${JSON.stringify(last)}`);
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return false; e.click(); return true; })()`);
  if (!ok) throw new Error(`Contrôle introuvable: ${selector}`);
}

async function shot(cdp, name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
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
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell prête');

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
      await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView===${JSON.stringify(view)}`, `vue ${view}`);
      await wait(80);

      const geometry = await evaluate(cdp, `(() => {
        const active=document.querySelector('#view-${view}');
        const doc=document.documentElement;
        const tables=[...active.querySelectorAll('.table-wrap')].map((node)=>({
          clientWidth:node.clientWidth,
          scrollWidth:node.scrollWidth,
          contained:node.getBoundingClientRect().right<=innerWidth+1
        }));
        const actionable=[...active.querySelectorAll('button:not([hidden]), input:not([type="hidden"]), select, textarea')]
          .filter((node)=>getComputedStyle(node).display!=='none' && getComputedStyle(node).visibility!=='hidden')
          .map((node)=>{const r=node.getBoundingClientRect();return {id:node.id||'',width:r.width,height:r.height,right:r.right,left:r.left};});
        return {
          viewport:{width:innerWidth,height:innerHeight},
          documentOverflow:doc.scrollWidth-doc.clientWidth,
          activeOverflow:active.scrollWidth-active.clientWidth,
          activeRect:active.getBoundingClientRect().toJSON(),
          tables,
          controlsOutside:actionable.filter((item)=>item.right>innerWidth+1 || item.left<-1),
          undersizedButtons:actionable.filter((item)=>item.id && document.getElementById(item.id)?.tagName==='BUTTON' && item.height<39)
        };
      })()`);

      if (geometry.documentOverflow > 0) throw new Error(`${viewport.label}/${view}: débordement document ${geometry.documentOverflow}px`);
      if (geometry.controlsOutside.length) throw new Error(`${viewport.label}/${view}: contrôle hors viewport ${JSON.stringify(geometry.controlsOutside)}`);
      if (geometry.undersizedButtons.length) throw new Error(`${viewport.label}/${view}: bouton trop bas ${JSON.stringify(geometry.undersizedButtons)}`);
      if (geometry.tables.some((table) => !table.contained)) throw new Error(`${viewport.label}/${view}: table-wrap hors viewport`);

      const file = `r4-ux-${view}-${viewport.label}.png`;
      await shot(cdp, file);
      evidence.checks.push({ viewport: viewport.label, view, geometry });
      console.log(`R4_ADMIN_UX_STEP ${viewport.label}/${view} ${JSON.stringify({ overflow: geometry.documentOverflow, tables: geometry.tables.length })}`);
    }
  }

  await click(cdp, '#app-shell .nav[data-view="confidentialite"]');
  const focusState = await evaluate(cdp, `(() => {
    const field=document.querySelector('#rights-query');
    field.focus();
    const style=getComputedStyle(field);
    return {
      active:document.activeElement===field,
      focusVisible:field.matches(':focus-visible'),
      outlineWidth:parseFloat(style.outlineWidth)||0,
      outlineStyle:style.outlineStyle
    };
  })()`);
  if (!focusState.active || !focusState.focusVisible || focusState.outlineWidth < 2 || focusState.outlineStyle === 'none') {
    throw new Error(`Focus clavier non perceptible: ${JSON.stringify(focusState)}`);
  }
  evidence.focus = focusState;

  const output = path.join(outDir, 'r4-admin-ux-evidence.json');
  fs.writeFileSync(output, JSON.stringify({ ...evidence, finishedAt: new Date().toISOString() }, null, 2));
  console.log(`R4_ADMIN_UX_PACKAGED_E2E_PASS ${JSON.stringify({ viewports: viewports.length, views: views.length, screenshots: evidence.screenshots.length, focusVisible: true })}`);
} finally {
  cdp.close();
}
