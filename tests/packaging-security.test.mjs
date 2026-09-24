import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

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

test('qualification packaging : arbre applicatif complet et nouveau dashboard présents', () => {
  assert.equal(pkg.main, 'main-bootstrap.cjs');
  const files = pkg.build?.files || [];
  assert.ok(files.includes('**/*'), 'le package doit partir de l’arbre applicatif complet');
  for (const forbidden of ['!renderer/**', '!renderer/**/*', '!src/**', '!src/**/*', '!design/**', '!design/**/*']) {
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
    'renderer/dashboard-vf.css',
    'renderer/app.js',
    'renderer/detail.js',
    'renderer/detail.css',
    'design/reference/dashboard-master.png'
  ]) {
    assert.ok(fs.existsSync(requiredOnDisk), `fichier runtime absent du dépôt : ${requiredOnDisk}`);
  }
});

test('qualification UI Phase B/C : intégration statique, CSP stricte et preload sans injection graphique', () => {
  const preload = fs.readFileSync('preload.cjs', 'utf8');
  const index = fs.readFileSync('renderer/index.html', 'utf8');
  const dashboardCss = fs.readFileSync('renderer/dashboard-vf.css', 'utf8');
  const app = fs.readFileSync('renderer/app.js', 'utf8');
  const detail = fs.readFileSync('renderer/detail.js', 'utf8');

  assert.match(index, /style-src 'self'/);
  assert.match(index, /\.\/dashboard-vf\.css/);
  assert.match(index, /\.\/detail\.css/);
  assert.match(index, /id="vf-dashboard"/);
  assert.match(index, /data-vf-master="dashboard-master-2026-09-24"/);
  assert.match(index, /<script src="\.\/detail\.js"><\/script>/);

  // Le preload n'injecte toujours aucune couche graphique. Phase C lui permet
  // seulement de poser le marqueur visual-test-mode qui isole le master figé
  // de l'interface responsive de production. Toute extension de cet accès DOM
  // doit faire échouer ce gate et être revue explicitement.
  const documentRefs = preload.match(/document\./g) || [];
  assert.equal(documentRefs.length, 2, 'le preload ne doit contenir que les deux accès DOM du marqueur de qualification');
  assert.match(preload, /document\.body\?\.classList\.toggle\('visual-test-mode', visualTest\)/);
  assert.match(preload, /document\.readyState === 'loading'/);
  assert.doesNotMatch(preload, /createElement|appendChild|insertAdjacent|innerHTML|outerHTML|insertCSS/);
  assert.doesNotMatch(preload, /appendLocalStyle|appendLocalScript|installUiLayers/);
  assert.doesNotMatch(preload, /theme-v521|fidelity-master-v521|parity-v521/);

  assert.match(dashboardCss, /width:1448px;height:1086px/);
  assert.match(dashboardCss, /dashboard-master\.png/);
  assert.match(dashboardCss, /grid-template-columns:repeat\(4,242px\)/);
  assert.match(dashboardCss, /grid-template-columns:512px 482px/);
  assert.match(dashboardCss, /body:not\(\.visual-test-mode\)\.dashboard-mode/);
  assert.match(dashboardCss, /body:not\(\.visual-test-mode\):not\(\.dashboard-mode\)>#vf-dashboard/);

  assert.match(app, /visualTestMode/);
  assert.match(app, /vf-kpi-pending/);
  assert.match(app, /state\.reparations\.filter/);
  assert.match(app, /closed_at/);
  assert.match(app, /dashboard-mode/);
  assert.match(detail, /signal-detail-dialog/);
  assert.match(detail, /data-fiche/);
  assert.match(detail, /listPhotos/);
  assert.match(detail, /openPhoto/);
  assert.match(detail, /listReparations/);

  assert.match(pkg.scripts.check, /renderer\/app\.js/);
  assert.match(pkg.scripts.check, /renderer\/detail\.js/);
  assert.doesNotMatch(pkg.scripts.check, /theme-v521|fidelity-master-v521|parity-v521/);
});

test('qualification UI Phase B : anciennes couches V5.2.1 supprimées du runtime', () => {
  for (const obsolete of [
    'renderer/theme-v521.js',
    'renderer/fidelity-master-v521.css',
    'renderer/fidelity-master-v521.js',
    'renderer/parity-v521.js'
  ]) {
    assert.equal(fs.existsSync(obsolete), false, `ancienne couche encore présente : ${obsolete}`);
  }
});

test('qualification packaging : aucune publication automatique hors workflow de qualification', () => {
  assert.equal(pkg.build?.publish, undefined);
  assert.match(pkg.scripts['dist:win'], /--publish never/);
  assert.match(pkg.scripts['dist:win:dir'], /--publish never/);
});
