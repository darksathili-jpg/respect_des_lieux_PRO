import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapter = fs.readFileSync('src/e2e-native-dialog-adapter.cjs', 'utf8');
const entry = fs.readFileSync('main-entry.cjs', 'utf8');
const preload = fs.readFileSync('preload.cjs', 'utf8');
const main = fs.readFileSync('main.cjs', 'utf8');

test('E2E natif : adaptateur inerte sans variables dédiées et limité au profil isolé', () => {
  assert.match(adapter, /process\.env\.RDL_R3_E2E_PHOTO_PATH/);
  assert.match(adapter, /process\.env\.RDL_R4_E2E_BACKUP_PATH/);
  assert.match(adapter, /process\.env\.RDL_R4_E2E_REVIEW_PATH/);
  assert.match(adapter, /LOCALAPPDATA/);
  assert.match(adapter, /insideIsolatedProfile/);
  assert.match(adapter, /options\?\.title === 'Ajouter une photo JPEG'/);
  assert.match(adapter, /options\?\.title === 'Exporter une sauvegarde chiffrée'/);
  assert.match(adapter, /options\?\.title === 'Choisir une sauvegarde chiffrée à restaurer'/);
  assert.match(adapter, /options\?\.title === 'Enregistrer le dossier de revue des droits'/);
  assert.doesNotMatch(adapter, /ipcMain|contextBridge|ipcRenderer/);
  assert.match(entry, /e2e-native-dialog-adapter\.cjs/);
});

test('E2E natif : aucune API de chemin arbitraire n’est exposée au renderer', () => {
  assert.doesNotMatch(preload, /E2E_PHOTO_PATH|E2E_BACKUP_PATH|E2E_REVIEW_PATH|attachPhotoFromPath|attachPhotoFixture|e2eAttach/i);
  assert.doesNotMatch(main, /rdl:e2e|attach-from-path|photo-path|backup-path|review-path/i);
});
