import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);
const count = (source, rx) => [...source.matchAll(rx)].length;

const html = read('renderer/index.html');
const app = read('renderer/app.js');
const preload = read('preload.cjs');
const styles = read('renderer/styles.css');
const detailJs = read('renderer/detail.js');
const detailCss = read('renderer/detail.css');
const pkg = JSON.parse(read('package.json'));
const releaseState = JSON.parse(read('quality/release-state.json'));

const runtime = [html, app, preload, styles, read('renderer/v51.css'), detailJs, detailCss].join('\n');
const expectedViews = ['dashboard', 'signalements', 'reparations', 'sauvegardes', 'confidentialite', 'systeme'];

const navViews = [...html.matchAll(/<button[^>]*class="nav[^>]*data-view="([^"]+)"/g)].map((match) => match[1]);
const panelViews = [...html.matchAll(/<section[^>]*data-view-panel="([^"]+)"/g)].map((match) => match[1]);

check(releaseState.releaseFrozen === true, 'le gel de release reste actif pendant R1');
check(pkg.main === 'main-entry.cjs', 'le point d’entrée Electron déclaré correspond au runtime réel');

check(count(html, /id="app-shell"/g) === 1, 'une seule AppShell existe');
check(count(html, /id="main-region"/g) === 1, 'une seule MainRegion existe');
check(JSON.stringify(navViews) === JSON.stringify(expectedViews), 'la navigation contient exactement les six destinations attendues');
check(JSON.stringify(panelViews) === JSON.stringify(expectedViews), 'les six destinations possèdent exactement six vues métier');
check(expectedViews.slice(1).every((view) => new RegExp(`<section[^>]*data-view-panel="${view}"[^>]*hidden`).test(html)), 'les vues inactives démarrent réellement masquées');

check(!exists('renderer/dashboard-vf.css'), 'la feuille dual-shell a été supprimée');
check(!runtime.includes('vf-dashboard'), 'aucune seconde surface vf-dashboard ne subsiste dans le runtime');
check(!runtime.includes('dashboard-master.png'), 'la capture maître n’est jamais utilisée par le runtime');
check(!runtime.includes('visual-test-mode') && !runtime.includes('RDL_VISUAL_TEST'), 'aucun mode UI alternatif de qualification ne subsiste');
check(!/min-width\s*:\s*1448px/.test(runtime), 'aucune largeur maître figée à 1448 px ne subsiste');

check(app.includes('function assertDomContract()'), 'le renderer possède un contrat DOM explicite');
check(app.includes('view.hidden = !active'), 'le routeur UI pilote une seule collection de vues');
check(app.includes("button.setAttribute('aria-current', 'page')"), 'la vue active est annoncée dans la navigation');
check(app.includes("$('#backup-view-action').addEventListener('click', createLocalBackup)"), 'l’action Sauvegarde locale est reliée au service réel');
check(app.includes("const container = $('#privacy-events')"), 'la traçabilité confidentialité cible un conteneur existant');

check(!/document\./.test(preload), 'le preload ne modifie plus le DOM ni le rendu');
check(!/createElement|appendChild|insertAdjacent|innerHTML|outerHTML|insertCSS/.test(preload), 'le preload n’injecte aucune couche graphique');

check(detailJs.includes('data-detail-close'), 'la fiche possède des contrôles de fermeture explicites');
check(detailJs.includes('closeDetailDialog'), 'la fermeture de fiche passe par une fonction unique et testable');
check(detailJs.includes('event.target === dialog'), 'un clic sur l’arrière-plan peut fermer la fiche');
check(/\.detail-summary\{[^}]*min-height:/s.test(detailCss), 'le bandeau de fiche possède une hauteur minimale explicite');
check(detailCss.includes('scrollbar-gutter:stable'), 'le défilement de fiche réserve sa gouttière');
check(/@media\(max-width:900px\)[\s\S]*detail-columns\{grid-template-columns:1fr\}/.test(detailCss), 'la fiche passe en une colonne sur viewport étroit');

const packageFiles = pkg.build?.files || [];
check(packageFiles.includes('!design/**'), 'les maquettes de conception sont exclues de l’ASAR');
check(packageFiles.includes('!quality/**') && packageFiles.includes('!scripts/**'), 'les outils de qualification sont exclus de l’ASAR');

for (const message of passes) console.log(`PASS [ux-guardrail] ${message}`);
for (const message of failures) console.error(`FAIL [ux-guardrail] ${message}`);
if (failures.length) {
  console.error(`\nUX_GUARDRAIL_REJECTED: ${failures.length} contrôle(s) en échec.`);
  process.exit(1);
}
console.log(`\nUX_GUARDRAIL_PASS: ${passes.length} contrôle(s) validés.`);