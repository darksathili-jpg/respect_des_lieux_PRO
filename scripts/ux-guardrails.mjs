import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);

const detailJs = read('renderer/detail.js');
const detailCss = read('renderer/detail.css');
const preload = read('preload.cjs');
const pkg = JSON.parse(read('package.json'));
const entry = read('main-entry.cjs');
const extension = read('src/reparation-edit-extension.cjs');
const v51 = read('renderer/v51.css');

check(pkg.main === 'main-entry.cjs', 'le point d’entrée charge les extensions métier avant Electron');
check(entry.includes("reparation-edit-extension.cjs") && entry.includes("main-bootstrap.cjs"), 'l’extension réparation précède le bootstrap');
check(extension.includes('_repair_id') && extension.includes('UPDATE reparations'), 'l’édition d’une réparation est persistante en SQLite');
check(preload.includes('updateReparation:'), 'le renderer dispose d’une API explicite de modification des réparations');

check(detailJs.includes('data-detail-close'), 'la fiche possède des contrôles de fermeture explicites');
check(detailJs.includes('closeDetailDialog'), 'la fermeture de fiche passe par une fonction unique et testable');
check(detailJs.includes('event.target === dialog'), 'un clic sur l’arrière-plan peut fermer la fiche');
check(detailJs.includes('data-edit-repair'), 'les réparations exposent une action Modifier');
check(detailJs.includes('updateReparation'), 'le formulaire d’édition appelle une mise à jour persistante');

check(/\.detail-summary\{[^}]*min-height:/s.test(detailCss), 'le bandeau sombre possède une hauteur minimale explicite');
check(/\.detail-header\{[^}]*z-index:/s.test(detailCss), 'l’en-tête de fiche reste au-dessus du contenu scrollable');
check(/\.detail-header \.close\{[^}]*z-index:/s.test(detailCss), 'le bouton × est garanti cliquable au-dessus des décors');
check(detailCss.includes('scrollbar-gutter:stable'), 'le défilement réserve sa gouttière');
check(/@media\(max-width:900px\)[\s\S]*detail-columns\{grid-template-columns:1fr\}/.test(detailCss), 'la fiche passe en une colonne sur viewport étroit');

check(exists('renderer/assets/dashboard-hero-production.svg'), 'l’illustration de production de l’accueil existe');
check(exists('renderer/assets/sidebar-logo-production.svg'), 'l’identité graphique de production existe');
check(v51.includes('dashboard-hero-production.svg'), 'le hero de production utilise l’asset dédié, pas une capture de maquette');
check(v51.includes('sidebar-logo-production.svg'), 'la sidebar de production utilise l’asset dédié');

for (const message of passes) console.log(`PASS [ux-guardrail] ${message}`);
for (const message of failures) console.error(`FAIL [ux-guardrail] ${message}`);
if (failures.length) {
  console.error(`\nUX_GUARDRAIL_REJECTED: ${failures.length} contrôle(s) en échec.`);
  process.exit(1);
}
console.log(`\nUX_GUARDRAIL_PASS: ${passes.length} contrôle(s) validés.`);
