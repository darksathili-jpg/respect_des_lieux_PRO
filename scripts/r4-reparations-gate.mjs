import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../src/database.cjs');

const read = (file) => fs.readFileSync(file, 'utf8');
const contract = JSON.parse(read('quality/r4-reparations-contract.json'));
const html = read('renderer/index.html');
const app = read('renderer/app.js');
const detail = read('renderer/detail.js');
const preload = read('preload.cjs');
const main = read('main.cjs');
const mainEntry = read('main-entry.cjs');
const database = read('src/database.cjs');

const failures = [];
const passes = [];
const check = (condition, message, detailText = '') => {
  (condition ? passes : failures).push(detailText ? `${message} — ${detailText}` : message);
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

function commitIsAncestor(commit) {
  if (!commit) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function methodSource(source, name, nextName = null) {
  const start = source.indexOf(`${name}(`);
  if (start < 0) return '';
  const end = nextName ? source.indexOf(`${nextName}(`, start + name.length + 1) : -1;
  return end > start ? source.slice(start, end) : source.slice(start, start + 10000);
}

function repairDialogBlock() {
  const match = html.match(/<dialog id="repair-dialog"[\s\S]*?<\/dialog>/);
  return match?.[0] || '';
}

const changed = changedFiles();
const cssChanged = changed.filter((file) => /^renderer\/.*\.css$/i.test(file));
const basePresent = commitIsAncestor(contract.baseCommit);
const signalementsBaselinePresent = commitIsAncestor(contract.signalementsQualificationCommit);

check(basePresent, 'R4 reste descendant du merge qui fige R3', contract.baseCommit);
check(signalementsBaselinePresent, 'le commit qualifié Signalements reste un ancêtre du HEAD R4', contract.signalementsQualificationCommit);
check(contract.releaseFrozen === true, 'le gel de release reste actif pendant R4');
check(contract.stage === 'functional-audit', 'R4 reste en phase audit fonctionnel tant que P0 est rouge');
check(contract.cssSpecificWorkAllowed === false, 'le CSS spécifique Réparations reste interdit pendant P0');
check(cssChanged.length === 0, 'aucun CSS n’est modifié tant que le contrat Réparations est rouge', cssChanged.join(', ') || 'aucun CSS');

const repairDialog = repairDialogBlock();
check(Boolean(repairDialog), 'le dialogue Réparations existe');
check(/<button(?=[^>]*class="close")(?=[^>]*type="button")[^>]*>/i.test(repairDialog),
  'le bouton × de Réparations est explicitement non-submit');
check(/<button(?=[^>]*class="btn secondary")(?=[^>]*type="button")[^>]*>\s*Annuler\s*<\/button>/i.test(repairDialog),
  'le bouton Annuler de Réparations est explicitement non-submit');

for (const api of ['queryReparations', 'getReparation', 'createReparation', 'updateReparation', 'setReparationStatus']) {
  check(new RegExp(`${api}\\s*:`).test(preload), `le preload expose ${api}`);
}
check(main.includes("rdl:reparations:query"), 'le main process expose un IPC de recherche/pagination Réparations');
check(main.includes("rdl:reparations:get"), 'le main process expose un IPC de lecture ciblée Réparations');
check(main.includes("rdl:reparations:create"), 'le main process expose un IPC de création Réparations');
check(main.includes("rdl:reparations:update"), 'le main process expose un IPC dédié de modification Réparations');
check(main.includes("rdl:reparations:set-status"), 'le main process expose un IPC dédié de transition de statut Réparations');
check(!preload.includes('_repair_id'), 'le preload ne multiplexe plus une édition via le champ privé _repair_id');
check(!mainEntry.includes('reparation-edit-extension.cjs'), 'le bootstrap ne dépend plus de reparation-edit-extension.cjs');

for (const method of ['queryReparations', 'getReparation', 'createReparation', 'updateReparation', 'setReparationStatus']) {
  check(new RegExp(`\\b${method}\\s*\\(`).test(database), `la couche domaine possède ${method}`);
}
check(/REPARATION_STATUSES|ALLOWED_REPARATION_STATUSES/.test(database), 'les statuts Réparations sont centralisés dans une whitelist domaine');
check(/REPARATION_FIELD_LIMITS|REPAIR_FIELD_LIMITS/.test(database), 'les limites de champs Réparations sont centralisées dans le domaine');

check(!/observeRepairRenders|decorateRepairRows/.test(detail),
  'les contrôles métier Réparations ne sont pas injectés après rendu par décoration');
check(!/MutationObserver[\s\S]{0,300}(?:repair|reparation)/i.test(detail),
  'Réparations ne dépend pas d’un MutationObserver pour rendre ses contrôles fonctionnels');
const openRepairSource = methodSource(detail, 'async function openRepairEditor', 'function bindRepairEditing');
if (openRepairSource) {
  check(!openRepairSource.includes('listReparations('), 'ouvrir une réparation ne recharge pas toute la liste');
  check(openRepairSource.includes('getReparation('), 'ouvrir une réparation utilise une lecture ciblée getReparation');
}
const repairSubmitBlock = methodSource(app, "$('#repair-form').addEventListener", "$('#signalements-body').addEventListener");
check(/withBusy/.test(repairSubmitBlock), 'la soumission Réparations possède un état busy contre les doubles écritures');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-r4-gate-'));
  const db = new LocalDatabase(path.join(root, 'data', 'r4.sqlite3'));
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
  const signalement = ctx.db.createSignalement({ date: '2026-09-26', lieu: 'Salle R4', type: 'Dégradation' });

  expectThrow(() => ctx.db.createReparation({ signalement_id: signalement.id, mesure: '' }),
    'une mesure vide est refusée', /mesure|action|obligatoire/i);
  expectThrow(() => ctx.db.createReparation({ signalement_id: signalement.id, mesure: 'X'.repeat(2001) }),
    'une mesure trop longue est refusée sans troncature silencieuse', /mesure|2000|long/i);
  expectThrow(() => ctx.db.createReparation({ signalement_id: signalement.id, mesure: 'Réparer', referent: 'R'.repeat(201) }),
    'un référent trop long est refusé sans troncature silencieuse', /référent|referent|200|long/i);
  expectThrow(() => ctx.db.createReparation({ signalement_id: signalement.id, mesure: 'Réparer', duree: 'D'.repeat(101) }),
    'une durée trop longue est refusée sans troncature silencieuse', /durée|duree|100|long/i);
  expectThrow(() => ctx.db.createReparation({ signalement_id: signalement.id, mesure: 'Réparer', notes: 'N'.repeat(5001) }),
    'des notes trop longues sont refusées sans troncature silencieuse', /notes|5000|long/i);
  expectThrow(() => ctx.db.createReparation({ signalement_id: signalement.id, mesure: 'Réparer', debut: '2026-02-31' }),
    'une date de début calendrier invalide est refusée', /date|début|debut|invalide/i);
  expectThrow(() => ctx.db.createReparation({ signalement_id: signalement.id, mesure: 'Réparer', cloture: '2026-02-31' }),
    'une date de clôture calendrier invalide est refusée', /date|clôture|cloture|invalide/i);
  expectThrow(() => ctx.db.createReparation({ signalement_id: signalement.id, mesure: 'Réparer', statut: 'Archivée' }),
    'un statut Réparations hors contrat est refusé', /statut|invalide/i);

  const repair = ctx.db.createReparation({
    signalement_id: signalement.id,
    mesure: 'Remplacer la poignée',
    referent: 'Agent R4',
    debut: '2026-09-26',
    duree: '2 heures',
    notes: 'Pièce commandée',
    statut: 'En cours'
  });
  check(Number(repair?.signalement_id) === Number(signalement.id), 'une réparation valide est liée au bon signalement');

  const createdEvents = ctx.db.listSignalementEvents(signalement.id, 50);
  check(createdEvents.some((event) => event.event_type === 'repair_created'),
    'la création d’une réparation est historisée dans le dossier');

  check(typeof ctx.db.getReparation === 'function', 'getReparation existe au niveau domaine');
  if (typeof ctx.db.getReparation === 'function') {
    const targeted = ctx.db.getReparation(repair.id);
    check(Number(targeted?.id) === Number(repair.id), 'getReparation retourne uniquement la réparation ciblée');
  }

  check(typeof ctx.db.updateReparation === 'function', 'updateReparation existe au niveau domaine');
  if (typeof ctx.db.updateReparation === 'function') {
    const updated = ctx.db.updateReparation(repair.id, { mesure: 'Remplacer la poignée et contrôler la serrure' });
    check(updated?.id === repair.id && /serrure/.test(updated?.mesure || ''), 'updateReparation modifie sans créer de doublon');
    expectThrow(() => ctx.db.updateReparation(repair.id, { signalement_id: signalement.id + 1 }),
      'le rattachement signalement_id d’une réparation est immuable', /signalement|champ|autorisé|immuable/i);
    expectThrow(() => ctx.db.updateReparation(repair.id, { statut: 'Terminée' }),
      'le statut se modifie par une transition dédiée, pas dans updateReparation', /statut|sépar|dédi/i);
    const updateEvents = ctx.db.listSignalementEvents(signalement.id, 50);
    check(updateEvents.some((event) => event.event_type === 'repair_updated'),
      'la modification d’une réparation est historisée');
  }

  check(typeof ctx.db.setReparationStatus === 'function', 'setReparationStatus existe au niveau domaine');
  if (typeof ctx.db.setReparationStatus === 'function') {
    const done = ctx.db.setReparationStatus(repair.id, 'Terminée');
    check(done?.statut === 'Terminée' && /^\d{4}-\d{2}-\d{2}$/.test(done?.cloture || ''),
      'passer une réparation à Terminée renseigne une date de clôture');
    const reopened = ctx.db.setReparationStatus(repair.id, 'En cours');
    check(reopened?.statut === 'En cours' && !reopened?.cloture,
      'repasser une réparation En cours efface sa date de clôture');
    const canceled = ctx.db.setReparationStatus(repair.id, 'Annulée');
    check(canceled?.statut === 'Annulée' && /^\d{4}-\d{2}-\d{2}$/.test(canceled?.cloture || ''),
      'Annulée est un état terminal daté');
    const statusEvents = ctx.db.listSignalementEvents(signalement.id, 50);
    check(statusEvents.some((event) => event.event_type === 'repair_status_changed'),
      'les transitions de statut Réparations sont historisées');
  }

  const closedParent = ctx.db.createSignalement({ date: '2026-09-26', lieu: 'Parent clos' });
  const child = ctx.db.createReparation({ signalement_id: closedParent.id, mesure: 'Avant clôture' });
  ctx.db.setSignalementStatus(closedParent.id, 'Clos');
  expectThrow(() => ctx.db.createReparation({ signalement_id: closedParent.id, mesure: 'Interdit' }),
    'un dossier Signalements clos refuse toute nouvelle réparation', /clos|rouvr/i);
  if (typeof ctx.db.updateReparation === 'function') {
    expectThrow(() => ctx.db.updateReparation(child.id, { mesure: 'Interdit après clôture' }),
      'un dossier Signalements clos refuse la modification de ses réparations', /clos|rouvr/i);
  }
  if (typeof ctx.db.setReparationStatus === 'function') {
    expectThrow(() => ctx.db.setReparationStatus(child.id, 'Terminée'),
      'un dossier Signalements clos refuse la transition de statut de ses réparations', /clos|rouvr/i);
  }

  check(typeof ctx.db.queryReparations === 'function', 'queryReparations existe au niveau domaine');
  if (typeof ctx.db.queryReparations === 'function') {
    const volumeParent = ctx.db.createSignalement({ date: '2026-09-26', lieu: 'Volume R4' });
    ctx.db.transaction(() => {
      const insert = ctx.db.db.prepare(`
        INSERT INTO reparations(signalement_id, mesure, referent, debut, duree, notes, cloture, statut)
        VALUES(?, ?, ?, '2026-09-26', '', '', '', 'En cours')
      `);
      for (let i = 1; i <= 1505; i += 1) {
        insert.run(volumeParent.id, `R4-volume-${i}`, i === 1505 ? 'R4-secret-ref' : '');
      }
    });
    const deep = ctx.db.queryReparations({ query: 'R4-volume-1505', limit: 50, offset: 0, includeIdentities: false });
    check(Array.isArray(deep?.rows) && deep.rows.some((row) => row.mesure === 'R4-volume-1505'),
      'la recherche SQLite trouve une réparation au-delà des 1000 premières');
    check(Number.isInteger(deep?.total) && deep.limit === 50 && deep.offset === 0,
      'queryReparations retourne total, limit et offset');

    const hiddenIdentity = ctx.db.queryReparations({ query: 'R4-secret-ref', limit: 50, offset: 0, includeIdentities: false });
    check(Number(hiddenIdentity?.total || 0) === 0,
      'la recherche par référent est désactivée tant que les identités ne sont pas explicitement demandées');
    const visibleIdentity = ctx.db.queryReparations({ query: 'R4-secret-ref', limit: 50, offset: 0, includeIdentities: true });
    check(Number(visibleIdentity?.total || 0) === 1 && visibleIdentity.rows?.[0]?.referent === 'R4-secret-ref',
      'la recherche par référent fonctionne uniquement avec includeIdentities=true');
    const maskedPage = ctx.db.queryReparations({ query: 'R4-volume-1505', limit: 50, offset: 0, includeIdentities: false });
    check(maskedPage.rows?.every((row) => !row.referent), 'les valeurs référent sont masquées quand includeIdentities=false');
  }
} finally {
  cleanup(ctx);
}

for (const message of passes) console.log(`PASS [R4-REPARATIONS] ${message}`);
for (const message of failures) console.error(`FAIL [R4-REPARATIONS] ${message}`);

if (failures.length) {
  console.error(`\nR4_REPARATIONS_GATE_RED: ${failures.length} exigence(s) non satisfaite(s). Aucun travail CSS Réparations n’est autorisé tant que R4-P0 n’est pas vert.`);
  process.exit(1);
}

console.log(`\nR4_REPARATIONS_GATE_GREEN: ${passes.length} exigence(s) satisfaites. Le socle fonctionnel Réparations peut passer à la qualification du vrai EXE.`);
