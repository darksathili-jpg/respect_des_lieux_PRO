import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('frontière Electron : renderer isolé de Node et permissions bloquées', () => {
  const main = read('main.cjs');
  const preload = read('preload.cjs');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /spellcheck:\s*false/);
  assert.match(main, /devTools:\s*!app\.isPackaged/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /assertTrustedIpc/);
  assert.doesNotMatch(preload, /service_role|sb_secret_/i);
});

test('renderer entièrement local : aucun backend cloud exécutable', () => {
  const html = read('renderer/index.html');
  const app = read('renderer/app.js');
  const css = `${read('renderer/styles.css')}\n${read('renderer/v51.css')}`;
  const runtime = `${html}\n${app}\n${css}`;
  assert.doesNotMatch(runtime, /[a-z0-9-]+\.supabase\.co/i);
  assert.doesNotMatch(runtime, /https?:\/\//i);
  assert.doesNotMatch(runtime, /\bfetch\s*\(/i);
  assert.doesNotMatch(runtime, /XMLHttpRequest|WebSocket|EventSource/);
  assert.match(html, /default-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /href="\.\/v51\.css"/);
  assert.match(read('main.cjs'), /urls:\s*\['http:\/\/\*\/\*',\s*'https:\/\/\*\/\*'\]/);
});

test('aucune donnée métier ni secret dans les stockages navigateur', () => {
  const runtime = `${read('renderer/app.js')}\n${read('preload.cjs')}`;
  assert.doesNotMatch(runtime, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(runtime, /setItem\s*\(/);
});

test('garde-fous SQLite et photos présents', () => {
  const db = read('src/database.cjs');
  const storage = read('src/storage.cjs');
  assert.match(db, /journal_mode\s*=\s*WAL/i);
  assert.match(db, /synchronous\s*=\s*FULL/i);
  assert.match(db, /foreign_keys\s*=\s*ON/i);
  assert.match(db, /BEGIN IMMEDIATE/);
  assert.match(db, /PRAGMA quick_check/);
  assert.match(storage, /3 \* 1024 \* 1024/);
  assert.match(storage, /METADATA_MARKERS/);
  assert.match(storage, /0xe1/);
  assert.match(storage, /0xed/);
  assert.match(storage, /0xfe/);
  assert.match(storage, /original_name:\s*'photo\.jpg'/);
  assert.match(storage, /stageDelete/);
  assert.match(storage, /rollbackStagedDelete/);
});

test('minimisation scolaire et masquage des identités restent actifs', () => {
  const html = read('renderer/index.html');
  const app = read('renderer/app.js');
  assert.doesNotMatch(html, /name="famille"/i);
  assert.match(html, /Élève concerné/);
  assert.match(html, /Protection des données/);
  assert.match(html, /aucune durée imposée par défaut/i);
  assert.match(app, /identitiesVisible:\s*false/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /window\.addEventListener\('blur'/);
  assert.match(app, /if \(state\.identitiesVisible\) fields\.push\(s\.eleve, s\.classe, s\.signale_par\)/);
});

test('cycle de vie : pas de durée arbitraire ni de purge automatique', () => {
  const db = read('src/database.cjs');
  const app = read('renderer/app.js');
  assert.match(db, /payload\.confirmed !== true/);
  assert.match(db, /retention_months/);
  assert.match(db, /getLifecycleReview/);
  assert.match(db, /Seul un dossier clos peut être supprimé définitivement/);
  assert.doesNotMatch(app, /setInterval\s*\(/);
  assert.doesNotMatch(app, /setTimeout\s*\([^,]*purge/i);
  assert.match(app, /window\.prompt\(`Suppression définitive/);
});

test('registre de purge persistant hors base empêche une restauration de ressusciter un dossier', () => {
  const main = read('main.cjs');
  assert.match(main, /privacy-purge-ledger\.json/);
  assert.match(main, /enforcePurgeLedger/);
  assert.match(main, /forcePurgeByNum/);
  assert.match(main, /addPurgeLedgerEntry/);
});

test('droit d’accès : export interne explicitement soumis à revue des tiers', () => {
  const db = read('src/database.cjs');
  const html = read('renderer/index.html');
  assert.match(db, /reviewRequired:\s*true/);
  assert.match(db, /Vérifier et masquer les données de tiers/);
  assert.match(html, /données concernant des tiers/i);
  assert.match(html, /Préparer le dossier de revue/);
});

test('sauvegarde externe : chiffrement authentifié, KDF et secret non persistant', () => {
  const portable = read('src/portable-backup.cjs');
  const main = read('main.cjs');
  const app = read('renderer/app.js');
  assert.match(portable, /aes-256-gcm/i);
  assert.match(portable, /scryptSync/);
  assert.match(portable, /randomBytes\(SALT_BYTES\)/);
  assert.match(portable, /getAuthTag/);
  assert.match(portable, /setAuthTag/);
  assert.match(portable, /length < 12/);
  assert.match(main, /restore-pending\.json/);
  assert.match(main, /pre-encrypted-restore/);
  assert.match(app, /#secret-passphrase/);
  assert.match(app, /\.value = ''/);
  assert.doesNotMatch(main, /setSetting\([^\n]*passphrase/i);
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB/);
});
