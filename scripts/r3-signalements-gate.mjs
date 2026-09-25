import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../src/database.cjs');

const read = (file) => fs.readFileSync(file, 'utf8');
const contract = JSON.parse(read('quality/r3-signalements-contract.json'));
const html = read('renderer/index.html');
const app = read('renderer/app.js');
const detail = read('renderer/detail.js');
const preload = read('preload.cjs');
const main = read('main.cjs');
const database = read('src/database.cjs');

const failures = [];
const passes = [];
const check = (condition, message, detailText = '') => {
  const target = condition ? passes : failures;
  target.push(detailText ? `${message} — ${detailText}` : message);
};

function changedFiles() {
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${contract.baseCommit}...HEAD`], { encoding: 'utf8' });
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    failures.push(`impossible de calculer le diff depuis ${contract.baseCommit}: ${error.message}`);
    return [];
  }
}

function signalDialogBlock() {
  const match = html.match(/<dialog id="signal-dialog"[\s\S]*?<\/dialog>/);
  return match?.[0] || '';
}

function methodSource(source, name, nextName) {
  const start = source.indexOf(`${name}(`);
  if (start < 0) return '';
  const end = nextName ? source.indexOf(`${nextName}(`, start + name.length + 1) : -1;
  return end > start ? source.slice(start, end) : source.slice(start, start + 8000);
}

const changed = changedFiles();
const cssChanged = changed.filter((file) => /^renderer\/.*\.css$/i.test(file));
check(contract.cssSpecificWorkAllowed || cssChanged.length === 0,
  'aucun CSS renderer n’est modifié avant le gate fonctionnel R3',
  cssChanged.length ? cssChanged.join(', ') : 'diff CSS vide');

const signalDialog = signalDialogBlock();
check(Boolean(signalDialog), 'le dialogue de création Signalements existe');
check(/<button(?=[^>]*class="close")(?=[^>]*type="button")[^>]*>/i.test(signalDialog),
  'le bouton × du formulaire Signalements est explicitement non-submit');
check(/<button(?=[^>]*class="btn secondary")(?=[^>]*type="button")[^>]*>\s*Annuler\s*<\/button>/i.test(signalDialog),
  'le bouton Annuler du formulaire Signalements est explicitement non-submit');

check(/getSignalementDetail\s*:/.test(preload), 'le preload expose getSignalementDetail');
check(/querySignalements\s*:/.test(preload), 'le preload expose querySignalements');
check(/setSignalementStatus\s*:/.test(preload), 'le preload expose setSignalementStatus');
check(/removePhoto\s*:/.test(preload), 'le preload expose removePhoto');
check(main.includes("rdl:signalements:get-detail"), 'le main process expose un IPC de lecture ciblée du dossier');
check(main.includes("rdl:signalements:query"), 'le main process expose un IPC de recherche/pagination');
check(main.includes("rdl:signalements:set-status"), 'le main process expose un IPC de transition de statut');
check(main.includes("rdl:photos:remove"), 'le main process expose un IPC de retrait de photo');

check(/data-edit-signalement|editSignalement|openSignalementEditor/.test(`${app}\n${detail}`),
  'le renderer possède un parcours explicite d’édition du signalement');
check(!detail.includes('decorateSignalRows'),
  'aucun contrôle métier Signalements n’est injecté après rendu par decorateSignalRows');
check(!/MutationObserver\([^)]*decorateSignalRows|new MutationObserver\(decorateSignalRows\)/.test(detail),
  'Signalements ne dépend pas d’un MutationObserver pour rendre ses contrôles fonctionnels');

const openDetailSource = methodSource(detail, 'async function openSignalementById', 'async function openSignalementByNum');
if (openDetailSource) {
  check(!openDetailSource.includes('listSignalements('),
    'l’ouverture d’une fiche ne recharge pas la liste des signalements');
  check(!openDetailSource.includes('listReparations('),
    'l’ouverture d’une fiche ne recharge pas toute la liste des réparations');
}

const updateSource = methodSource(database, 'updateSignalement', 'createReparation');
check(/identity_reduced_at/.test(updateSource),
  'updateSignalement protège explicitement les identifiants déjà réduits');
check(/SIGNALEMENT_STATUSES|ALLOWED_SIGNALEMENT_STATUSES/.test(database),
  'les statuts Signalements sont centralisés dans une whitelist domaine');
check(/SIGNALEMENT_GRAVITIES|SIGNALEMENT_GRAVITES|ALLOWED_SIGNALEMENT_GRAV/.test(database),
  'les gravités Signalements sont centralisées dans une whitelist domaine');
check(/querySignalements\s*\(/.test(database), 'la base possède querySignalements avec recherche/pagination');
check(/getSignalementDetail\s*\(/.test(database), 'la base possède getSignalementDetail ciblé');
check(/setSignalementStatus\s*\(/.test(database), 'la base possède setSignalementStatus dédié');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-r3-gate-'));
  const db = new LocalDatabase(path.join(root, 'data', 'r3.sqlite3'));
  db.init();
  return { root, db };
}

function cleanup(ctx) {
  try { ctx.db.close(); } catch {}
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

function expectThrow(fn, label, pattern = null) {
  try {
    fn();
    check(false, label, 'aucune erreur levée');
  } catch (error) {
    const message = String(error?.message || error);
    check(!pattern || pattern.test(message), label, message);
  }
}

const ctx = fixture();
try {
  expectThrow(() => ctx.db.createSignalement({ date: '2026-02-31', lieu: 'Hall' }),
    'une date calendrier invalide est refusée', /date|invalide/i);
  expectThrow(() => ctx.db.createSignalement({ date: '2026-09-25', heure: '29:99', lieu: 'Hall' }),
    'une heure invalide est refusée', /heure|invalide/i);
  expectThrow(() => ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Hall', gravite: 'Extrême' }),
    'une gravité hors contrat est refusée', /gravit/i);
  expectThrow(() => ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Hall', statut: 'Archivé' }),
    'un statut hors contrat est refusé', /statut/i);
  expectThrow(() => ctx.db.createSignalement({ date: '2026-09-25', lieu: 'X'.repeat(201) }),
    'un lieu trop long est refusé sans troncature silencieuse', /lieu|200|long/i);

  const s = ctx.db.createSignalement({
    date: '2026-09-25',
    heure: '10:30',
    lieu: 'Salle R3',
    gravite: 'Mineure',
    eleve: 'Élève Test',
    classe: 'T1'
  });

  check(typeof ctx.db.setSignalementStatus === 'function', 'setSignalementStatus existe au niveau domaine');
  if (typeof ctx.db.setSignalementStatus === 'function') {
    const closed = ctx.db.setSignalementStatus(s.id, 'Clos');
    check(closed?.statut === 'Clos' && Boolean(closed?.closed_at), 'la clôture renseigne closed_at');
    expectThrow(() => ctx.db.updateSignalement(s.id, { lieu: 'Modification interdite' }),
      'un dossier clos refuse les modifications métier', /clos|rouvr/i);
    ctx.db.reduceDirectIdentifiers(s.id);
    const reopened = ctx.db.setSignalementStatus(s.id, 'Ouvert');
    check(reopened?.statut === 'Ouvert', 'un dossier clos peut être rouvert explicitement');
    expectThrow(() => ctx.db.updateSignalement(s.id, { eleve: 'Réintroduit', classe: 'T2' }),
      'une identité réduite ne peut pas être réintroduite silencieusement', /identit|réduit|reintrodu/i);
  }

  check(typeof ctx.db.querySignalements === 'function', 'querySignalements existe au niveau domaine');
  if (typeof ctx.db.querySignalements === 'function') {
    ctx.db.transaction(() => {
      const insert = ctx.db.db.prepare('INSERT INTO signalements(num, date, lieu, statut) VALUES(?, ?, ?, ?)');
      for (let i = 1; i <= 5050; i += 1) {
        insert.run(`2099-${String(i).padStart(4, '0')}`, '2099-01-01', `R3-volume-${i}`, 'Ouvert');
      }
    });
    const result = ctx.db.querySignalements({ query: 'R3-volume-5050', limit: 50, offset: 0, includeIdentities: false });
    const rows = Array.isArray(result) ? result : result?.rows;
    check(Array.isArray(rows) && rows.some((row) => row.lieu === 'R3-volume-5050'),
      'la recherche SQLite trouve un dossier au-delà des 500 premiers');
  }

  check(typeof ctx.db.getSignalementDetail === 'function', 'getSignalementDetail existe au niveau domaine');
  if (typeof ctx.db.getSignalementDetail === 'function') {
    const detailResult = ctx.db.getSignalementDetail(s.id);
    check(Number(detailResult?.signalement?.id ?? detailResult?.id) === Number(s.id),
      'getSignalementDetail retourne le dossier ciblé');
  }
} finally {
  cleanup(ctx);
}

for (const message of passes) console.log(`PASS [R3-SIGNALEMENTS] ${message}`);
for (const message of failures) console.error(`FAIL [R3-SIGNALEMENTS] ${message}`);

if (failures.length) {
  console.error(`\nR3_SIGNALEMENTS_GATE_RED: ${failures.length} exigence(s) non satisfaite(s). Aucun CSS spécifique Signalements ne doit commencer.`);
  process.exit(1);
}

console.log(`\nR3_SIGNALEMENTS_GATE_GREEN: ${passes.length} exigence(s) satisfaites. Le socle fonctionnel peut passer à la qualification E2E avant UI spécifique.`);
