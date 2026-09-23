import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('qualification packaging : versions critiques épinglées', () => {
  assert.match(pkg.version, /^5\.2\.0-alpha\.\d+$/);
  assert.equal(pkg.devDependencies.electron, '44.4.0');
  assert.equal(pkg.devDependencies['electron-builder'], '26.16.1');
  assert.doesNotMatch(pkg.devDependencies.electron, /^[~^]/);
  assert.doesNotMatch(pkg.devDependencies['electron-builder'], /^[~^]/);
  assert.match(pkg.scripts['dist:win'], /--x64/);
  assert.match(pkg.scripts['dist:win'], /--publish never/);
});

test('qualification packaging : fuses Electron cohérents avec le renderer file://', () => {
  const fuses = pkg.build?.electronFuses || {};
  assert.equal(fuses.runAsNode, false);
  assert.equal(fuses.enableNodeOptionsEnvironmentVariable, false);
  assert.equal(fuses.enableNodeCliInspectArguments, false);
  assert.equal(fuses.enableEmbeddedAsarIntegrityValidation, true);
  assert.equal(fuses.onlyLoadAppFromAsar, true);
  assert.equal(fuses.loadBrowserProcessSpecificV8Snapshot, false);
  // Tant que createWindow utilise BrowserWindow.loadFile(file://), ce fuse doit
  // rester activé. Le désactiver produit une fenêtre vide / ERR_FILE_NOT_FOUND
  // sur les fichiers pourtant présents dans app.asar sous Windows.
  assert.equal(fuses.grantFileProtocolExtraPrivileges, true);
});

test('qualification packaging : arbre applicatif complet, UI non exclue', () => {
  assert.equal(pkg.main, 'main-bootstrap.cjs');
  const files = pkg.build?.files || [];
  assert.ok(files.includes('**/*'), 'le package doit partir de l’arbre applicatif complet');
  for (const forbidden of ['!renderer/**', '!renderer/**/*', '!src/**', '!src/**/*']) {
    assert.ok(!files.includes(forbidden), `exclusion interdite : ${forbidden}`);
  }
  for (const requiredOnDisk of [
    'main-bootstrap.cjs',
    'main.cjs',
    'preload.cjs',
    'src/database.cjs',
    'src/storage.cjs',
    'src/portable-backup.cjs',
    'renderer/index.html',
    'renderer/styles.css',
    'renderer/v51.css',
    'renderer/app.js'
  ]) {
    assert.ok(fs.existsSync(requiredOnDisk), `fichier runtime absent du dépôt : ${requiredOnDisk}`);
  }
});

test('qualification packaging : aucune publication automatique', () => {
  assert.equal(pkg.build?.publish, undefined);
  assert.match(pkg.scripts['dist:win'], /--publish never/);
});
