import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const contract = JSON.parse(read('quality/ui-contract.json'));
const releaseState = JSON.parse(read('quality/release-state.json'));
const html = read('renderer/index.html');
const styles = read('renderer/styles.css');
const tokens = read('renderer/tokens.css');
const components = read('renderer/components.css');
const layout = read('renderer/layout.css');
const home = read('renderer/home.css');
const v51 = read('renderer/v51.css');
const detailCss = read('renderer/detail.css');
const app = read('renderer/app.js');
const detailJs = read('renderer/detail.js');
const preload = read('preload.cjs');
const main = read('main.cjs');
const bootstrap = read('main-bootstrap.cjs');
const pkg = JSON.parse(read('package.json'));

const runtimeText = [html, styles, tokens, components, layout, home, v51, detailCss, app, detailJs, preload].join('\n');
const requested = process.argv.includes('--role')
  ? process.argv[process.argv.indexOf('--role') + 1]
  : 'all';

const failures = [];
const passes = [];

function check(role, condition, message) {
  if (condition) passes.push(`[${role}] ${message}`);
  else failures.push(`[${role}] ${message}`);
}

function count(source, rx) {
  return [...source.matchAll(rx)].length;
}

function navFromSingleShell() {
  const shellMatch = html.match(/<div id="app-shell"[\s\S]*?<main id="main-region"/);
  if (!shellMatch) return [];
  const navMatch = shellMatch[0].match(/<nav[^>]*>[\s\S]*?<\/nav>/);
  if (!navMatch) return [];
  const rx = /<button[^>]*data-view="([^"]+)"[^>]*>([^<]+)<\/button>/g;
  return [...navMatch[0].matchAll(rx)].map((m) => ({ view: m[1], label: m[2].trim() }));
}

function viewHasHiddenByDefault(view) {
  if (view === 'view-dashboard') return true;
  const rx = new RegExp(`<section[^>]*id="${view}"[^>]*hidden[^>]*>`);
  return rx.test(html);
}

function importedInOrder() {
  const expected = [
    "@import url('./tokens.css');",
    "@import url('./components.css');",
    "@import url('./layout.css');",
    "@import url('./home.css');"
  ];
  let cursor = -1;
  for (const item of expected) {
    const next = styles.indexOf(item);
    if (next <= cursor) return false;
    cursor = next;
  }
  return true;
}

const roles = {
  architecture() {
    check('architecture', contract.schemaVersion >= 4, 'le contrat R2 du design system est actif');
    check('architecture', count(html, /id="app-shell"/g) === 1, 'une seule shell de production existe dans le DOM');
    check('architecture', count(html, /id="main-region"/g) === 1, 'une seule région principale existe');
    check('architecture', !html.includes('vf-dashboard'), 'l’ancienne surface de fidélité est absente du DOM');
    check('architecture', contract.forbiddenRuntimeFiles.every((file) => !exists(file)), 'les anciens fichiers runtime interdits sont supprimés');
    check('architecture', contract.designSystem.layers.every((file) => exists(file)), 'les quatre couches du design system R2 existent');
    check('architecture', contract.designSystem.requiredAssets.every((file) => exists(file)), 'les assets de production R2 existent comme fichiers autonomes');
    check('architecture', importedInOrder(), 'la cascade suit tokens → composants → layout → Accueil');
    check('architecture', releaseState.releaseFrozen === true, 'la publication reste gelée pendant la reconstruction');
    check('architecture', pkg.main === 'main-entry.cjs', 'le point d’entrée Electron déclaré correspond au package réel');
  },

  ui() {
    const actual = navFromSingleShell();
    check('ui', JSON.stringify(actual) === JSON.stringify(contract.navigation), 'la navigation de la shell unique correspond au contrat');
    check('ui', actual.length === 6, 'la shell expose exactement six destinations métier');
    check('ui', !contract.forbiddenNavigationLabels.some((label) => actual.some((x) => x.label === label)), 'aucun libellé décoratif ne remplace une vraie destination');
    for (const view of contract.requiredViews) {
      check('ui', html.includes(`id="${view}"`), `la vue ${view} existe`);
      check('ui', viewHasHiddenByDefault(view), `${view} possède un état initial déterministe`);
    }
    for (const token of contract.forbiddenRuntimeTokens) {
      check('ui', !runtimeText.includes(token), `le runtime ne contient pas le marqueur interdit ${token}`);
    }
    for (const token of contract.designSystem.requiredTokens) {
      check('ui', tokens.includes(token), `le token ${token} est défini dans la source unique`);
    }
    check('ui', /:focus-visible/.test(components), 'les composants possèdent un focus clavier explicite');
    check('ui', /prefers-reduced-motion:reduce/.test(components), 'le mouvement réduit est respecté');
    check('ui', /@media \(max-width:820px\)/.test(layout) && /@media \(max-width:640px\)/.test(home), 'la shell et l’Accueil possèdent des replis responsive distincts');
    check('ui', home.includes("dashboard-hero-production.svg") && layout.includes("sidebar-logo-production.svg"), 'les deux vrais SVG de production sont intégrés à la composition');
    check('ui', !/data:image|dashboard-master\.png/.test(`${layout}\n${home}`), 'aucune image embarquée ou capture maître ne sert de rustine visuelle');
    check('ui', !runtimeText.includes('min-width:1448px'), 'aucune largeur maître 1448 px n’est imposée');
  },

  functional() {
    for (const id of contract.requiredControls) {
      check('functional', html.includes(`id="${id}"`), `le contrôle #${id} existe dans la shell réelle`);
    }
    check('functional', app.includes('assertDomContract'), 'le renderer vérifie son contrat DOM au démarrage');
    check('functional', app.includes("view.hidden = !active"), 'la navigation pilote directement la visibilité des six vues');
    check('functional', app.includes("button.setAttribute('aria-current', 'page')"), 'la destination active est exposée à l’accessibilité');
    check('functional', app.includes("$('#backup-view-action').addEventListener('click', createLocalBackup)"), 'le bouton de sauvegarde de la vue est réellement branché');
    check('functional', app.includes("const container = $('#privacy-events')"), 'la traçabilité confidentialité cible le conteneur réellement présent');
    check('functional', !app.includes('visualTestMode') && !app.includes('renderVisualDashboard'), 'aucune branche UI alternative ne court-circuite la production');
    check('functional', bootstrap.includes("designSystem?.ready === 'r2'") && bootstrap.includes('dashboard-hero-production.svg') && bootstrap.includes('sidebar-logo-production.svg'), 'le vrai EXE vérifie le design system et ses assets au smoke test');
    check('functional', detailJs.includes('closeDetailDialog') && detailJs.includes('event.target === dialog'), 'la fiche détail dispose de sorties explicites');
  },

  data() {
    check('data-security', html.includes("connect-src 'none'"), 'la CSP bloque les connexions distantes du renderer');
    check('data-security', pkg.description?.includes('données stockées uniquement sur le poste utilisateur'), 'le package déclare explicitement le stockage local');
    check('data-security', main.includes('setWindowOpenHandler') && main.includes('will-navigate'), 'la navigation Electron est bornée');
    check('data-security', preload.includes('contextBridge'), 'l’API renderer passe par contextBridge');
    check('data-security', !/localStorage|sessionStorage|indexedDB/.test(`${app}\n${preload}`), 'aucune donnée métier n’est stockée dans les stockages navigateur');
  },

  electron() {
    const files = pkg.build?.files || [];
    check('electron', pkg.build?.asar === true, 'ASAR est activé');
    check('electron', pkg.build?.win?.target?.includes('nsis'), 'la cible Windows NSIS est déclarée');
    check('electron', pkg.build?.electronFuses?.runAsNode === false, 'RunAsNode est désactivé');
    check('electron', pkg.build?.electronFuses?.onlyLoadAppFromAsar === true, 'le chargement est limité à l’ASAR empaqueté');
    check('electron', files.includes('!design/**'), 'les maquettes et preuves de conception sont exclues du binaire');
    check('electron', files.includes('!quality/**') && files.includes('!scripts/**'), 'les outils de qualification ne sont pas embarqués dans le runtime');
    check('electron', contract.designSystem.layers.every((file) => exists(file)), 'les feuilles R2 destinées au runtime sont présentes avant packaging');
  },

  redteam() {
    const actual = navFromSingleShell();
    check('redteam', new Set(actual.map((x) => x.view)).size === actual.length, 'aucune destination de navigation n’est dupliquée');
    check('redteam', !contract.forbiddenProductionPersona.some((text) => html.includes(text)), 'aucune persona ou donnée fictive interdite n’est encodée');
    check('redteam', !runtimeText.includes('dashboard-master.png'), 'la capture maître ne peut pas être utilisée comme interface');
    check('redteam', !runtimeText.includes('visual-test-mode'), 'aucun mode de rendu parallèle ne subsiste');
    check('redteam', !/url\([^)]*(master|reference)/i.test(runtimeText), 'aucun asset de référence ou master n’est appelé par CSS');
    check('redteam', detailCss.includes('max-height:calc(100vh - 32px)') || detailCss.includes('max-height:calc(100vh - 20px)'), 'la fiche détail reste bornée par la hauteur utile');
    check('redteam', detailJs.includes("dialog.addEventListener('cancel'") && detailJs.includes('[data-detail-close]'), 'la fermeture de fiche garde plusieurs chemins indépendants');
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
