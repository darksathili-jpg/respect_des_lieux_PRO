import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const html = read('renderer/index.html');
const app = read('renderer/app.js');
const preload = read('preload.cjs');
const styles = read('renderer/styles.css');

const count = (source, rx) => [...source.matchAll(rx)].length;
const expectedViews = ['dashboard', 'signalements', 'reparations', 'sauvegardes', 'confidentialite', 'systeme'];

function navViews() {
  const shell = html.match(/<div id="app-shell"[\s\S]*?<main id="main-region"/);
  assert.ok(shell, 'shell unique introuvable');
  return [...shell[0].matchAll(/<button[^>]*data-view="([^"]+)"/g)].map((match) => match[1]);
}

function panelViews() {
  return [...html.matchAll(/<section[^>]*data-view-panel="([^"]+)"/g)].map((match) => match[1]);
}

test('R1 : une seule shell de production et aucune interface visuelle parallèle', () => {
  assert.equal(count(html, /id="app-shell"/g), 1);
  assert.equal(count(html, /id="main-region"/g), 1);
  assert.doesNotMatch(html, /vf-dashboard|dashboard-vf\.css|dashboard-mode/);
  assert.equal(fs.existsSync('renderer/dashboard-vf.css'), false);
  assert.doesNotMatch(preload, /RDL_VISUAL_TEST|visual-test-mode|rdl-visual-test/);
  assert.doesNotMatch(app, /visualTestMode|renderVisualDashboard|vf-kpi|visualMasterRows/);
});

test('R1 : les six destinations correspondent exactement aux six vues métier', () => {
  assert.deepEqual(navViews(), expectedViews);
  assert.deepEqual(panelViews(), expectedViews);
  for (const view of expectedViews.slice(1)) {
    assert.match(html, new RegExp(`<section[^>]*data-view-panel="${view}"[^>]*hidden`));
  }
});

test('R1 : la navigation agit directement sur les vues de la shell unique', () => {
  assert.match(app, /function assertDomContract\(\)/);
  assert.match(app, /view\.hidden = !active/);
  assert.match(app, /button\.setAttribute\('aria-current', 'page'\)/);
  assert.match(app, /\$\$\('#app-shell \.nav\[data-view\]'\)/);
  assert.match(styles, /\.shell\{min-height:100vh;display:grid/);
});

test('R1 : les actions structurelles des vues réelles sont branchées', () => {
  assert.match(app, /\$\('#backup-view-action'\)\.addEventListener\('click', createLocalBackup\)/);
  assert.match(app, /const container = \$\('#privacy-events'\)/);
  assert.match(app, /\$\('#open-data'\)\.addEventListener/);
  assert.match(app, /\$\('#open-backups'\)\.addEventListener/);
  assert.match(app, /\$\('#open-exports'\)\.addEventListener/);
});