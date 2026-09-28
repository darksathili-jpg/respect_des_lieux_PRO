import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applySnapshotTransaction, recoverInterruptedRestore, transactionPaths } = require('../src/restore-transaction.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-restore-tx-'));
  const data = path.join(root, 'data');
  const photos = path.join(root, 'photos');
  const snapshot = path.join(root, 'snapshot');
  const snapshotPhotos = path.join(snapshot, 'photos');
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(photos, { recursive: true });
  fs.mkdirSync(snapshotPhotos, { recursive: true });

  const database = path.join(data, 'respect-des-lieux.sqlite3');
  const snapshotDatabase = path.join(snapshot, 'respect-des-lieux.sqlite3');
  fs.writeFileSync(database, 'OLD-DB');
  fs.writeFileSync(`${database}-wal`, 'OLD-WAL');
  fs.writeFileSync(`${database}-shm`, 'OLD-SHM');
  fs.writeFileSync(path.join(photos, 'old.jpg'), 'OLD-PHOTO');
  fs.writeFileSync(snapshotDatabase, 'NEW-DB');
  fs.writeFileSync(path.join(snapshotPhotos, 'new.jpg'), 'NEW-PHOTO');

  return { root, database, photos, snapshotDatabase, snapshotPhotos };
}

function readState(ctx) {
  return {
    db: fs.existsSync(ctx.database) ? fs.readFileSync(ctx.database, 'utf8') : null,
    wal: fs.existsSync(`${ctx.database}-wal`) ? fs.readFileSync(`${ctx.database}-wal`, 'utf8') : null,
    shm: fs.existsSync(`${ctx.database}-shm`) ? fs.readFileSync(`${ctx.database}-shm`, 'utf8') : null,
    oldPhoto: fs.existsSync(path.join(ctx.photos, 'old.jpg')),
    newPhoto: fs.existsSync(path.join(ctx.photos, 'new.jpg'))
  };
}

function runCrashScenario(stepName) {
  const ctx = fixture();
  try {
    assert.throws(() => applySnapshotTransaction({
      rootDir: ctx.root,
      databasePath: ctx.database,
      photosPath: ctx.photos,
      snapshotDatabasePath: ctx.snapshotDatabase,
      snapshotPhotosPath: ctx.snapshotPhotos,
      leaveTransactionOnError: true,
      onStep(step) {
        if (step === stepName) throw new Error(`CRASH:${step}`);
      }
    }), new RegExp(`CRASH:${stepName}`));

    assert.equal(fs.existsSync(transactionPaths(ctx.root).transactionDir), true);
    const recovery = recoverInterruptedRestore({
      rootDir: ctx.root,
      databasePath: ctx.database,
      photosPath: ctx.photos
    });
    assert.equal(recovery.recovered, true);
    return { ctx, recovery, state: readState(ctx) };
  } catch (error) {
    fs.rmSync(ctx.root, { recursive: true, force: true });
    throw error;
  }
}

test('restauration transactionnelle : succès complet publie uniquement le nouvel état', () => {
  const ctx = fixture();
  try {
    const result = applySnapshotTransaction({
      rootDir: ctx.root,
      databasePath: ctx.database,
      photosPath: ctx.photos,
      snapshotDatabasePath: ctx.snapshotDatabase,
      snapshotPhotosPath: ctx.snapshotPhotos,
      validateActive(databasePath, photosPath) {
        assert.equal(fs.readFileSync(databasePath, 'utf8'), 'NEW-DB');
        assert.equal(fs.existsSync(path.join(photosPath, 'new.jpg')), true);
      }
    });
    assert.equal(result.committed, true);
    assert.deepEqual(readState(ctx), {
      db: 'NEW-DB', wal: null, shm: null, oldPhoto: false, newPhoto: true
    });
    assert.equal(fs.existsSync(transactionPaths(ctx.root).transactionDir), false);
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

for (const stepName of ['prepared', 'previous-staged', 'database-installed', 'photos-installed']) {
  test(`restauration transactionnelle : interruption après ${stepName} restaure intégralement l'ancien état`, () => {
    const { ctx, recovery, state } = runCrashScenario(stepName);
    try {
      assert.equal(recovery.action, 'rolled-back');
      assert.deepEqual(state, {
        db: 'OLD-DB', wal: 'OLD-WAL', shm: 'OLD-SHM', oldPhoto: true, newPhoto: false
      });
      assert.equal(fs.existsSync(transactionPaths(ctx.root).transactionDir), false);
    } finally {
      fs.rmSync(ctx.root, { recursive: true, force: true });
    }
  });
}

test('restauration transactionnelle : interruption après journal committed conserve le nouvel état', () => {
  const { ctx, recovery, state } = runCrashScenario('committed');
  try {
    assert.equal(recovery.action, 'kept-committed');
    assert.deepEqual(state, {
      db: 'NEW-DB', wal: null, shm: null, oldPhoto: false, newPhoto: true
    });
    assert.equal(fs.existsSync(transactionPaths(ctx.root).transactionDir), false);
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('restauration transactionnelle : erreur runtime déclenche un rollback immédiat', () => {
  const ctx = fixture();
  try {
    assert.throws(() => applySnapshotTransaction({
      rootDir: ctx.root,
      databasePath: ctx.database,
      photosPath: ctx.photos,
      snapshotDatabasePath: ctx.snapshotDatabase,
      snapshotPhotosPath: ctx.snapshotPhotos,
      onStep(step) {
        if (step === 'database-installed') throw new Error('échec simulé');
      }
    }), /échec simulé/);
    assert.deepEqual(readState(ctx), {
      db: 'OLD-DB', wal: 'OLD-WAL', shm: 'OLD-SHM', oldPhoto: true, newPhoto: false
    });
    assert.equal(fs.existsSync(transactionPaths(ctx.root).transactionDir), false);
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
