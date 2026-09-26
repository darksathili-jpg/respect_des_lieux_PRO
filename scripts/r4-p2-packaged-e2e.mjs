import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('--port', '9554'));
const outDir = path.resolve(arg('--out', 'artifacts/r4-packaged-e2e'));
const fixture = JSON.parse(fs.readFileSync(path.resolve(arg('--fixture', path.join(outDir, 'fixture.json'))), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = { format: 1, startedAt: new Date().toISOString(), fixture, steps: [], screenshots: [] };
const record = (name, detail = {}) => {
  evidence.steps.push({ name, at: new Date().toISOString(), ...detail });
  console.log(`R4_P2_E2E_STEP ${name} ${JSON.stringify(detail)}`);
};

async function discoverTarget() {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  let lastError = null;
  for (let i = 0; i < 100; i += 1) {
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
  throw new Error(`Renderer CDP R4-P2 introuvable: ${lastError?.message || 'timeout'}`);
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
      let payload; try { payload = JSON.parse(text); } catch { return; }
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

async function waitFor(cdp, expression, label, timeout = 12000) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    try { last = await evaluate(cdp, expression); if (last) return last; } catch (error) { last = error.message; }
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

async function screenshot(cdp, name, state) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(shot.data || '', 'base64');
  if (bytes.length < 5000) throw new Error(`Capture trop petite: ${name}`);
  fs.writeFileSync(path.join(outDir, name), bytes);
  const item = { file: name, bytes: bytes.length, state };
  evidence.screenshots.push(item);
  return item;
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell R4-P2 prêt', 15000);

  // 1. Le parent ne peut pas être clos tant que sa réparation est active.
  await click(cdp, '#app-shell .nav[data-view="signalements"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='signalements'`, 'vue Signalements');
  await fill(cdp, '#signal-search', fixture.closableSignalementNum);
  const closeSelector = `#signalements-body [data-set-status="${fixture.closableSignalementId}"][data-status-target="Clos"]`;
  await waitFor(cdp, `document.querySelector(${JSON.stringify(closeSelector)})!=null`, 'action Clore du dossier garde');
  await click(cdp, closeSelector);
  await waitFor(cdp, `document.querySelector('#toast')?.classList.contains('show') && /Impossible de clore|réparation.*en cours/i.test(document.querySelector('#toast')?.textContent||'')`, 'message de refus de clôture');
  const refused = await evaluate(cdp, `window.rdl.getSignalementDetail(${fixture.closableSignalementId}).then(d=>({status:d.signalement.statut, repair:d.reparations.find(r=>r.id===${fixture.closableRepairId})?.statut, toast:document.querySelector('#toast')?.textContent||''}))`);
  if (refused.status !== 'Ouvert' || refused.repair !== 'En cours') throw new Error(`Clôture active non bloquée: ${JSON.stringify(refused)}`);
  record('close-refused-with-active-repair', refused);
  record('close-refused-screenshot', await screenshot(cdp, 'r4-p2-close-refused.png', 'close-refused-active-repair'));

  // 2. Une fois la réparation terminale, la clôture du parent devient légitime.
  await click(cdp, '#app-shell .nav[data-view="reparations"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='reparations'`, 'vue Réparations');
  await fill(cdp, '#repair-search', fixture.closableRepairMeasure);
  const finishSelector = `#reparations-body [data-repair-status="${fixture.closableRepairId}"][data-repair-status-target="Terminée"]`;
  await waitFor(cdp, `document.querySelector(${JSON.stringify(finishSelector)})!=null`, 'action Terminer réparation garde');
  await click(cdp, finishSelector);
  await waitFor(cdp, `window.rdl.getReparation(${fixture.closableRepairId}).then(r=>r?.statut==='Terminée')`, 'réparation garde terminée');

  await click(cdp, '#app-shell .nav[data-view="signalements"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='signalements'`, 'retour Signalements');
  await fill(cdp, '#signal-search', fixture.closableSignalementNum);
  await waitFor(cdp, `document.querySelector(${JSON.stringify(closeSelector)})!=null`, 'action Clore après résolution');
  await click(cdp, closeSelector);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${fixture.closableSignalementId}).then(d=>d.signalement.statut==='Clos')`, 'clôture parent après réparations terminales');
  record('close-allowed-after-terminal-repairs');

  // 3. Dans Réparations, le verrou parent est explicite et possède une sortie.
  await click(cdp, '#app-shell .nav[data-view="reparations"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='reparations'`, 'retour Réparations');
  await fill(cdp, '#repair-search', fixture.closableRepairMeasure);
  const rowSelector = `#reparations-body tr[data-reparation-id="${fixture.closableRepairId}"]`;
  await waitFor(cdp, `document.querySelector(${JSON.stringify(rowSelector)})?.dataset.parentStatus==='Clos'`, 'ligne parent clos');
  const locked = await evaluate(cdp, `(() => { const row=document.querySelector(${JSON.stringify(rowSelector)}); return { lock:(row?.querySelector('.repair-parent-lock')?.textContent||'').trim(), editDisabled:row?.querySelector('[data-edit-repair]')?.disabled===true, statusDisabled:[...row?.querySelectorAll('[data-repair-status]')||[]].every(b=>b.disabled), reopen:!!row?.querySelector('[data-reopen-parent="${fixture.closableSignalementId}"]') }; })()`);
  if (!/Dossier parent clos/.test(locked.lock) || !locked.editDisabled || !locked.statusDisabled || !locked.reopen) {
    throw new Error(`Verrou parent insuffisamment explicite: ${JSON.stringify(locked)}`);
  }
  record('closed-parent-explicit-lock', locked);
  record('closed-parent-explicit-screenshot', await screenshot(cdp, 'r4-p2-parent-closed-explicit.png', 'closed-parent-explicit-lock'));

  // 4. Rouvrir le parent restaure le suivi sans mutation silencieuse de la réparation.
  const reopenParentSelector = `${rowSelector} [data-reopen-parent="${fixture.closableSignalementId}"]`;
  await click(cdp, reopenParentSelector);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${fixture.closableSignalementId}).then(d=>d.signalement.statut==='Ouvert')`, 'parent rouvert');
  await waitFor(cdp, `document.querySelector(${JSON.stringify(rowSelector)})?.dataset.parentStatus==='Ouvert' && document.querySelector(${JSON.stringify(rowSelector)})?.querySelector('[data-edit-repair]:not([disabled])')!=null`, 'actions réparation restaurées');
  const reopenRepairSelector = `${rowSelector} [data-repair-status-target="En cours"]`;
  await waitFor(cdp, `document.querySelector(${JSON.stringify(reopenRepairSelector)})!=null`, 'action Rouvrir réparation restaurée');
  await click(cdp, reopenRepairSelector);
  await waitFor(cdp, `window.rdl.getReparation(${fixture.closableRepairId}).then(r=>r?.statut==='En cours' && !r?.cloture)`, 'réparation reprise après réouverture parent');
  record('parent-reopen-restores-repair-work');

  // 5. Une base legacy déjà incohérente dispose elle aussi d'un chemin de récupération.
  await fill(cdp, '#repair-search', fixture.closedRepairMeasure);
  const legacyRow = `#reparations-body tr[data-reparation-id="${fixture.closedRepairId}"]`;
  await waitFor(cdp, `document.querySelector(${JSON.stringify(legacyRow)})?.dataset.parentStatus==='Clos'`, 'cas legacy parent clos');
  const legacyReopen = `${legacyRow} [data-reopen-parent="${fixture.closedSignalementId}"]`;
  await waitFor(cdp, `document.querySelector(${JSON.stringify(legacyReopen)})!=null`, 'sortie explicite legacy');
  await click(cdp, legacyReopen);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${fixture.closedSignalementId}).then(d=>d.signalement.statut==='Ouvert')`, 'parent legacy rouvert');
  await waitFor(cdp, `document.querySelector(${JSON.stringify(legacyRow)})?.querySelector('[data-edit-repair]:not([disabled])')!=null`, 'réparation legacy de nouveau éditable');
  record('legacy-inconsistent-data-recoverable');
  record('recovery-screenshot', await screenshot(cdp, 'r4-p2-recovery.png', 'legacy-and-parent-recovery'));

  evidence.ok = true;
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'r4-p2-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`R4_P2_PACKAGED_E2E_PASS ${JSON.stringify({ steps: evidence.steps.length, screenshots: evidence.screenshots.length })}`);
} catch (error) {
  evidence.ok = false;
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error?.stack || String(error);
  try { await screenshot(cdp, 'r4-p2-failure.png', 'failure'); } catch {}
  fs.writeFileSync(path.join(outDir, 'r4-p2-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch {}
  cdp.close();
}
