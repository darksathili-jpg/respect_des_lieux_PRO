import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('--port', '9444'));
const outDir = path.resolve(arg('--out', 'artifacts/r3-packaged-e2e'));
const fixture = JSON.parse(fs.readFileSync(path.resolve(arg('--fixture', path.join(outDir, 'fixture.json'))), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evidence = { format: 2, startedAt: new Date().toISOString(), fixture, steps: [] };
const record = (name, detail = {}) => {
  evidence.steps.push({ name, at: new Date().toISOString(), ...detail });
  console.log(`R3_E2E_STEP ${name} ${JSON.stringify(detail)}`);
};

async function discoverTarget() {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  let lastError = null;
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
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
      let text = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString('utf8');
      let payload; try { payload = JSON.parse(text); } catch { return; }
      if (!payload.id || !this.pending.has(payload.id)) return;
      const p = this.pending.get(payload.id); clearTimeout(p.timer); this.pending.delete(payload.id);
      if (payload.error) p.reject(new Error(payload.error.message || 'Erreur CDP')); else p.resolve(payload.result || {});
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
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`Exception renderer: ${r.exceptionDetails.text || 'inconnue'}`);
  return r.result?.value;
}
async function waitFor(cdp, expression, label, timeout = 12000) {
  const end = Date.now() + timeout; let last = null;
  while (Date.now() < end) {
    try { last = await evaluate(cdp, expression); if (last) return last; } catch (e) { last = e.message; }
    await wait(120);
  }
  throw new Error(`Attente expirée: ${label}; dernière valeur=${JSON.stringify(last)}`);
}
async function click(cdp, selector) {
  const ok = await evaluate(cdp, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return false; e.click(); return true; })()`);
  if (!ok) throw new Error(`Contrôle introuvable: ${selector}`);
}
async function fill(cdp, selector, value) {
  const ok = await evaluate(cdp, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return false; e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  if (!ok) throw new Error(`Champ introuvable: ${selector}`);
}
async function shot(cdp, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(r.data || '', 'base64');
  fs.writeFileSync(path.join(outDir, name), bytes);
  if (bytes.length < 5000) throw new Error(`Capture trop petite: ${name}`);
  return { file: name, bytes: bytes.length };
}
async function queryTotal(cdp, query = '') {
  return evaluate(cdp, `window.rdl.querySignalements({query:${JSON.stringify(query)},limit:1,offset:0,includeIdentities:false}).then(r=>r.total)`);
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900, positionX: 0, positionY: 0, dontSetVisibleSize: false });
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell prête');
  const baseline = await queryTotal(cdp);
  if (baseline !== fixture.seededSignalements) throw new Error(`Fixture inattendue: ${baseline}`);
  record('fixture-loaded', { total: baseline });

  await click(cdp, '#app-shell .nav[data-view="signalements"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='signalements'`, 'vue Signalements');
  await click(cdp, '#new-signalement');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open===true`, 'dialog création');
  await click(cdp, '#signal-dialog [data-signal-cancel]');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open===false`, 'annulation');
  if (await queryTotal(cdp) !== baseline) throw new Error('Annulation a écrit dans la base.');
  await waitFor(cdp, `document.activeElement?.id==='new-signalement'`, 'focus restitué');
  record('cancel-create-without-write', { focus: 'new-signalement' });

  await click(cdp, '#new-signalement');
  await fill(cdp, '#signal-form [name="date"]', '2026-09-25');
  await fill(cdp, '#signal-form [name="heure"]', '14:30');
  await fill(cdp, '#signal-form [name="lieu"]', fixture.createLieu);
  await fill(cdp, '#signal-form [name="type"]', 'Dégradation test E2E');
  await fill(cdp, '#signal-form [name="gravite"]', 'Mineure');
  await fill(cdp, '#signal-form [name="description"]', 'Création contrôlée depuis le véritable renderer empaqueté.');
  await click(cdp, '#save-signalement');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open===false`, 'création terminée');
  const rows = await evaluate(cdp, `window.rdl.querySignalements({query:${JSON.stringify(fixture.createLieu)},limit:20,offset:0,includeIdentities:false}).then(r=>r.rows)`);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Création non retrouvée: ${JSON.stringify(rows)}`);
  const created = rows[0]; record('create', { id: created.id, num: created.num });

  await fill(cdp, '#signal-search', fixture.createLieu);
  await waitFor(cdp, `document.querySelector('#signalements-body')?.innerText.includes(${JSON.stringify(fixture.createLieu)})`, 'ligne créée');
  await click(cdp, `#signalements-body button[data-fiche-id="${created.id}"]`);
  await waitFor(cdp, `document.querySelector('#signal-detail-dialog')?.open===true`, 'fiche ouverte');
  record('consult-detail', { title: await evaluate(cdp, `document.querySelector('#signal-detail-title')?.textContent||''`) });
  await click(cdp, '#signal-detail-dialog [data-edit-signalement]');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.dataset.mode==='edit' && document.querySelector('#signal-dialog')?.open===true`, 'éditeur');
  await fill(cdp, '#signal-form [name="lieu"]', fixture.editedLieu);
  await click(cdp, '#save-signalement');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open===false`, 'édition terminée');
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d=>d.signalement.lieu===${JSON.stringify(fixture.editedLieu)})`, 'édition persistée');
  record('edit', { lieu: fixture.editedLieu });

  await fill(cdp, '#signal-search', fixture.editedLieu);
  await waitFor(cdp, `document.querySelector('#signalements-body')?.innerText.includes(${JSON.stringify(fixture.editedLieu)})`, 'ligne éditée');
  await click(cdp, `#signalements-body button[data-photo="${created.id}"]`);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d=>d.photos.length===1)`, 'photo ajoutée', 15000);
  const detailWithPhoto = await evaluate(cdp, `window.rdl.getSignalementDetail(${created.id})`);
  const photoId = detailWithPhoto.photos[0]?.id;
  if (!photoId) throw new Error('Photo sans identifiant.');
  record('attach-photo-through-production-handler', { photoId });

  await click(cdp, `#signalements-body button[data-fiche-id="${created.id}"]`);
  await waitFor(cdp, `document.querySelector('#signal-detail-dialog')?.open===true`, 'fiche photo');
  await evaluate(cdp, `(() => { window.__r3OriginalConfirm=window.confirm; window.__r3ConfirmCount=0; window.confirm=()=>{window.__r3ConfirmCount++;return true}; return true; })()`);
  await click(cdp, `#signal-detail-dialog [data-detail-remove-photo="${photoId}"]`);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d=>d.photos.length===0)`, 'photo retirée');
  const confirms = await evaluate(cdp, `window.__r3ConfirmCount||0`);
  await evaluate(cdp, `(() => { window.confirm=window.__r3OriginalConfirm; delete window.__r3OriginalConfirm; return true; })()`);
  if (confirms !== 1) throw new Error(`Confirmation retrait photo: ${confirms}`);
  record('remove-photo', { confirmCount: confirms });

  await click(cdp, '#signal-detail-dialog [data-detail-close]');
  await fill(cdp, '#signal-search', fixture.editedLieu);
  await waitFor(cdp, `document.querySelector('#signalements-body [data-set-status="${created.id}"]')!=null`, 'statut visible');
  await click(cdp, `#signalements-body [data-set-status="${created.id}"]`);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d=>d.signalement.statut==='Clos')`, 'clos');
  const closed = await evaluate(cdp, `window.rdl.getSignalementDetail(${created.id})`);
  if (!closed.signalement.closed_at) throw new Error('closed_at absent');
  await waitFor(cdp, `document.querySelector('#signalements-body [data-edit-signalement="${created.id}"]')?.disabled===true`, 'édition verrouillée');
  record('close', { closedAt: closed.signalement.closed_at });
  await click(cdp, `#signalements-body [data-set-status="${created.id}"]`);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d=>d.signalement.statut==='Ouvert')`, 'rouvert');
  record('reopen');

  await fill(cdp, '#signal-search', fixture.deepSearchTerm);
  await waitFor(cdp, `document.querySelector('#signalements-body')?.innerText.includes(${JSON.stringify(fixture.deepSearchTerm)})`, 'recherche >500');
  const text = await evaluate(cdp, `document.querySelector('#signalements-body')?.innerText||''`);
  if (!text.includes('2025-0001')) throw new Error(`Dossier profond inattendu: ${text}`);
  record('search-beyond-500', { num: '2025-0001' });

  const screenshot = await shot(cdp, 'r3-signalements-final.png'); record('screenshot', screenshot);
  evidence.ok = true; evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'r3-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`R3_PACKAGED_E2E_PASS ${JSON.stringify({ createdId: created.id, steps: evidence.steps.length, screenshot })}`);
} catch (error) {
  evidence.ok = false; evidence.finishedAt = new Date().toISOString(); evidence.error = error?.stack || String(error);
  try { await shot(cdp, 'r3-signalements-failure.png'); } catch {}
  fs.writeFileSync(path.join(outDir, 'r3-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch {}
  cdp.close();
}
