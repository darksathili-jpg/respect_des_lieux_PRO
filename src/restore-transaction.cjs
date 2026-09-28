const fs = require('node:fs');
const path = require('node:path');

const TRANSACTION_DIR = '.restore-transaction';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJsonAtomic(filePath, value) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

function transactionPaths(rootDir) {
  const transactionDir = path.join(rootDir, TRANSACTION_DIR);
  return {
    transactionDir,
    journal: path.join(transactionDir, 'journal.json'),
    incomingDatabase: path.join(transactionDir, 'incoming.sqlite3'),
    incomingPhotos: path.join(transactionDir, 'incoming-photos'),
    previousDatabase: path.join(transactionDir, 'previous.sqlite3'),
    previousWal: path.join(transactionDir, 'previous.sqlite3-wal'),
    previousShm: path.join(transactionDir, 'previous.sqlite3-shm'),
    previousPhotos: path.join(transactionDir, 'previous-photos')
  };
}

function readJournal(journalPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    if (!parsed || parsed.format !== 1 || typeof parsed.phase !== 'string') {
      throw new Error('format invalide');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Journal de restauration illisible : ${error.message}`);
  }
}

function restoreFile({ active, previous, existedBefore }) {
  if (existedBefore) {
    if (fs.existsSync(previous)) {
      fs.rmSync(active, { force: true });
      fs.renameSync(previous, active);
    }
  } else {
    fs.rmSync(active, { force: true });
  }
}

function restoreDirectory({ active, previous, existedBefore }) {
  if (existedBefore) {
    if (fs.existsSync(previous)) {
      fs.rmSync(active, { recursive: true, force: true });
      fs.renameSync(previous, active);
    }
  } else {
    fs.rmSync(active, { recursive: true, force: true });
  }
}

function recoverInterruptedRestore({ rootDir, databasePath, photosPath }) {
  const tx = transactionPaths(rootDir);
  if (!fs.existsSync(tx.transactionDir)) return { recovered: false, action: 'none' };

  if (!fs.existsSync(tx.journal)) {
    fs.rmSync(tx.transactionDir, { recursive: true, force: true });
    return { recovered: true, action: 'discarded-unprepared' };
  }

  const journal = readJournal(tx.journal);
  if (journal.phase === 'committed') {
    fs.rmSync(tx.transactionDir, { recursive: true, force: true });
    return { recovered: true, action: 'kept-committed' };
  }

  restoreFile({ active: databasePath, previous: tx.previousDatabase, existedBefore: journal.hadDatabase });
  restoreFile({ active: `${databasePath}-wal`, previous: tx.previousWal, existedBefore: journal.hadWal });
  restoreFile({ active: `${databasePath}-shm`, previous: tx.previousShm, existedBefore: journal.hadShm });
  restoreDirectory({ active: photosPath, previous: tx.previousPhotos, existedBefore: journal.hadPhotos });
  fs.rmSync(tx.transactionDir, { recursive: true, force: true });
  return { recovered: true, action: 'rolled-back', phase: journal.phase };
}

function moveIfExists(source, destination) {
  if (fs.existsSync(source)) fs.renameSync(source, destination);
}

function applySnapshotTransaction({
  rootDir,
  databasePath,
  photosPath,
  snapshotDatabasePath,
  snapshotPhotosPath,
  validateActive = null,
  onStep = null,
  leaveTransactionOnError = false
}) {
  recoverInterruptedRestore({ rootDir, databasePath, photosPath });

  const tx = transactionPaths(rootDir);
  ensureDir(tx.transactionDir);
  fs.copyFileSync(snapshotDatabasePath, tx.incomingDatabase);
  if (fs.existsSync(snapshotPhotosPath)) {
    fs.cpSync(snapshotPhotosPath, tx.incomingPhotos, { recursive: true, force: true });
  } else {
    ensureDir(tx.incomingPhotos);
  }

  const journal = {
    format: 1,
    phase: 'prepared',
    startedAt: new Date().toISOString(),
    hadDatabase: fs.existsSync(databasePath),
    hadWal: fs.existsSync(`${databasePath}-wal`),
    hadShm: fs.existsSync(`${databasePath}-shm`),
    hadPhotos: fs.existsSync(photosPath)
  };
  writeJsonAtomic(tx.journal, journal);

  const step = (name) => {
    if (typeof onStep === 'function') onStep(name);
  };

  try {
    step('prepared');

    moveIfExists(databasePath, tx.previousDatabase);
    moveIfExists(`${databasePath}-wal`, tx.previousWal);
    moveIfExists(`${databasePath}-shm`, tx.previousShm);
    moveIfExists(photosPath, tx.previousPhotos);
    journal.phase = 'previous-staged';
    writeJsonAtomic(tx.journal, journal);
    step('previous-staged');

    ensureDir(path.dirname(databasePath));
    fs.renameSync(tx.incomingDatabase, databasePath);
    journal.phase = 'database-installed';
    writeJsonAtomic(tx.journal, journal);
    step('database-installed');

    fs.renameSync(tx.incomingPhotos, photosPath);
    journal.phase = 'photos-installed';
    writeJsonAtomic(tx.journal, journal);
    step('photos-installed');

    if (typeof validateActive === 'function') validateActive(databasePath, photosPath);
    journal.phase = 'committed';
    journal.committedAt = new Date().toISOString();
    writeJsonAtomic(tx.journal, journal);
    step('committed');

    fs.rmSync(tx.transactionDir, { recursive: true, force: true });
    return { committed: true };
  } catch (error) {
    if (!leaveTransactionOnError) {
      try { recoverInterruptedRestore({ rootDir, databasePath, photosPath }); } catch (recoveryError) {
        error.recoveryError = recoveryError;
      }
    }
    throw error;
  }
}

module.exports = {
  applySnapshotTransaction,
  recoverInterruptedRestore,
  transactionPaths
};
