import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const contract = JSON.parse(read('quality/ui-contract.json'));
const html = read('renderer/index.html');
const css = read('renderer/dashboard-vf.css');
const detailCss = read('renderer/detail.css');
const pkg = JSON.parse(read('package.json'));
const preload = read('preload.cjs');
const main = read('main.cjs');

const requested = process.argv.includes('--role')
  ? process.argv[process.argv.indexOf('--role') + 1]
  : 'all';

const failures = [];
const passes = [];

function check(role, condition, message) {
  if (condition) passes.push(`[${role}] ${message}`);
  else failures.push(`[${role}] ${message}`);
}

function navFromMasterShell() {
  const navMatch = html.match(/<nav class="vf-nav"[\s\S]*?<\/nav>/);
  if (!navMatch) return [];
  const source = navMatch[0];
  const rx = /<button[^>]*data-view="([^"]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>\s*<\/button>/g;
  return [...source.matchAll(rx)].map((m) => ({ view: m[1], label: m[2].trim() }));
}

const productionMarker = 'PHASE C';
const productionCss = css.includes(productionMarker) ? css.slice(css.indexOf(productionMarker)) : css;

const roles = {
  architecture() {
    const nav = contract.navigation;
    check('architecture', Array.isArray(nav) && nav.length === 6, 'le contrat définit exactement six destinations métier');
    check('architecture', new Set(nav.map((x) => x.view)).size === nav.length, 'les identifiants de vues du contrat sont uniques');
    check('architecture', new Set(nav.map((x) => x.label)).size === nav.length, 'les libellés de navigation du contrat sont uniques');
    check('architecture', contract.requiredProductionAssets.every(exists), 'les assets de production déclarés existent dans le dépôt');
    check('architecture', exists('renderer/detail.js') && exists('renderer/app.js'), 'les renderers métier sont présents');
  },

  ui() {
    const actual = navFromMasterShell();
    check('ui', JSON.stringify(actual) === JSON.stringify(contract.navigation), 'la navigation visible correspond exactement au contrat fonctionnel');
    check('ui', !contract.forbiddenNavigationLabels.some((label) => actual.some((x) => x.label === label)), 'aucune catégorie décorative ne remplace une vraie vue métier');
    check('ui', productionCss.includes('./assets/dashboard-hero-master.webp'), 'le hero de production utilise son asset dédié');
    check('ui', !productionCss.includes('dashboard-master.png'), 'la capture maître n’est jamais utilisée comme faux contrôle dans le CSS de production');
    check('ui', detailCss.includes('scrollbar-gutter:stable'), 'la fiche détail réserve la gouttière de scrollbar');
    check('ui', /@media\(max-width:900px\)[\s\S]*detail-columns\{grid-template-columns:1fr\}/.test(detailCss), 'la fiche détail bascule en une colonne sur viewport étroit');
  },

  functional() {
    for (const view of contract.requiredViews) {
      check('functional', html.includes(`id="${view}"`), `la vue ${view} existe réellement`);
    }
    for (const id of contract.requiredControls) {
      check('functional', html.includes(`id="${id}"`), `le contrôle fonctionnel #${id} existe`);
    }
    const actual = navFromMasterShell();
    for (const item of actual) {
      if (item.view === 'dashboard') continue;
      check('functional', html.includes(`id="view-${item.view}"`), `la destination ${item.view} pointe vers une vraie vue`);
    }
  },

  data() {
    check('data-security', html.includes("connect-src 'none'"), 'la CSP bloque les connexions distantes du renderer');
    check('data-security', pkg.description?.includes('données stockées uniquement sur le poste utilisateur'), 'le package déclare explicitement le stockage local');
    check('data-security', main.includes('webSecurity') || main.includes('setWindowOpenHandler') || main.includes('will-navigate'), 'le processus principal contient des garde-fous de navigation/sécurité');
    check('data-security', preload.includes('contextBridge'), 'l’API renderer passe par contextBridge');
    check('data-security', exists('src/database.cjs') && exists('src/portable-backup.cjs'), 'base locale et sauvegarde portable sont présentes');
  },

  electron() {
    check('electron', pkg.main === 'main-bootstrap.cjs', 'le bootstrap Electron attendu est le point d’entrée');
    check('electron', pkg.build?.asar === true, 'ASAR est activé');
    check('electron', pkg.build?.win?.target?.includes('nsis'), 'la cible Windows NSIS est déclarée');
    check('electron', pkg.build?.electronFuses?.runAsNode === false, 'RunAsNode est désactivé');
    check('electron', pkg.build?.electronFuses?.onlyLoadAppFromAsar === true, 'le chargement est limité à l’ASAR empaqueté');
    check('electron', contract.requiredProductionAssets.every(exists), 'les illustrations dédiées seront incluses par le glob de packaging');
  },

  redteam() {
    const actual = navFromMasterShell();
    check('redteam', !contract.forbiddenNavigationLabels.some((label) => actual.some((x) => x.label === label)), 'aucun ancien libellé trompeur ne survit dans la navigation');
    check('redteam', !/min-width\s*:\s*1448px/.test(productionCss), 'le CSS de production n’impose pas le viewport maître 1448 px');
    check('redteam', /\.vf-kpis\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(productionCss), 'les KPI possèdent un repli responsive en deux colonnes');
    check('redteam', detailCss.includes('max-height:calc(100vh - 32px)') || detailCss.includes('max-height:calc(100vh - 20px)'), 'la fiche ne peut pas dépasser la hauteur utile de l’écran');
    check('redteam', !contract.forbiddenProductionPersona.some((text) => html.includes(text)), 'aucune identité/date/météo fictive n’est encodée comme contenu HTML de production');
  }
};

const order = ['architecture', 'ui', 'functional', 'data', 'electron', 'redteam'];
if (requested === 'all') {
  for (const role of order) roles[role]();
} else if (roles[requested]) {
  roles[requested]();
} else {
  console.error(`Rôle inconnu: ${requested}`);
  process.exit(2);
}

for (const line of passes) console.log(`PASS ${line}`);
for (const line of failures) console.error(`FAIL ${line}`);

if (failures.length) {
  console.error(`\nQUALITY_GATE_REJECTED: ${failures.length} contrôle(s) en échec.`);
  process.exit(1);
}

console.log(`\nQUALITY_GATE_PASS: ${passes.length} contrôle(s) validés pour le rôle ${requested}.`);
