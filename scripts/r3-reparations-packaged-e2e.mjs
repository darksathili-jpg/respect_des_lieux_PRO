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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = { format: 1, startedAt: new Date().toISOString(), steps: [], visualEvidence: [] };
const record = (name, detail = {}) => {
  evidence.steps.push({ name, at: new Date().toISOString(), ...detail });
  console.log(`R3_REPAIRS_E2E_STEP ${name} ${JSON.stringify(detail)}`);
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

async function waitFor(cdp, expression, label, timeout = 12000) {
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

async function fill(cdp, selector, value) {
  const ok = await evaluate(cdp, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return false; e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  if (!ok) throw new Error(`Champ introuvable: ${selector}`);
}

async function shot(cdp, name, state) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(result.data || '', 'base64');
  if (bytes.length < 5000) throw new Error(`Capture trop petite: ${name}`);
  fs.writeFileSync(path.join(outDir, name), bytes);
  const item = { file: name, bytes: bytes.length, state };
  evidence.visualEvidence.push(item);
  return item;
}

async function repairsForSignalement(cdp, signalementId) {
  return evaluate(cdp, `window.rdl.queryReparations({limit:200,offset:0,includeIdentities:true}).then(r => r.rows.filter(x => Number(x.signalement_id) === ${Number(signalementId)}))`);
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell prête');

  const signalements = await evaluate(cdp, `window.rdl.querySignalements({query:${JSON.stringify(fixture.editedLieu)},limit:20,offset:0,includeIdentities:false}).then(r=>r.rows)`);
  if (!Array.isArray(signalements) || signalements.length !== 1) throw new Error(`Signalement E2E introuvable: ${JSON.stringify(signalements)}`);
  const signalement = signalements[0];
  record('target-signalement', { id: signalement.id, num: signalement.num });

  const before = await repairsForSignalement(cdp, signalement.id);
  if (before.length !== 0) throw new Error(`Le signalement E2E possède déjà ${before.length} réparation(s).`);

  await click(cdp, '#app-shell .nav[data-view="signalements"]');
  await fill(cdp, '#signal-search', fixture.editedLieu);
  await waitFor(cdp, `document.querySelector('#signalements-body [data-repair="${signalement.id}"]')!=null`, 'action + Réparation');
  await click(cdp, `#signalements-body [data-repair="${signalement.id}"]`);
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===true && document.querySelector('#repair-dialog')?.dataset.mode==='create'`, 'dialog Réparation création');
  await waitFor(cdp, `document.activeElement?.closest('#repair-dialog') && document.activeElement?.getAttribute('name')==='mesure'`, 'focus initial Réparation');
  record('visual-create-repair', await shot(cdp, 'r3-reparations-create.png', 'repair-create-dialog'));

  await fill(cdp, '#repair-form [name="mesure"]', 'Remplacement poignée E2E');
  await fill(cdp, '#repair-form [name="referent"]', 'Référent E2E');
  await fill(cdp, '#repair-form [name="debut"]', '2026-09-28');
  await fill(cdp, '#repair-form [name="duree"]', '1 jour');
  await fill(cdp, '#repair-form [name="statut"]', 'En cours');
  await fill(cdp, '#repair-form [name="notes"]', 'Création depuis le vrai EXE packagé.');
  await click(cdp, '#repair-form button[type="submit"]');
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===false`, 'création Réparation terminée');
  await waitFor(cdp, `window.rdl.queryReparations({limit:200,offset:0,includeIdentities:true}).then(r=>r.rows.filter(x=>Number(x.signalement_id)===${Number(signalement.id)}).length===1)`, 'réparation créée');

  const createdRows = await repairsForSignalement(cdp, signalement.id);
  const repair = createdRows[0];
  if (!repair?.id) throw new Error(`Réparation créée sans identifiant: ${JSON.stringify(createdRows)}`);
  record('create-repair', { id: repair.id, mesure: repair.mesure, statut: repair.statut });

  await click(cdp, '#app-shell .nav[data-view="reparations"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='reparations'`, 'vue Réparations');
  await waitFor(cdp, `document.querySelector('#reparations-body tr[data-repair-id="${repair.id}"]')!=null`, 'ligne Réparation visible');
  record('visual-repair-row', await shot(cdp, 'r3-reparations-created-row.png', 'repair-created-row'));

  await click(cdp, `#reparations-body [data-edit-repair="${repair.id}"]`);
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===true && document.querySelector('#repair-dialog')?.dataset.mode==='edit'`, 'dialog Réparation édition');
  await waitFor(cdp, `document.querySelector('#repair-form [name="reparation_id"]')?.value==='${repair.id}'`, 'identifiant réparation conservé');
  record('visual-edit-repair', await shot(cdp, 'r3-reparations-edit.png', 'repair-edit-dialog'));

  await fill(cdp, '#repair-form [name="mesure"]', 'Remplacement poignée E2E terminé');
  await fill(cdp, '#repair-form [name="duree"]', '2 jours');
  await fill(cdp, '#repair-form [name="statut"]', 'Terminée');
  await fill(cdp, '#repair-form [name="notes"]', 'Modification persistée depuis le vrai EXE packagé.');
  await click(cdp, '#repair-form button[type="submit"]');
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===false`, 'édition Réparation terminée');
  await waitFor(cdp, `window.rdl.getReparation(${repair.id}).then(r=>r && r.mesure==='Remplacement poignée E2E terminé' && r.statut==='Terminée' && r.duree==='2 jours')`, 'édition persistée');

  const afterEdit = await repairsForSignalement(cdp, signalement.id);
  if (afterEdit.length !== 1 || Number(afterEdit[0].id) !== Number(repair.id)) {
    throw new Error(`Duplication après édition: ${JSON.stringify(afterEdit)}`);
  }
  record('edit-repair-without-duplicate', { id: repair.id, count: afterEdit.length, statut: afterEdit[0].statut });

  await evaluate(cdp, 'window.location.reload()');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell prête après rechargement', 15000);
  const afterReload = await repairsForSignalement(cdp, signalement.id);
  if (afterReload.length !== 1 || Number(afterReload[0].id) !== Number(repair.id)) {
    throw new Error(`Duplication ou perte après reload: ${JSON.stringify(afterReload)}`);
  }
  if (afterReload[0].mesure !== 'Remplacement poignée E2E terminé' || afterReload[0].statut !== 'Terminée' || afterReload[0].duree !== '2 jours') {
    throw new Error(`Valeurs non persistées après reload: ${JSON.stringify(afterReload[0])}`);
  }

  await click(cdp, '#app-shell .nav[data-view="reparations"]');
  await waitFor(cdp, `document.querySelector('#reparations-body tr[data-repair-id="${repair.id}"]')?.innerText.includes('Remplacement poignée E2E terminé')`, 'ligne persistée après reload');
  const finalText = await evaluate(cdp, `document.querySelector('#reparations-body tr[data-repair-id="${repair.id}"]')?.innerText || ''`);
  if (!finalText.includes('Terminée')) throw new Error(`Statut final absent du tableau: ${finalText}`);
  record('reload-persistence', { id: repair.id, count: afterReload.length, statut: afterReload[0].statut });
  record('visual-final-repair', await shot(cdp, 'r3-reparations-final.png', 'repair-final-after-reload'));

  evidence.ok = true;
  evidence.finishedAt = new Date().toISOString();
  evidence.repairId = repair.id;
  fs.writeFileSync(path.join(outDir, 'r3-reparations-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`R3_REPARATIONS_PACKAGED_E2E_PASS ${JSON.stringify({ signalementId: signalement.id, repairId: repair.id, count: afterReload.length, statut: afterReload[0].statut })}`);
} catch (error) {
  evidence.ok = false;
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error?.stack || String(error);
  try { await shot(cdp, 'r3-reparations-failure.png', 'failure'); } catch {}
  fs.writeFileSync(path.join(outDir, 'r3-reparations-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch {}
  cdp.close();
}
