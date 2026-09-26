import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../src/database.cjs');
const { ReparationDomain } = require('../src/reparation-domain.cjs');

const read = (file) => fs.readFileSync(file, 'utf8');
const contract = JSON.parse(read('quality/r4-reparations-contract.json'));
const html = read('renderer/index.html');
const detail = read('renderer/detail.js');
const repairRenderer = read('renderer/reparations.js');
const preload = read('preload.cjs');
const main = read('main.cjs');
const mainEntry = read('main-entry.cjs');
const domainSource = read('src/reparation-domain.cjs');

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

function block(source, startText, endText) {
  const start = source.indexOf(startText);
  if (start < 0) return '';
  const end = endText ? source.indexOf(endText, start + startText.length) : -1;
  return end > start ? source.slice(start, end) : source.slice(start, start + 12000);
}

function repairDialogBlock() {
  return html.match(/<dialog id="repair-dialog"[\s\S]*?<\/dialog>/)?.[0] || '';
}

const changed = changedFiles();
const cssChanged = changed.filter((file) => /^renderer\/.*\.css$/i.test(file));
check(commitIsAncestor(contract.baseCommit), 'R4 reste descendant du merge qui fige R3', contract.baseCommit);
check(commitIsAncestor(contract.signalementsQualificationCommit), 'le commit qualifié Signalements reste un ancêtre du HEAD R4', contract.signalementsQualificationCommit);
check(contract.releaseFrozen === true, 'le gel de release reste actif pendant R4');
check(contract.stage === 'functional-audit', 'R4 reste en phase audit fonctionnel tant que P0 est rouge');
check(contract.cssSpecificWorkAllowed === false, 'le CSS spécifique Réparations reste interdit pendant P0');
check(cssChanged.length === 0, 'aucun CSS n’est modifié tant que le contrat Réparations est rouge', cssChanged.join(', ') || 'aucun CSS');

const repairDialog = repairDialogBlock();
check(Boolean(repairDialog), 'le dialogue Réparations existe');
check(/<button(?=[^>]*class="close")(?=[^>]*type="button")[^>]*>/i.test(repairDialog), 'le bouton × de Réparations est explicitement non-submit');
check(/<button(?=[^>]*class="btn secondary")(?=[^>]*type="button")[^>]*>\s*Annuler\s*<\/button>/i.test(repairDialog), 'le bouton Annuler de Réparations est explicitement non-submit');
check(html.includes('id="repair-search"') && html.includes('id="repair-prev"') && html.includes('id="repair-next"'), 'la vue Réparations possède recherche et pagination explicites');
check(html.includes('src="./reparations.js"'), 'le renderer Réparations dédié est chargé explicitement');

for (const api of ['queryReparations', 'getReparation', 'createReparation', 'updateReparation', 'setReparationStatus']) {
  check(new RegExp(`${api}\\s*:`).test(preload), `le preload expose ${api}`);
}
for (const channel of ['query', 'get', 'create', 'update', 'set-status']) {
  check(main.includes(`rdl:reparations:${channel}`), `le main process expose l’IPC Réparations ${channel}`);
}
check(!preload.includes('_repair_id'), 'le preload ne multiplexe plus une édition via le champ privé _repair_id');
check(!mainEntry.includes('reparation-edit-extension.cjs'), 'le bootstrap ne dépend plus de reparation-edit-extension.cjs');
check(main.includes('ReparationDomain'), 'le main process instancie explicitement ReparationDomain');

for (const method of ['queryReparations', 'getReparation', 'createReparation', 'updateReparation', 'setReparationStatus']) {
  check(new RegExp(`\\b${method}\\s*\\(`).test(domainSource), `la couche domaine possède ${method}`);
}
check(/REPARATION_STATUSES/.test(domainSource), 'les statuts Réparations sont centralisés dans une whitelist domaine');
check(/REPARATION_FIELD_LIMITS/.test(domainSource), 'les limites de champs Réparations sont centralisées dans le domaine');

check(!/observeRepairRenders|decorateRepairRows/.test(detail), 'les contrôles métier Réparations ne sont pas injectés après rendu par décoration');
check(!/MutationObserver[\s\S]{0,400}(?:repair|reparation)/i.test(detail), 'Réparations ne dépend pas d’un MutationObserver pour rendre ses contrôles fonctionnels');
const openRepairSource = block(repairRenderer, 'async function openEditor', 'function openCreate');
check(Boolean(openRepairSource), 'le renderer dédié possède un éditeur ciblé Réparations');
check(!openRepairSource.includes('listReparations('), 'ouvrir une réparation ne recharge pas toute la liste');
check(openRepairSource.includes('getReparation('), 'ouvrir une réparation utilise une lecture ciblée getReparation');
const repairSubmitBlock = block(repairRenderer, "form.addEventListener('submit'", 'function bindActions');
check(/withBusy/.test(repairSubmitBlock), 'la soumission Réparations possède un état busy contre les doubles écritures');
check(/queryReparations/.test(repairRenderer) && /repair-prev/.test(repairRenderer) && /repair-next/.test(repairRenderer), 'recherche et pagination Réparations utilisent queryReparations');
check(/data-repair-status/.test(repairRenderer) && /setReparationStatus/.test(repairRenderer), 'les transitions de statut sont rendues directement et utilisent l’IPC dédié');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-r4-gate-'));
  const db = new LocalDatabase(path.join(root, 'data', 'r4.sqlite3')).init();
  return { root, db, repairs: new ReparationDomain(db) };
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
  const create = (payload) => ctx.repairs.createReparation({ signalement_id: signalement.id, ...payload });

  expectThrow(() => create({ mesure: '' }), 'une mesure vide est refusée', /mesure|action|obligatoire/i);
  expectThrow(() => create({ mesure: 'X'.repeat(2001) }), 'une mesure trop longue est refusée sans troncature silencieuse', /mesure|2000|long/i);
  expectThrow(() => create({ mesure: 'Réparer', referent: 'R'.repeat(201) }), 'un référent trop long est refusé sans troncature silencieuse', /référent|referent|200|long/i);
  expectThrow(() => create({ mesure: 'Réparer', duree: 'D'.repeat(101) }), 'une durée trop longue est refusée sans troncature silencieuse', /durée|duree|100|long/i);
  expectThrow(() => create({ mesure: 'Réparer', notes: 'N'.repeat(5001) }), 'des notes trop longues sont refusées sans troncature silencieuse', /notes|5000|long/i);
  expectThrow(() => create({ mesure: 'Réparer', debut: '2026-02-31' }), 'une date de début calendrier invalide est refusée', /date|début|debut|invalide/i);
  expectThrow(() => create({ mesure: 'Réparer', cloture: '2026-02-31' }), 'une date de clôture calendrier invalide est refusée', /date|clôture|cloture|invalide/i);
  expectThrow(() => create({ mesure: 'Réparer', statut: 'Archivée' }), 'un statut Réparations hors contrat est refusé', /statut|invalide/i);

  const repair = create({
    mesure: 'Remplacer la poignée', referent: 'Agent R4', debut: '2026-09-26', duree: '2 heures', notes: 'Pièce commandée', statut: 'En cours'
  });
  check(Number(repair?.signalement_id) === Number(signalement.id), 'une réparation valide est liée au bon signalement');
  check(ctx.db.listSignalementEvents(signalement.id, 50).some((event) => event.event_type === 'repair_created'), 'la création d’une réparation est historisée dans le dossier');

  const targeted = ctx.repairs.getReparation(repair.id);
  check(Number(targeted?.id) === Number(repair.id), 'getReparation retourne uniquement la réparation ciblée');

  const updated = ctx.repairs.updateReparation(repair.id, { mesure: 'Remplacer la poignée et contrôler la serrure' });
  check(updated?.id === repair.id && /serrure/.test(updated?.mesure || ''), 'updateReparation modifie sans créer de doublon');
  expectThrow(() => ctx.repairs.updateReparation(repair.id, { signalement_id: signalement.id + 1 }), 'le rattachement signalement_id d’une réparation est immuable', /signalement|champ|autorisé|immuable/i);
  expectThrow(() => ctx.repairs.updateReparation(repair.id, { statut: 'Terminée' }), 'le statut se modifie par une transition dédiée, pas dans updateReparation', /statut|sépar|dédi/i);
  check(ctx.db.listSignalementEvents(signalement.id, 50).some((event) => event.event_type === 'repair_updated'), 'la modification d’une réparation est historisée');

  const done = ctx.repairs.setReparationStatus(repair.id, 'Terminée');
  check(done?.statut === 'Terminée' && /^\d{4}-\d{2}-\d{2}$/.test(done?.cloture || ''), 'passer une réparation à Terminée renseigne une date de clôture');
  const reopened = ctx.repairs.setReparationStatus(repair.id, 'En cours');
  check(reopened?.statut === 'En cours' && !reopened?.cloture, 'repasser une réparation En cours efface sa date de clôture');
  const canceled = ctx.repairs.setReparationStatus(repair.id, 'Annulée');
  check(canceled?.statut === 'Annulée' && /^\d{4}-\d{2}-\d{2}$/.test(canceled?.cloture || ''), 'Annulée est un état terminal daté');
  check(ctx.db.listSignalementEvents(signalement.id, 50).some((event) => event.event_type === 'repair_status_changed'), 'les transitions de statut Réparations sont historisées');

  const closedParent = ctx.db.createSignalement({ date: '2026-09-26', lieu: 'Parent clos' });
  const child = ctx.repairs.createReparation({ signalement_id: closedParent.id, mesure: 'Avant clôture' });
  ctx.db.setSignalementStatus(closedParent.id, 'Clos');
  expectThrow(() => ctx.repairs.createReparation({ signalement_id: closedParent.id, mesure: 'Interdit' }), 'un dossier Signalements clos refuse toute nouvelle réparation', /clos|rouvr/i);
  expectThrow(() => ctx.repairs.updateReparation(child.id, { mesure: 'Interdit après clôture' }), 'un dossier Signalements clos refuse la modification de ses réparations', /clos|rouvr/i);
  expectThrow(() => ctx.repairs.setReparationStatus(child.id, 'Terminée'), 'un dossier Signalements clos refuse la transition de statut de ses réparations', /clos|rouvr/i);

  const volumeParent = ctx.db.createSignalement({ date: '2026-09-26', lieu: 'Volume R4' });
  ctx.db.transaction(() => {
    const insert = ctx.db.db.prepare(`INSERT INTO reparations(signalement_id, mesure, referent, debut, duree, notes, cloture, statut) VALUES(?, ?, ?, '2026-09-26', '', '', '', 'En cours')`);
    for (let i = 1; i <= 1505; i += 1) insert.run(volumeParent.id, `R4-volume-${i}`, i === 1505 ? 'R4-secret-ref' : '');
  });
  const deep = ctx.repairs.queryReparations({ query: 'R4-volume-1505', limit: 50, offset: 0, includeIdentities: false });
  check(Array.isArray(deep?.rows) && deep.rows.some((row) => row.mesure === 'R4-volume-1505'), 'la recherche SQLite trouve une réparation au-delà des 1000 premières');
  check(Number.isInteger(deep?.total) && deep.limit === 50 && deep.offset === 0, 'queryReparations retourne total, limit et offset');
  const hiddenIdentity = ctx.repairs.queryReparations({ query: 'R4-secret-ref', limit: 50, offset: 0, includeIdentities: false });
  check(Number(hiddenIdentity?.total || 0) === 0, 'la recherche par référent est désactivée tant que les identités ne sont pas explicitement demandées');
  const visibleIdentity = ctx.repairs.queryReparations({ query: 'R4-secret-ref', limit: 50, offset: 0, includeIdentities: true });
  check(Number(visibleIdentity?.total || 0) === 1 && visibleIdentity.rows?.[0]?.referent === 'R4-secret-ref', 'la recherche par référent fonctionne uniquement avec includeIdentities=true');
  const maskedPage = ctx.repairs.queryReparations({ query: 'R4-volume-1505', limit: 50, offset: 0, includeIdentities: false });
  check(maskedPage.rows?.every((row) => !row.referent), 'les valeurs référent sont masquées quand includeIdentities=false');
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
