import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapter = fs.readFileSync('src/e2e-native-dialog-adapter.cjs', 'utf8');
const entry = fs.readFileSync('main-entry.cjs', 'utf8');
const preload = fs.readFileSync('preload.cjs', 'utf8');
const main = fs.readFileSync('main.cjs', 'utf8');

test('R3 E2E : l’adaptateur natif est inerte sans variable dédiée et ne crée aucun IPC fichier', () => {
  assert.match(adapter, /process\.env\.RDL_R3_E2E_PHOTO_PATH/);
  assert.match(adapter, /if \(fixture\)/);
  assert.match(adapter, /LOCALAPPDATA/);
  assert.match(adapter, /insideIsolatedProfile/);
  assert.match(adapter, /options\?\.title === 'Ajouter une photo JPEG'/);
  assert.doesNotMatch(adapter, /ipcMain|contextBridge|ipcRenderer/);
  assert.match(entry, /e2e-native-dialog-adapter\.cjs/);
});

test('R3 E2E : aucune API de chemin arbitraire n’est exposée au renderer', () => {
  assert.doesNotMatch(preload, /E2E_PHOTO_PATH|attachPhotoFromPath|attachPhotoFixture|e2eAttach/i);
  assert.doesNotMatch(main, /rdl:e2e|attach-from-path|photo-path/i);
});
