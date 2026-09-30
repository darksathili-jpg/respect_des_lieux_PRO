import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const mode = arg('--mode', 'verify');
const port = Number(arg('--port', '9551'));
const outDir = path.resolve(arg('--out', 'artifacts/r7-nsis-lifecycle'));
const expectedFile = arg('--expected', '');
const stage = arg('--stage', mode);
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function discoverTarget() {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  let lastError = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
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

async function waitForRdl(cdp) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(cdp, `Boolean(window.rdl && window.rdl.bootstrap && window.rdl.listSignalements)`);
    if (ready) return;
    await wait(150);
  }
  throw new Error('API window.rdl non disponible.');
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();

try {
  await cdp.send('Runtime.enable');
  await waitForRdl(cdp);

  if (mode === 'legacy-create') {
    const payload = {
      date: '2026-09-29',
      heure: '12:34',
      lieu: 'R7-LAB-NSIS',
      type: 'Test migration',
      gravite: 'Moyenne',
      signale_par: 'Qualification R7',
      description: 'R7-UPGRADE-MARKER-DO-NOT-DELETE',
      eleve: 'Eleve Test R7',
      classe: 'TEST-R7'
    };
    const created = await evaluate(cdp, `(async () => {
      const created = await window.rdl.createSignalement(${JSON.stringify(payload)});
      const list = await window.rdl.listSignalements(500);
      const bootstrap = await window.rdl.bootstrap();
      return { created, list, bootstrap };
    })()`);
    const row = (created.list || []).find((item) => item.id === created.created?.id || item.num === created.created?.num);
    if (!created.created?.id || !created.created?.num || !row) {
      throw new Error(`Création legacy non vérifiable: ${JSON.stringify(created)}`);
    }
    const evidence = {
      stage,
      appVersion: created.bootstrap?.appVersion || '',
      id: created.created.id,
      num: created.created.num,
      lieu: row.lieu,
      description: row.description,
      marker: payload.description,
      database: created.bootstrap?.paths?.database || ''
    };
    fs.writeFileSync(path.join(outDir, 'legacy-created.json'), JSON.stringify(evidence, null, 2));
    console.log(`R7_LEGACY_DATA_CREATED ${JSON.stringify(evidence)}`);
  } else if (mode === 'verify') {
    if (!expectedFile || !fs.existsSync(expectedFile)) {
      throw new Error(`Preuve legacy absente: ${expectedFile}`);
    }
    const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
    const state = await evaluate(cdp, `(async () => {
      const list = await window.rdl.listSignalements(500);
      const bootstrap = await window.rdl.bootstrap();
      return { list, bootstrap };
    })()`);
    const row = (state.list || []).find((item) => item.num === expected.num);
    if (!row) throw new Error(`Dossier ${expected.num} introuvable après ${stage}.`);
    if (row.lieu !== expected.lieu || row.description !== expected.description) {
      throw new Error(`Dossier altéré après ${stage}: ${JSON.stringify(row)}`);
    }
    const evidence = {
      stage,
      appVersion: state.bootstrap?.appVersion || '',
      num: row.num,
      id: row.id,
      lieu: row.lieu,
      description: row.description,
      database: state.bootstrap?.paths?.database || '',
      integrity: state.bootstrap?.integrity || null,
      stats: state.bootstrap?.stats || null
    };
    fs.writeFileSync(path.join(outDir, `${stage}.json`), JSON.stringify(evidence, null, 2));
    console.log(`R7_INSTALLED_DATA_VERIFIED ${JSON.stringify(evidence)}`);
  } else {
    throw new Error(`Mode R7 inconnu: ${mode}`);
  }

  try {
    await evaluate(cdp, `(() => { window.close(); return true; })()`);
  } catch {}
} finally {
  cdp.close();
}
