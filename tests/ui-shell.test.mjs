import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const html = read('renderer/index.html');
const app = read('renderer/app.js');
const preload = read('preload.cjs');
const styles = read('renderer/styles.css');
const tokens = read('renderer/tokens.css');
const components = read('renderer/components.css');
const layout = read('renderer/layout.css');
const home = read('renderer/home.css');
const bootstrap = read('main-bootstrap.cjs');

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
  assert.match(layout, /\.shell\{[^}]*min-height:100vh;[^}]*display:grid/);
});

test('R1 : les actions structurelles des vues réelles sont branchées', () => {
  assert.match(app, /\$\('#backup-view-action'\)\.addEventListener\('click', createLocalBackup\)/);
  assert.match(app, /const container = \$\('#privacy-events'\)/);
  assert.match(app, /\$\('#open-data'\)\.addEventListener/);
  assert.match(app, /\$\('#open-backups'\)\.addEventListener/);
  assert.match(app, /\$\('#open-exports'\)\.addEventListener/);
});

test('R4-P3a : le design system reste découpé en couches et utilise uniquement les vrais assets Watteau', () => {
  assert.match(styles, /@import url\('\.\/tokens\.css'\);[\s\S]*@import url\('\.\/components\.css'\);[\s\S]*@import url\('\.\/layout\.css'\);[\s\S]*@import url\('\.\/home\.css'\);/);
  assert.match(tokens, /--rdl-ds-ready:r2/);
  assert.match(tokens, /--rdl-focus:/);
  assert.match(tokens, /--watteau-navy:/);
  assert.match(tokens, /--watteau-brick:/);
  assert.match(components, /:focus-visible/);
  assert.match(components, /prefers-reduced-motion:reduce/);
  assert.match(layout, /watteau-sidebar-mark\.svg/);
  assert.match(home, /watteau-home-hero\.svg/);
  assert.equal(fs.existsSync('renderer/assets/watteau-sidebar-mark.svg'), true);
  assert.equal(fs.existsSync('renderer/assets/watteau-home-hero.svg'), true);
  assert.doesNotMatch(`${styles}\n${tokens}\n${components}\n${layout}\n${home}`, /dashboard-master\.png|data:image|vf-dashboard/);
});

test('R4-P3a : le vrai runtime empaqueté contrôle le design system et les assets Watteau', () => {
  assert.match(bootstrap, /designSystem\?\.ready === 'r2'/);
  assert.match(bootstrap, /watteau-sidebar-mark\.svg/);
  assert.match(bootstrap, /watteau-home-hero\.svg/);
  assert.match(bootstrap, /getComputedStyle\(hero, '::after'\)/);
  assert.match(bootstrap, /heroHeadline === 'Bonjour !'/);
  assert.match(bootstrap, /localPathVisible === false/);
});

test('R4-P3a : les replis responsive couvrent shell et Accueil sans dépendre d’un breakpoint historique unique', () => {
  assert.match(layout, /@media \(max-width:820px\)/);
  assert.match(layout, /@media \(max-width:560px\)/);
  assert.match(home, /@media \(max-width:980px\)/);
  assert.match(home, /@media \(max-width:700px\)/);
  assert.match(home, /@media \(max-width:560px\)/);
});

test('R4-P3b : le root est verrouillé et la shell devient l’unique scroller vertical', () => {
  assert.match(layout, /html,body\{[^}]*width:100%;[^}]*height:100%;[^}]*overflow:hidden/);
  assert.match(layout, /\.shell\{[^}]*height:100vh;[^}]*overflow-x:hidden;[^}]*overflow-y:auto/);
  assert.match(layout, /\.main\{[^}]*overflow-x:hidden/);
  assert.match(layout, /\.sidebar\{[^}]*overflow-x:hidden/);
  assert.match(layout, /\.sidebar\{[^}]*width:100%;[^}]*max-width:100%;[^}]*min-width:0/);
  assert.match(layout, /\.nav-label\{[^}]*min-width:0;[^}]*overflow-wrap:anywhere/);
});
