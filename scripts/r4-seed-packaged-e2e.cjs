const fs = require('node:fs');
const path = require('node:path');
const { LocalDatabase } = require('../src/database.cjs');
const { ReparationDomain } = require('../src/reparation-domain.cjs');

const localAppData = process.argv[2];
const evidenceDir = process.argv[3] || path.join(process.cwd(), 'artifacts', 'r4-e2e');
if (!localAppData) throw new Error('LOCALAPPDATA temporaire requis.');

const appRoot = path.join(path.resolve(localAppData), 'Respect des Lieux PRO');
const databasePath = path.join(appRoot, 'data', 'respect-des-lieux.sqlite3');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });
fs.rmSync(databasePath, { force: true });
fs.rmSync(`${databasePath}-wal`, { force: true });
fs.rmSync(`${databasePath}-shm`, { force: true });

const db = new LocalDatabase(databasePath).init();
const repairs = new ReparationDomain(db);
let openSignalement;
let closedSignalement;
let closedRepair;
let closableSignalement;
let closableRepair;
try {
  openSignalement = db.createSignalement({
    date: '2026-09-26',
    heure: '09:00',
    lieu: 'R4-E2E-OPEN-SIGNAL',
    type: 'Fixture R4',
    gravite: 'Mineure'
  });

  // Fixture legacy : elle simule une base créée avant R4-P2, où un parent pouvait
  // être clos alors qu'une réparation restait En cours. Le produit doit proposer
  // une récupération explicite sans casser ces données existantes.
  closedSignalement = db.createSignalement({
    date: '2026-09-26',
    heure: '09:05',
    lieu: 'R4-E2E-CLOSED-SIGNAL',
    type: 'Fixture legacy R4',
    gravite: 'Mineure'
  });
  closedRepair = repairs.createReparation({
    signalement_id: closedSignalement.id,
    mesure: 'R4-CLOSED-PARENT-REPAIR',
    debut: '2026-09-26',
    statut: 'En cours'
  });
  db.db.prepare(`
    UPDATE signalements
    SET statut = 'Clos', closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(closedSignalement.id);

  // Fixture R4-P2 : le parcours E2E doit refuser la clôture tant que cette
  // réparation est active, puis l'autoriser après passage en état terminal.
  closableSignalement = db.createSignalement({
    date: '2026-09-26',
    heure: '09:10',
    lieu: 'R4-E2E-CLOSURE-GUARD',
    type: 'Fixture cycle R4-P2',
    gravite: 'Mineure'
  });
  closableRepair = repairs.createReparation({
    signalement_id: closableSignalement.id,
    mesure: 'R4-CLOSURE-GUARD-REPAIR',
    debut: '2026-09-26',
    statut: 'En cours'
  });

  db.transaction(() => {
    const insert = db.db.prepare(`
      INSERT INTO reparations(signalement_id, mesure, referent, debut, duree, notes, cloture, statut)
      VALUES(?, ?, ?, '2026-09-26', '30 min', '', '', 'En cours')
    `);
    for (let i = 1; i <= 1205; i += 1) {
      const mesure = i === 1 ? 'R4-DEEP-BEYOND-1000' : `R4-SEED-REPAIR-${String(i).padStart(4, '0')}`;
      const referent = i === 2 ? 'R4-SECRET-REFERENT' : '';
      insert.run(openSignalement.id, mesure, referent);
    }
  });

  if (!db.integrityCheck().ok) throw new Error('Fixture SQLite R4 invalide.');
} finally {
  db.close();
}

const fixture = {
  format: 2,
  localAppData: path.resolve(localAppData),
  appRoot,
  databasePath,
  seededRepairs: 1207,
  openSignalementId: openSignalement.id,
  openSignalementNum: openSignalement.num,
  openSignalementLieu: openSignalement.lieu,
  closedSignalementId: closedSignalement.id,
  closedSignalementNum: closedSignalement.num,
  closedRepairId: closedRepair.id,
  closedRepairMeasure: 'R4-CLOSED-PARENT-REPAIR',
  closableSignalementId: closableSignalement.id,
  closableSignalementNum: closableSignalement.num,
  closableRepairId: closableRepair.id,
  closableRepairMeasure: 'R4-CLOSURE-GUARD-REPAIR',
  deepSearchTerm: 'R4-DEEP-BEYOND-1000',
  secretReferent: 'R4-SECRET-REFERENT',
  createMeasure: 'R4-CREATED-BY-PACKAGED-EXE',
  editedMeasure: 'R4-EDITED-BY-PACKAGED-EXE'
};
fs.writeFileSync(path.join(evidenceDir, 'fixture.json'), JSON.stringify(fixture, null, 2), 'utf8');
console.log(`R4_E2E_FIXTURE ${JSON.stringify(fixture)}`);
