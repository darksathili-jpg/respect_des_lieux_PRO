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
  console.log(`R4_E2E_STEP ${name} ${JSON.stringify(detail)}`);
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
  throw new Error(`Renderer CDP R4 introuvable: ${lastError?.message || 'timeout'}`);
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

async function pressKey(cdp, key) {
  const keys = {
    Escape: { code: 'Escape', vk: 27 },
    Enter: { code: 'Enter', vk: 13, text: '\r' },
    Tab: { code: 'Tab', vk: 9 }
  };
  const meta = keys[key];
  if (!meta) throw new Error(`Touche R4 non configurée: ${key}`);
  const payload = { key, code: meta.code, windowsVirtualKeyCode: meta.vk, nativeVirtualKeyCode: meta.vk };
  const down = meta.text
    ? { type: 'keyDown', ...payload, text: meta.text, unmodifiedText: meta.text }
    : { type: 'rawKeyDown', ...payload };
  await cdp.send('Input.dispatchKeyEvent', down);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...payload });
  await wait(70);
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

async function queryTotal(cdp, query = '', includeIdentities = false) {
  return evaluate(cdp, `window.rdl.queryReparations({query:${JSON.stringify(query)},limit:1,offset:0,includeIdentities:${includeIdentities}}).then(r=>r.total)`);
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });

  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell R4 prêt', 15000);
  const baseline = await queryTotal(cdp);
  if (baseline !== fixture.seededRepairs) throw new Error(`Fixture Réparations inattendue: ${baseline} au lieu de ${fixture.seededRepairs}`);
  record('fixture-loaded', { total: baseline });

  await click(cdp, '#app-shell .nav[data-view="signalements"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='signalements'`, 'vue Signalements');
  const trigger = `#signalements-body [data-repair="${fixture.openSignalementId}"]`;
  await waitFor(cdp, `document.querySelector(${JSON.stringify(trigger)})!=null`, 'bouton + Réparation');

  await evaluate(cdp, `document.querySelector(${JSON.stringify(trigger)}).focus()`);
  await pressKey(cdp, 'Enter');
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===true`, 'dialogue Réparations ouvert au clavier');
  await waitFor(cdp, `document.activeElement?.getAttribute('name')==='mesure'`, 'focus initial mesure');
  await pressKey(cdp, 'Escape');
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===false`, 'annulation Échap');
  await waitFor(cdp, `document.activeElement===document.querySelector(${JSON.stringify(trigger)})`, 'focus rendu au déclencheur');
  if (await queryTotal(cdp) !== baseline) throw new Error('Annuler la création a écrit en base.');
  record('cancel-create-without-write', { focusReturned: true });

  await click(cdp, trigger);
  await fill(cdp, '#repair-form [name="mesure"]', fixture.createMeasure);
  await fill(cdp, '#repair-form [name="duree"]', '45 min');
  await click(cdp, '#save-repair');
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===false`, 'création terminée');
  const createdRows = await evaluate(cdp, `window.rdl.queryReparations({query:${JSON.stringify(fixture.createMeasure)},limit:20,offset:0,includeIdentities:false}).then(r=>r.rows)`);
  if (!Array.isArray(createdRows) || createdRows.length !== 1) throw new Error(`Réparation créée introuvable: ${JSON.stringify(createdRows)}`);
  const created = createdRows[0];
  if (await queryTotal(cdp) !== baseline + 1) throw new Error('La création n’a pas produit exactement une écriture.');
  record('create', { id: created.id });

  await click(cdp, trigger);
  await fill(cdp, '#repair-form [name="mesure"]', 'R4-DOUBLE-SUBMIT-GUARD');
  const beforeDouble = await queryTotal(cdp);
  await evaluate(cdp, `(() => { const b=document.querySelector('#save-repair'); b.click(); b.click(); return true; })()`);
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===false`, 'double soumission terminée');
  const afterDouble = await queryTotal(cdp);
  if (afterDouble !== beforeDouble + 1) throw new Error(`Double soumission non contenue: ${beforeDouble} → ${afterDouble}`);
  record('double-submit-guard', { before: beforeDouble, after: afterDouble });

  await click(cdp, '#app-shell .nav[data-view="reparations"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='reparations'`, 'vue Réparations');
  await fill(cdp, '#repair-search', fixture.createMeasure);
  await waitFor(cdp, `document.querySelector('#reparations-body')?.innerText.includes(${JSON.stringify(fixture.createMeasure)})`, 'réparation créée dans registre');
  record('registry-visible', await screenshot(cdp, 'r4-reparations-registry.png', 'created-repair-registry'));

  const editSelector = `#reparations-body [data-edit-repair="${created.id}"]`;
  await click(cdp, editSelector);
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===true && document.querySelector('#repair-dialog')?.dataset.mode==='edit'`, 'éditeur ciblé ouvert');
  const editorState = await evaluate(cdp, `(() => ({ id:document.querySelector('#repair-form [name="reparation_id"]')?.value, measure:document.querySelector('#repair-form [name="mesure"]')?.value, referentDisabled:document.querySelector('#repair-form [name="referent"]')?.disabled }))()`);
  if (Number(editorState.id) !== Number(created.id) || editorState.measure !== fixture.createMeasure) throw new Error(`Éditeur ciblé incorrect: ${JSON.stringify(editorState)}`);
  record('targeted-editor', editorState);
  record('edit-dialog-screenshot', await screenshot(cdp, 'r4-reparations-edit-dialog.png', 'targeted-edit-dialog'));
  await fill(cdp, '#repair-form [name="mesure"]', fixture.editedMeasure);
  await click(cdp, '#save-repair');
  await waitFor(cdp, `document.querySelector('#repair-dialog')?.open===false`, 'édition terminée');
  const editedRows = await evaluate(cdp, `window.rdl.queryReparations({query:${JSON.stringify(fixture.editedMeasure)},limit:20,offset:0,includeIdentities:false}).then(r=>r.rows)`);
  if (!Array.isArray(editedRows) || editedRows.length !== 1 || Number(editedRows[0].id) !== Number(created.id)) {
    throw new Error(`Édition ciblée a dupliqué ou perdu la réparation: ${JSON.stringify(editedRows)}`);
  }
  if (await queryTotal(cdp) !== baseline + 2) throw new Error('L’édition a modifié le nombre de réparations.');
  record('edit-without-duplicate', { id: created.id });

  await fill(cdp, '#repair-search', fixture.editedMeasure);
  await waitFor(cdp, `document.querySelector('#reparations-body [data-repair-status="${created.id}"][data-repair-status-target="Terminée"]')!=null`, 'action Terminer');
  await click(cdp, `#reparations-body [data-repair-status="${created.id}"][data-repair-status-target="Terminée"]`);
  await waitFor(cdp, `window.rdl.getReparation(${created.id}).then(r=>r?.statut==='Terminée' && /^\\d{4}-\\d{2}-\\d{2}$/.test(r?.cloture||''))`, 'réparation terminée datée');
  record('complete-with-closure-date');
  await waitFor(cdp, `document.querySelector('#reparations-body [data-repair-status="${created.id}"][data-repair-status-target="En cours"]')!=null`, 'action Rouvrir');
  await click(cdp, `#reparations-body [data-repair-status="${created.id}"][data-repair-status-target="En cours"]`);
  await waitFor(cdp, `window.rdl.getReparation(${created.id}).then(r=>r?.statut==='En cours' && !r?.cloture)`, 'réparation rouverte sans clôture');
  record('reopen-clears-closure-date');

  await fill(cdp, '#repair-search', fixture.deepSearchTerm);
  await waitFor(cdp, `document.querySelector('#reparations-body')?.innerText.includes(${JSON.stringify(fixture.deepSearchTerm)})`, 'recherche au-delà de 1000');
  const deepTotal = await queryTotal(cdp, fixture.deepSearchTerm);
  if (deepTotal !== 1) throw new Error(`Recherche profonde incorrecte: ${deepTotal}`);
  record('search-beyond-1000', { total: deepTotal });

  if ((await evaluate(cdp, `document.querySelector('#privacy-toggle')?.getAttribute('aria-pressed')`)) !== 'false') {
    await click(cdp, '#privacy-toggle');
    await waitFor(cdp, `document.querySelector('#privacy-toggle')?.getAttribute('aria-pressed')==='false'`, 'identités masquées');
  }
  await fill(cdp, '#repair-search', fixture.secretReferent);
  await wait(450);
  const hiddenSearchTotal = await queryTotal(cdp, fixture.secretReferent, false);
  if (hiddenSearchTotal !== 0) throw new Error(`Recherche référent visible sans autorisation: ${hiddenSearchTotal}`);
  await waitFor(cdp, `document.querySelector('#repair-page')?.textContent.includes('0 réparation')`, 'référent absent en mode masqué');
  record('referent-hidden-by-default');

  await click(cdp, '#privacy-toggle');
  await waitFor(cdp, `document.querySelector('#privacy-toggle')?.getAttribute('aria-pressed')==='true'`, 'identités explicitement affichées');
  await waitFor(cdp, `document.querySelector('#reparations-body')?.innerText.includes(${JSON.stringify(fixture.secretReferent)})`, 'référent visible après autorisation');
  const visibleSearchTotal = await queryTotal(cdp, fixture.secretReferent, true);
  if (visibleSearchTotal !== 1) throw new Error(`Recherche référent explicite incorrecte: ${visibleSearchTotal}`);
  record('referent-explicit-access', { total: visibleSearchTotal });

  await click(cdp, '#privacy-toggle');
  await waitFor(cdp, `document.querySelector('#privacy-toggle')?.getAttribute('aria-pressed')==='false'`, 'retour identités masquées');
  await fill(cdp, '#repair-search', fixture.closedRepairMeasure);
  await waitFor(cdp, `document.querySelector('#reparations-body')?.innerText.includes(${JSON.stringify(fixture.closedRepairMeasure)})`, 'réparation parent clos visible');
  const closedUi = await evaluate(cdp, `(() => {
    const row=document.querySelector('#reparations-body tr[data-reparation-id="${fixture.closedRepairId}"]');
    return { editDisabled:row?.querySelector('[data-edit-repair]')?.disabled===true, statusDisabled:[...row?.querySelectorAll('[data-repair-status]')||[]].every(b=>b.disabled) };
  })()`);
  if (!closedUi.editDisabled || !closedUi.statusDisabled) throw new Error(`Actions parent clos non verrouillées: ${JSON.stringify(closedUi)}`);
  const closedMutation = await evaluate(cdp, `window.rdl.updateReparation(${fixture.closedRepairId},{mesure:'R4-FORBIDDEN'}).then(()=>({ok:true})).catch(e=>({ok:false,message:e.message}))`);
  if (closedMutation.ok || !/clos|rouvr/i.test(closedMutation.message || '')) throw new Error(`Mutation parent clos non refusée: ${JSON.stringify(closedMutation)}`);
  record('closed-parent-lock', { ui: closedUi, message: closedMutation.message });
  record('closed-parent-screenshot', await screenshot(cdp, 'r4-reparations-closed-parent.png', 'closed-parent-lock'));

  evidence.ok = true;
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'r4-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`R4_PACKAGED_E2E_PASS ${JSON.stringify({ steps: evidence.steps.length, screenshots: evidence.screenshots.length, createdId: created.id })}`);
} catch (error) {
  evidence.ok = false;
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error?.stack || String(error);
  try { await screenshot(cdp, 'r4-reparations-failure.png', 'failure'); } catch {}
  fs.writeFileSync(path.join(outDir, 'r4-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch {}
  cdp.close();
}
