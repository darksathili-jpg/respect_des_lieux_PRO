const fs = require('node:fs');
const path = require('node:path');
const { LocalDatabase } = require('../src/database.cjs');

const localAppData = process.argv[2];
const evidenceDir = process.argv[3] || path.join(process.cwd(), 'artifacts', 'r3-e2e');
if (!localAppData) throw new Error('LOCALAPPDATA temporaire requis.');

const appRoot = path.join(path.resolve(localAppData), 'Respect des Lieux PRO');
const databasePath = path.join(appRoot, 'data', 'respect-des-lieux.sqlite3');
const fixturePhoto = path.join(path.resolve(localAppData), 'r3-e2e-photo.jpg');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });
fs.rmSync(databasePath, { force: true });
fs.rmSync(`${databasePath}-wal`, { force: true });
fs.rmSync(`${databasePath}-shm`, { force: true });

const db = new LocalDatabase(databasePath);
db.init();
try {
  db.transaction(() => {
    const insert = db.db.prepare(`
      INSERT INTO signalements(num, date, heure, lieu, type, gravite, statut)
      VALUES(?, '2025-09-25', '08:00', ?, 'Fixture R3', 'Mineure', 'Ouvert')
    `);
    for (let i = 1; i <= 650; i += 1) {
      const lieu = i === 1 ? 'E2E-DEEP-BEYOND-500' : `E2E-SEED-${String(i).padStart(4, '0')}`;
      insert.run(`2025-${String(i).padStart(4, '0')}`, lieu);
    }
  });
  if (!db.integrityCheck().ok) throw new Error('Fixture SQLite invalide.');
} finally {
  db.close();
}

// JPEG minimal accepté par le coffre local : SOI + SOS + payload + EOI.
fs.writeFileSync(fixturePhoto, Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x31, 0x22, 0x33, 0xff, 0xd9]));

const fixture = {
  format: 1,
  localAppData: path.resolve(localAppData),
  appRoot,
  databasePath,
  fixturePhoto,
  seededSignalements: 650,
  deepSearchTerm: 'E2E-DEEP-BEYOND-500',
  createLieu: 'E2E-CREATED-R3',
  editedLieu: 'E2E-EDITED-R3'
};
fs.writeFileSync(path.join(evidenceDir, 'fixture.json'), JSON.stringify(fixture, null, 2), 'utf8');
console.log(`R3_E2E_FIXTURE ${JSON.stringify(fixture)}`);
