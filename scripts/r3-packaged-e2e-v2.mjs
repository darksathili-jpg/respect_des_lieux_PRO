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
const evidence = { format: 4, startedAt: new Date().toISOString(), fixture, steps: [], visualEvidence: [] };
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
async function pressKey(cdp, key, { shift = false } = {}) {
  const keys = {
    Tab: { code: 'Tab', vk: 9 },
    Enter: { code: 'Enter', vk: 13, text: '\r' },
    Escape: { code: 'Escape', vk: 27 },
    ArrowRight: { code: 'ArrowRight', vk: 39 }
  };
  const meta = keys[key];
  if (!meta) throw new Error(`Touche E2E non configurée: ${key}`);
  const modifiers = shift ? 8 : 0;
  const payload = { key, code: meta.code, windowsVirtualKeyCode: meta.vk, nativeVirtualKeyCode: meta.vk, modifiers };
  const down = meta.text
    ? { type: 'keyDown', ...payload, text: meta.text, unmodifiedText: meta.text }
    : { type: 'rawKeyDown', ...payload };
  await cdp.send('Input.dispatchKeyEvent', down);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...payload });
  await wait(70);
}
async function focusSnapshot(cdp, dialogSelector = null) {
  return evaluate(cdp, `(() => {
    const a=document.activeElement;
    return {
      tag:a?.tagName||'',
      id:a?.id||'',
      name:a?.getAttribute?.('name')||'',
      text:(a?.textContent||'').trim().slice(0,60),
      inside:${dialogSelector ? `!!a?.closest(${JSON.stringify(dialogSelector)})` : 'true'}
    };
  })()`);
}
async function assertTabContainment(cdp, dialogSelector, samples = 10) {
  const trail = [];
  for (let i = 0; i < samples; i += 1) {
    await pressKey(cdp, 'Tab');
    const state = await focusSnapshot(cdp, dialogSelector);
    if (!state.inside) throw new Error(`Le focus a quitté ${dialogSelector} après Tab: ${JSON.stringify(state)}`);
    trail.push(`${state.tag}:${state.name || state.id || state.text}`);
  }
  return trail;
}
async function setViewport(cdp, width, height = 900) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height, positionX: 0, positionY: 0, dontSetVisibleSize: false });
  await wait(180);
}
async function shot(cdp, name, state = '') {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(r.data || '', 'base64');
  fs.writeFileSync(path.join(outDir, name), bytes);
  if (bytes.length < 5000) throw new Error(`Capture trop petite: ${name}`);
  const item = { file: name, bytes: bytes.length, state };
  evidence.visualEvidence.push(item);
  return item;
}
async function queryTotal(cdp, query = '') {
  return evaluate(cdp, `window.rdl.querySignalements({query:${JSON.stringify(query)},limit:1,offset:0,includeIdentities:false}).then(r=>r.total)`);
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await setViewport(cdp, 1440, 900);
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell prête');
  const baseline = await queryTotal(cdp);
  if (baseline !== fixture.seededSignalements) throw new Error(`Fixture inattendue: ${baseline}`);
  record('fixture-loaded', { total: baseline });

  await click(cdp, '#app-shell .nav[data-view="signalements"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='signalements'`, 'vue Signalements');

  const semanticContract = await evaluate(cdp, `(() => ({
    searchName: document.querySelector('#signal-search')?.getAttribute('aria-label') || '',
    searchControls: document.querySelector('#signal-search')?.getAttribute('aria-controls') || '',
    tableRegionRole: document.querySelector('#view-signalements .table-wrap')?.getAttribute('role') || '',
    tableRegionTabIndex: document.querySelector('#view-signalements .table-wrap')?.tabIndex,
    paginationRole: document.querySelector('#view-signalements .form-actions')?.getAttribute('role') || '',
    scopedHeaders: [...document.querySelectorAll('#view-signalements thead th')].every(th=>th.getAttribute('scope')==='col')
  }))()`);
  if (!semanticContract.searchName || semanticContract.searchControls !== 'signalements-body') throw new Error(`Recherche sans nom/liaison accessible: ${JSON.stringify(semanticContract)}`);
  if (semanticContract.tableRegionRole !== 'region' || semanticContract.tableRegionTabIndex !== 0) throw new Error(`Tableau responsive non accessible au clavier: ${JSON.stringify(semanticContract)}`);
  if (semanticContract.paginationRole !== 'navigation' || !semanticContract.scopedHeaders) throw new Error(`Sémantique tableau/pagination incomplète: ${JSON.stringify(semanticContract)}`);
  record('accessible-semantics', semanticContract);

  await evaluate(cdp, `document.querySelector('#new-signalement').focus()`);
  await pressKey(cdp, 'Enter');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open===true`, 'dialog création ouvert au clavier');
  await waitFor(cdp, `document.activeElement?.closest('#signal-dialog') && document.activeElement?.getAttribute('name')==='lieu'`, 'focus initial dans le formulaire');
  const createInitialFocus = await focusSnapshot(cdp, '#signal-dialog');
  record('keyboard-open-create', createInitialFocus);
  record('visual-create-dialog', await shot(cdp, 'r3-signalements-create-dialog.png', 'create-dialog-desktop'));
  const createFocusTrail = await assertTabContainment(cdp, '#signal-dialog', 12);
  record('keyboard-create-focus-trap', { samples: createFocusTrail });
  await pressKey(cdp, 'Escape');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open===false`, 'fermeture Échap du dialogue création');
  if (await queryTotal(cdp) !== baseline) throw new Error('Annulation clavier a écrit dans la base.');
  await waitFor(cdp, `document.activeElement?.id==='new-signalement'`, 'focus restitué après Échap');
  record('cancel-create-without-write', { focus: 'new-signalement', method: 'Escape' });

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
  const rowSelector = `#signalements-body tr[data-fiche-id="${created.id}"]`;
  await evaluate(cdp, `document.querySelector(${JSON.stringify(rowSelector)})?.focus()`);
  await waitFor(cdp, `document.activeElement===document.querySelector(${JSON.stringify(rowSelector)})`, 'focus ligne Signalements');
  await pressKey(cdp, 'Enter');
  await waitFor(cdp, `document.querySelector('#signal-detail-dialog')?.open===true`, 'fiche ouverte avec Entrée');
  await waitFor(cdp, `document.activeElement?.closest('#signal-detail-dialog')`, 'focus transféré dans la fiche');
  record('keyboard-open-detail-from-row', await focusSnapshot(cdp, '#signal-detail-dialog'));
  record('consult-detail', { title: await evaluate(cdp, `document.querySelector('#signal-detail-title')?.textContent||''`) });
  record('visual-detail', await shot(cdp, 'r3-signalements-detail.png', 'detail-desktop'));
  const detailFocusTrail = await assertTabContainment(cdp, '#signal-detail-dialog', 8);
  record('keyboard-detail-focus-trap', { samples: detailFocusTrail });
  await pressKey(cdp, 'Escape');
  await waitFor(cdp, `document.querySelector('#signal-detail-dialog')?.open===false`, 'fiche fermée avec Échap');
  await waitFor(cdp, `document.activeElement===document.querySelector(${JSON.stringify(rowSelector)})`, 'focus rendu à la ligne');
  record('keyboard-detail-focus-return', { returnedTo: 'record-row' });

  await click(cdp, `#signalements-body button[data-fiche-id="${created.id}"]`);
  await waitFor(cdp, `document.querySelector('#signal-detail-dialog')?.open===true`, 'fiche rouverte');
  await click(cdp, '#signal-detail-dialog [data-edit-signalement]');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.dataset.mode==='edit' && document.querySelector('#signal-dialog')?.open===true`, 'éditeur');
  record('visual-edit-dialog', await shot(cdp, 'r3-signalements-edit-dialog.png', 'edit-dialog-desktop'));
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
  record('visual-detail-photo', await shot(cdp, 'r3-signalements-detail-photo.png', 'detail-with-photo-desktop'));
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
  record('visual-closed-row', await shot(cdp, 'r3-signalements-closed-row.png', 'closed-row-desktop'));
  await click(cdp, `#signalements-body [data-set-status="${created.id}"]`);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d=>d.signalement.statut==='Ouvert')`, 'rouvert');
  record('reopen');

  await fill(cdp, '#signal-search', fixture.deepSearchTerm);
  await waitFor(cdp, `document.querySelector('#signalements-body')?.innerText.includes(${JSON.stringify(fixture.deepSearchTerm)})`, 'recherche >500');
  const text = await evaluate(cdp, `document.querySelector('#signalements-body')?.innerText||''`);
  if (!text.includes('2025-0001')) throw new Error(`Dossier profond inattendu: ${text}`);
  record('search-beyond-500', { num: '2025-0001' });

  const desktopGeometry = await evaluate(cdp, `(() => {
    const wrap=document.querySelector('#view-signalements .table-wrap');
    const actions=[...document.querySelectorAll('#signalements-body .actions button')];
    const wr=wrap?.getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth-document.documentElement.clientWidth,
      tableOverflow: wrap ? wrap.scrollWidth-wrap.clientWidth : -1,
      actionsInside: !!wr && actions.every(b=>{const r=b.getBoundingClientRect(); return r.left>=wr.left-1 && r.right<=wr.right+1;})
    };
  })()`);
  if (desktopGeometry.bodyOverflow > 1) throw new Error(`Overflow horizontal du document en desktop: ${JSON.stringify(desktopGeometry)}`);
  if (desktopGeometry.tableOverflow > 1) throw new Error(`Overflow horizontal de la table en 1440px: ${JSON.stringify(desktopGeometry)}`);
  if (!desktopGeometry.actionsInside) throw new Error(`Actions tronquées en 1440px: ${JSON.stringify(desktopGeometry)}`);
  record('desktop-geometry', desktopGeometry);
  const finalDesktop = await shot(cdp, 'r3-signalements-final.png', 'registry-desktop'); record('screenshot', finalDesktop);

  await setViewport(cdp, 760, 900);
  await evaluate(cdp, `(() => { document.querySelector('#view-signalements')?.scrollIntoView({block:'start'}); return true; })()`);
  await wait(220);
  const responsiveGeometry = await evaluate(cdp, `(() => ({ bodyOverflow: document.documentElement.scrollWidth-document.documentElement.clientWidth, tableScrollable: (()=>{const w=document.querySelector('#view-signalements .table-wrap'); return !!w && w.scrollWidth>w.clientWidth;})() }))()`);
  if (responsiveGeometry.bodyOverflow > 1) throw new Error(`Overflow horizontal du document en responsive: ${JSON.stringify(responsiveGeometry)}`);
  if (!responsiveGeometry.tableScrollable) throw new Error(`Le tableau responsive devrait conserver un défilement local: ${JSON.stringify(responsiveGeometry)}`);
  record('responsive-geometry', responsiveGeometry);
  record('visual-responsive', await shot(cdp, 'r3-signalements-responsive-760.png', 'registry-responsive-760'));

  const responsiveScroll = await evaluate(cdp, `(() => { const w=document.querySelector('#view-signalements .table-wrap'); w.focus(); w.scrollLeft=0; return {before:w.scrollLeft, focused:document.activeElement===w}; })()`);
  if (!responsiveScroll.focused) throw new Error('La région du tableau responsive ne peut pas recevoir le focus.');
  await pressKey(cdp, 'ArrowRight');
  await wait(100);
  const responsiveScrollAfter = await evaluate(cdp, `document.querySelector('#view-signalements .table-wrap')?.scrollLeft || 0`);
  if (responsiveScrollAfter <= responsiveScroll.before) throw new Error(`Le tableau responsive ne défile pas au clavier: avant=${responsiveScroll.before}, après=${responsiveScrollAfter}`);
  record('keyboard-responsive-table-scroll', { before: responsiveScroll.before, after: responsiveScrollAfter });

  await click(cdp, '#new-signalement');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open===true`, 'dialog création responsive');
  record('visual-responsive-dialog', await shot(cdp, 'r3-signalements-responsive-dialog-760.png', 'create-dialog-responsive-760'));
  await click(cdp, '#signal-dialog [data-signal-cancel]');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open===false`, 'dialog responsive fermé');

  evidence.ok = true; evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'r3-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`R3_PACKAGED_E2E_PASS ${JSON.stringify({ createdId: created.id, steps: evidence.steps.length, visualEvidence: evidence.visualEvidence.length, screenshot: finalDesktop })}`);
} catch (error) {
  evidence.ok = false; evidence.finishedAt = new Date().toISOString(); evidence.error = error?.stack || String(error);
  try { await shot(cdp, 'r3-signalements-failure.png', 'failure'); } catch {}
  fs.writeFileSync(path.join(outDir, 'r3-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch {}
  cdp.close();
}
