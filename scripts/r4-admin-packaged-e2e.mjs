import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('--port', '9444'));
const outDir = path.resolve(arg('--out', 'artifacts/r4-packaged-e2e'));
const localAppData = path.resolve(arg('--local', ''));
const backupFile = path.resolve(arg('--backup', path.join(localAppData, 'r4-e2e-backup.rdlbackup')));
const reviewFile = path.resolve(arg('--review', path.join(localAppData, 'r4-e2e-review.json')));
const appRoot = path.join(localAppData, 'Respect des Lieux PRO');
const backupsDir = path.join(appRoot, 'backups');
const restoreMarker = path.join(appRoot, 'restore-pending.json');
const pendingRestore = path.join(appRoot, 'pending-restore');
const passphrase = 'R4 E2E phrase secrète 2026!';

fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = { format: 1, startedAt: new Date().toISOString(), steps: [], visualEvidence: [] };
const record = (name, detail = {}) => {
  evidence.steps.push({ name, at: new Date().toISOString(), ...detail });
  console.log(`R4_ADMIN_E2E_STEP ${name} ${JSON.stringify(detail)}`);
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

async function waitForFile(filePath, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0) return fs.statSync(filePath).size;
    await wait(120);
  }
  throw new Error(`Fichier attendu absent: ${label} (${filePath})`);
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return false; e.click(); return true; })()`);
  if (!ok) throw new Error(`Contrôle introuvable: ${selector}`);
}

async function fill(cdp, selector, value) {
  const ok = await evaluate(cdp, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return false; e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  if (!ok) throw new Error(`Champ introuvable: ${selector}`);
}

async function check(cdp, selector, checked = true) {
  const ok = await evaluate(cdp, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return false; e.checked=${checked ? 'true' : 'false'}; e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  if (!ok) throw new Error(`Case introuvable: ${selector}`);
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

function backupCount() {
  if (!fs.existsSync(backupsDir)) return 0;
  return fs.readdirSync(backupsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-')).length;
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell prête');

  // Sauvegardes : locale puis chiffrée.
  await click(cdp, '#app-shell .nav[data-view="sauvegardes"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='sauvegardes'`, 'vue Sauvegardes');
  record('visual-backups-view', await shot(cdp, 'r4-sauvegardes.png', 'backups-view'));

  const beforeBackups = backupCount();
  const busyProbe = await evaluate(cdp, `(() => {
    const e=document.querySelector('#backup-view-action');
    if(!e)return null;
    e.click();
    const first={disabled:e.disabled,busy:e.getAttribute('aria-busy'),dataset:e.dataset.busy||''};
    e.click();
    return first;
  })()`);
  if (!busyProbe || busyProbe.disabled !== true || busyProbe.busy !== 'true' || busyProbe.dataset !== 'true') {
    throw new Error(`État busy absent après activation: ${JSON.stringify(busyProbe)}`);
  }
  await waitFor(cdp, `document.querySelector('#toast')?.classList.contains('show') && document.querySelector('#toast')?.textContent.includes('Sauvegarde locale créée')`, 'toast sauvegarde locale');
  const afterBackups = backupCount();
  if (afterBackups !== beforeBackups + 1) throw new Error(`Double activation non idempotente (${beforeBackups} -> ${afterBackups}).`);
  const busyReleased = await evaluate(cdp, `(() => { const e=document.querySelector('#backup-view-action'); return {disabled:e?.disabled,busy:e?.getAttribute('aria-busy'),dataset:e?.dataset.busy||''}; })()`);
  if (busyReleased.disabled || busyReleased.busy || busyReleased.dataset) throw new Error(`État busy non libéré: ${JSON.stringify(busyReleased)}`);
  record('local-backup-created-once', { before: beforeBackups, after: afterBackups, busyProbe, busyReleased });

  fs.rmSync(backupFile, { force: true });
  await click(cdp, '#encrypted-backup');
  await waitFor(cdp, `document.querySelector('#secret-dialog')?.open===true`, 'dialog secret export');
  await fill(cdp, '#secret-passphrase', passphrase);
  await fill(cdp, '#secret-confirm', passphrase);
  await click(cdp, '#secret-submit');
  const encryptedBytes = await waitForFile(backupFile, 'sauvegarde chiffrée');
  await waitFor(cdp, `document.querySelector('#toast')?.textContent.includes('Sauvegarde chiffrée créée')`, 'toast sauvegarde chiffrée');
  record('encrypted-backup-created', { bytes: encryptedBytes });

  // Confidentialité : politique de conservation + revue interne.
  await click(cdp, '#app-shell .nav[data-view="confidentialite"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='confidentialite'`, 'vue Confidentialité');
  await check(cdp, '#retention-enabled', true);
  await fill(cdp, '#retention-months', '18');
  await fill(cdp, '#retention-note', 'Validation E2E R4');
  await check(cdp, '#retention-confirmed', true);
  await click(cdp, '#retention-form button[type="submit"]');
  await waitFor(cdp, `document.querySelector('#retention-status')?.textContent.includes('18 mois')`, 'politique de conservation persistée');
  const policy = await evaluate(cdp, `window.rdl.getRetentionPolicy()`);
  if (!policy?.active || Number(policy.months) !== 18) throw new Error(`Politique inattendue: ${JSON.stringify(policy)}`);
  record('retention-policy', { active: policy.active, months: policy.months });

  fs.rmSync(reviewFile, { force: true });
  await fill(cdp, '#rights-query', 'E2E');
  await click(cdp, '#rights-export');
  const reviewBytes = await waitForFile(reviewFile, 'revue interne');
  const review = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
  const reviewMatches = Number(review.signalements?.length || 0) + Number(review.directRepairMatches?.length || 0);
  if (reviewMatches < 1) throw new Error(`La revue E2E ne contient aucun résultat: ${JSON.stringify(review)}`);
  await waitFor(cdp, `document.querySelector('#privacy-events')?.innerText.includes('Dossier de revue exporté')`, 'événement export de revue');
  record('access-review-exported', { bytes: reviewBytes, matches: reviewMatches });
  record('visual-privacy-view', await shot(cdp, 'r4-confidentialite.png', 'privacy-view'));

  // Préparation restauration : le vrai flux de production est exercé, sans relance automatique.
  await evaluate(cdp, `window.confirm = () => false`);
  await click(cdp, '#app-shell .nav[data-view="sauvegardes"]');
  await click(cdp, '#encrypted-restore');
  await waitFor(cdp, `document.querySelector('#secret-dialog')?.open===true`, 'dialog secret restauration');
  await fill(cdp, '#secret-passphrase', passphrase);
  await click(cdp, '#secret-submit');
  await waitFor(cdp, `document.querySelector('#toast')?.textContent.includes('Restauration prête')`, 'restauration préparée');
  if (!fs.existsSync(restoreMarker)) throw new Error('Marqueur restore-pending.json absent après préparation.');
  if (!fs.existsSync(pendingRestore) || !fs.statSync(pendingRestore).isDirectory()) throw new Error('Dossier pending-restore absent après préparation.');
  const marker = JSON.parse(fs.readFileSync(restoreMarker, 'utf8'));
  if (Number(marker.format) !== 1 || path.resolve(marker.pendingDir || '') !== path.resolve(pendingRestore)) {
    throw new Error(`Marqueur de restauration invalide: ${JSON.stringify(marker)}`);
  }
  record('restore-prepared', { markerFormat: marker.format, pendingDir: marker.pendingDir });

  // Système local : intégrité, diagnostic enrichi, chemins et géométrie.
  await click(cdp, '#app-shell .nav[data-view="systeme"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView==='systeme'`, 'vue Système local');
  const health = await evaluate(cdp, `window.rdl.health()`);
  if (!health?.integrity?.ok) throw new Error(`Intégrité système invalide: ${JSON.stringify(health)}`);
  if (Number(health?.formats?.databaseSchema) !== 3 || Number(health?.formats?.backup) !== 2 || Number(health?.formats?.restoreMarker) !== 1) {
    throw new Error(`Versions de formats inattendues: ${JSON.stringify(health?.formats)}`);
  }
  if (!health?.lastBackup?.name || Number(health?.lastBackup?.format) !== 2) {
    throw new Error(`Dernière sauvegarde absente/invalide: ${JSON.stringify(health?.lastBackup)}`);
  }
  if (health?.restore?.pending !== true || health?.restore?.markerExists !== true || health?.restore?.pendingDirectory !== true) {
    throw new Error(`État de restauration en attente incohérent: ${JSON.stringify(health?.restore)}`);
  }
  if (!Number.isFinite(Number(health?.disk?.availableBytes)) || Number(health.disk.availableBytes) < 0) {
    throw new Error(`Espace disque non diagnostiqué: ${JSON.stringify(health?.disk)}`);
  }
  for (const [name, status] of Object.entries(health?.directories || {})) {
    if (!status?.exists || !status?.readable || !status?.writable) {
      throw new Error(`Dossier ${name} non opérationnel: ${JSON.stringify(status)}`);
    }
  }
  if (Object.keys(health?.directories || {}).length < 5) throw new Error('Diagnostic des dossiers incomplet.');

  const systemState = await evaluate(cdp, `(() => ({
    root: document.querySelector('#sys-root')?.textContent || '',
    db: document.querySelector('#sys-db')?.textContent || '',
    backups: document.querySelector('#sys-backups')?.textContent || '',
    exports: document.querySelector('#sys-exports')?.textContent || '',
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  if (!systemState.root || !systemState.db || !systemState.backups || !systemState.exports) throw new Error(`Chemins système incomplets: ${JSON.stringify(systemState)}`);
  if (systemState.overflow > 0) throw new Error(`Débordement horizontal vue Système: ${systemState.overflow}px`);
  record('system-health-enriched', {
    integrity: true,
    overflow: systemState.overflow,
    databaseSchema: health.formats.databaseSchema,
    backupFormat: health.formats.backup,
    restorePending: health.restore.pending,
    availableBytes: health.disk.availableBytes,
    lastBackup: health.lastBackup.name,
    directories: Object.keys(health.directories)
  });
  record('visual-system-view', await shot(cdp, 'r4-systeme.png', 'system-view'));

  evidence.ok = true;
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'r4-admin-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`R4_ADMIN_PACKAGED_E2E_PASS ${JSON.stringify({ localBackupDelta: afterBackups - beforeBackups, encryptedBytes, reviewMatches, retentionMonths: policy.months, systemIntegrity: true, restorePrepared: true, databaseSchema: health.formats.databaseSchema, backupFormat: health.formats.backup, busyIdempotent: true })}`);
} catch (error) {
  evidence.ok = false;
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error?.stack || String(error);
  try { await shot(cdp, 'r4-admin-failure.png', 'failure'); } catch {}
  fs.writeFileSync(path.join(outDir, 'r4-admin-e2e-evidence.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch {}
  cdp.close();
}
