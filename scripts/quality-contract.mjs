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
const v51 = read('renderer/v51.css');
const detailCss = read('renderer/detail.css');
const app = read('renderer/app.js');
const detailJs = read('renderer/detail.js');
const preload = read('preload.cjs');
const main = read('main.cjs');
const pkg = JSON.parse(read('package.json'));

const runtimeText = [html, styles, v51, detailCss, app, detailJs, preload].join('\n');
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

const roles = {
  architecture() {
    check('architecture', contract.schemaVersion >= 3, 'le contrat R1 de shell unique est actif');
    check('architecture', count(html, /id="app-shell"/g) === 1, 'une seule shell de production existe dans le DOM');
    check('architecture', count(html, /id="main-region"/g) === 1, 'une seule région principale existe');
    check('architecture', !html.includes('vf-dashboard'), 'l’ancienne surface de fidélité est absente du DOM');
    check('architecture', contract.forbiddenRuntimeFiles.every((file) => !exists(file)), 'les anciens fichiers runtime interdits sont supprimés');
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
    check('ui', !styles.includes('min-width:1448px'), 'aucune largeur maître 1448 px n’est imposée');
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
  },

  redteam() {
    const actual = navFromSingleShell();
    check('redteam', new Set(actual.map((x) => x.view)).size === actual.length, 'aucune destination de navigation n’est dupliquée');
    check('redteam', !contract.forbiddenProductionPersona.some((text) => html.includes(text)), 'aucune persona ou donnée fictive interdite n’est encodée');
    check('redteam', !runtimeText.includes('dashboard-master.png'), 'la capture maître ne peut pas être utilisée comme interface');
    check('redteam', !runtimeText.includes('visual-test-mode'), 'aucun mode de rendu parallèle ne subsiste');
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