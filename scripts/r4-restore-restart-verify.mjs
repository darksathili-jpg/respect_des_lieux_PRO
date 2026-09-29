import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('--port', '9445'));
const outDir = path.resolve(arg('--out', 'artifacts/r4-restore-restart'));
const localAppData = path.resolve(arg('--local', ''));
const appRoot = path.join(localAppData, 'Respect des Lieux PRO');
const restoreMarker = path.join(appRoot, 'restore-pending.json');
const restoreMarkerTmp = `${restoreMarker}.tmp`;
const pendingRestore = path.join(appRoot, 'pending-restore');

fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = { format: 1, startedAt: new Date().toISOString(), steps: [] };
const record = (name, detail = {}) => {
  evidence.steps.push({ name, at: new Date().toISOString(), ...detail });
  console.log(`R4_RESTORE_RESTART_STEP ${name} ${JSON.stringify(detail)}`);
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
  throw new Error(`Renderer CDP introuvable après redémarrage: ${lastError?.message || 'timeout'}`);
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

async function shot(cdp, name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(result.data || '', 'base64');
  if (bytes.length < 5000) throw new Error(`Capture trop petite: ${name}`);
  fs.writeFileSync(path.join(outDir, name), bytes);
  return { file: name, bytes: bytes.length };
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady==='true'`, 'shell prête après restauration');

  const health = await evaluate(cdp, `window.rdl.health()`);
  if (!health?.integrity?.ok) throw new Error(`Intégrité SQLite invalide après restauration: ${JSON.stringify(health)}`);
  record('integrity-after-restart', { ok: true });

  const policy = await evaluate(cdp, `window.rdl.getRetentionPolicy()`);
  if (policy?.active) throw new Error(`La politique 18 mois créée après l’export a survécu à la restauration: ${JSON.stringify(policy)}`);
  record('post-export-policy-reverted', { active: Boolean(policy?.active), months: policy?.months ?? null });

  const repairs = await evaluate(cdp, `window.rdl.queryReparations({limit:200,offset:0,includeIdentities:true}).then(r=>r.rows)`);
  const restoredRepair = Array.isArray(repairs) ? repairs.find((row) => row.mesure === 'Remplacement poignée E2E terminé' && row.statut === 'Terminée') : null;
  if (!restoredRepair) throw new Error(`La donnée R3 antérieure à l’export n’a pas été restaurée: ${JSON.stringify(repairs)}`);
  record('pre-export-business-data-preserved', { repairId: restoredRepair.id, statut: restoredRepair.statut });

  if (fs.existsSync(restoreMarker)) throw new Error('restore-pending.json existe encore après restauration appliquée.');
  if (fs.existsSync(restoreMarkerTmp)) throw new Error('restore-pending.json.tmp existe encore après restauration appliquée.');
  if (fs.existsSync(pendingRestore)) throw new Error('pending-restore existe encore après restauration appliquée.');
  const staging = fs.existsSync(appRoot)
    ? fs.readdirSync(appRoot).filter((name) => name.startsWith('.pending-restore.staging-'))
    : [];
  if (staging.length) throw new Error(`Staging pending-restore résiduel: ${JSON.stringify(staging)}`);
  record('restore-artifacts-cleaned', { marker: false, markerTmp: false, pending: false, stagingCount: 0 });

  const events = await evaluate(cdp, `window.rdl.listPrivacyEvents(200)`);
  const restoredEvent = Array.isArray(events) && events.some((event) => event.event_type === 'encrypted_backup_restored');
  if (!restoredEvent) throw new Error(`Événement encrypted_backup_restored absent: ${JSON.stringify(events)}`);
  record('restore-event-recorded', { found: true });

  const screenshot = await shot(cdp, 'r4-restored-after-restart.png');
  record('visual-restored-state', screenshot);

  evidence.ok = true;
  evidence.finishedAt = new Date().toISOString();
  evidence.restoredRepairId = restoredRepair.id;
  fs.writeFileSync(path.join(outDir, 'r4-restore-restart-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`R4_RESTORE_RESTART_PACKAGED_E2E_PASS ${JSON.stringify({ integrity: true, policyReverted: true, restoredRepairId: restoredRepair.id, artifactsCleaned: true, restoreEvent: true })}`);
} catch (error) {
  evidence.ok = false;
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error?.stack || String(error);
  try { await shot(cdp, 'r4-restore-restart-failure.png'); } catch {}
  fs.writeFileSync(path.join(outDir, 'r4-restore-restart-evidence.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch {}
  cdp.close();
}
