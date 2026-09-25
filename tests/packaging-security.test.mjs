import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));

test('qualification packaging : versions critiques épinglées', () => {
  assert.match(pkg.version, /^5\.2\.1-alpha\.\d+$/);
  assert.equal(pkg.devDependencies.electron, '44.4.0');
  assert.equal(pkg.devDependencies['electron-builder'], '26.16.1');
  assert.doesNotMatch(pkg.devDependencies.electron, /^[~^]/);
  assert.doesNotMatch(pkg.devDependencies['electron-builder'], /^[~^]/);
  assert.match(pkg.scripts['dist:win'], /--x64/);
  assert.match(pkg.scripts['dist:win'], /--publish never/);
  assert.match(pkg.scripts['dist:win:dir'], /--win dir/);
  assert.match(pkg.scripts['dist:win:dir'], /--publish never/);
});

test('qualification packaging : fuses Electron cohérents avec le renderer file://', () => {
  const fuses = pkg.build?.electronFuses || {};
  assert.equal(fuses.runAsNode, false);
  assert.equal(fuses.enableNodeOptionsEnvironmentVariable, false);
  assert.equal(fuses.enableNodeCliInspectArguments, false);
  assert.equal(fuses.enableEmbeddedAsarIntegrityValidation, true);
  assert.equal(fuses.onlyLoadAppFromAsar, true);
  assert.equal(fuses.loadBrowserProcessSpecificV8Snapshot, false);
  assert.equal(fuses.grantFileProtocolExtraPrivileges, true);
});

test('qualification packaging R1 : arbre runtime explicite sans maquette ni outillage QA', () => {
  assert.equal(pkg.main, 'main-entry.cjs');
  const files = pkg.build?.files || [];
  assert.ok(files.includes('**/*'), 'le package doit partir de l’arbre applicatif complet');
  for (const exclusion of ['!tests/**', '!docs/**', '!.github/**', '!design/**', '!quality/**', '!scripts/**']) {
    assert.ok(files.includes(exclusion), `exclusion de packaging absente : ${exclusion}`);
  }
  for (const requiredOnDisk of [
    'main-entry.cjs',
    'main-bootstrap.cjs',
    'main.cjs',
    'preload.cjs',
    'src/database.cjs',
    'src/storage.cjs',
    'src/portable-backup.cjs',
    'renderer/index.html',
    'renderer/styles.css',
    'renderer/v51.css',
    'renderer/app.js',
    'renderer/detail.js',
    'renderer/detail.css'
  ]) {
    assert.ok(fs.existsSync(requiredOnDisk), `fichier runtime absent du dépôt : ${requiredOnDisk}`);
  }
  assert.equal(fs.existsSync('renderer/dashboard-vf.css'), false, 'l’ancienne feuille dual-shell doit être supprimée');
});

test('qualification UI R1 : intégration statique, CSP stricte et shell unique', () => {
  const preload = read('preload.cjs');
  const index = read('renderer/index.html');
  const app = read('renderer/app.js');

  assert.match(index, /style-src 'self'/);
  assert.match(index, /connect-src 'none'/);
  assert.match(index, /href="\.\/styles\.css"/);
  assert.match(index, /href="\.\/v51\.css"/);
  assert.match(index, /href="\.\/detail\.css"/);
  assert.doesNotMatch(index, /dashboard-vf\.css/);
  assert.equal((index.match(/id="app-shell"/g) || []).length, 1);
  assert.equal((index.match(/id="main-region"/g) || []).length, 1);
  assert.doesNotMatch(index, /id="vf-dashboard"|data-vf-master|dashboard-mode/);
  assert.match(index, /<script src="\.\/detail\.js"><\/script>/);

  assert.doesNotMatch(preload, /document\.|createElement|appendChild|insertAdjacent|innerHTML|outerHTML|insertCSS/);
  assert.doesNotMatch(preload, /RDL_VISUAL_TEST|visual-test-mode|rdl-visual-test/);
  assert.doesNotMatch(app, /visualTestMode|renderVisualDashboard|visualMasterRows/);
  assert.match(app, /assertDomContract/);
  assert.match(app, /view\.hidden = !active/);
  assert.match(app, /data-view-panel/);

  assert.match(pkg.scripts.check, /renderer\/app\.js/);
  assert.match(pkg.scripts.check, /renderer\/detail\.js/);
});

test('qualification UI R1 : anciennes couches et shell de fidélité supprimées du runtime', () => {
  for (const obsolete of [
    'renderer/theme-v521.js',
    'renderer/fidelity-master-v521.css',
    'renderer/fidelity-master-v521.js',
    'renderer/parity-v521.js',
    'renderer/dashboard-vf.css'
  ]) {
    assert.equal(fs.existsSync(obsolete), false, `ancienne couche encore présente : ${obsolete}`);
  }
});

test('qualification packaging : aucune publication automatique hors workflow de qualification', () => {
  assert.equal(pkg.build?.publish, undefined);
  assert.match(pkg.scripts['dist:win'], /--publish never/);
  assert.match(pkg.scripts['dist:win:dir'], /--publish never/);
});