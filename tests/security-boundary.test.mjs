import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('frontière Electron : renderer isolé de Node et permissions bloquées', () => {
  const main = read('main.cjs');
  const preload = read('preload.cjs');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /will-attach-webview/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /assertTrustedIpc/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
});

test('renderer entièrement local : aucun backend cloud exécutable', () => {
  const html = read('renderer/index.html');
  const app = read('renderer/app.js');
  const main = read('main.cjs');
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /supabase|firebase|axios|fetch\(/i);
  assert.doesNotMatch(app, /supabase|firebase|fetch\(|XMLHttpRequest|WebSocket/i);
  assert.match(main, /http:\/\/\*\/\*/);
  assert.match(main, /https:\/\/\*\/\*/);
});

test('aucune donnée métier ni secret dans les stockages navigateur', () => {
  const html = read('renderer/index.html');
  const app = read('renderer/app.js');
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB/);
});

test('garde-fous SQLite et photos présents', () => {
  const db = read('src/database.cjs');
  const storage = read('src/storage.cjs');
  assert.match(db, /journal_mode = WAL/);
  assert.match(db, /synchronous = FULL/);
  assert.match(db, /foreign_keys = ON/);
  assert.match(storage, /MAX_PHOTO_BYTES/);
  assert.match(storage, /3 \* 1024 \* 1024/);
  assert.match(storage, /MAX_PHOTOS_PER_SIGNALEMENT/);
  assert.match(storage, /sha256/);
});

test('minimisation scolaire et masquage des identités restent actifs', () => {
  const html = read('renderer/index.html');
  const app = read('renderer/app.js');
  assert.match(html, /Minimisation/i);
  assert.match(html, /facultatif/i);
  assert.match(html, /Ne pas saisir/i);
  assert.match(app, /protectedIdentity/);
  assert.match(app, /••••••/);
  assert.match(app, /visibilitychange/);
});

test('cycle de vie : pas de durée arbitraire ni de purge automatique', () => {
  const db = read('src/database.cjs');
  const app = read('renderer/app.js');
  assert.match(db, /retention_policy/);
  assert.match(db, /confirmed/);
  assert.match(db, /identity_reduced_at/);
  assert.match(db, /privacy_events/);
  assert.match(app, /confirmationNum/);
  assert.doesNotMatch(db, /DELETE FROM signalements WHERE[^;]*date/i);
});

test('registre de purge persistant hors base empêche une restauration de ressusciter un dossier', () => {
  const main = read('main.cjs');
  assert.match(main, /privacy-purge-ledger\.json/);
  assert.match(main, /reconcilePrivacyLedger/);
  assert.match(main, /purge_reapplied_after_restore/);
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
  // Le formulaire secret est remis à zéro à chaque ouverture : aucune phrase
  // précédente ne peut être réutilisée ou relue lors d'une nouvelle opération.
  assert.match(app, /const form = \$\('#secret-form'\);[\s\S]*?form\.reset\(\);/);
  assert.doesNotMatch(main, /setSetting\([^\n]*passphrase/i);
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB/);
});
