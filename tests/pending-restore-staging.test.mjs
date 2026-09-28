import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  cleanupAbandonedPendingRestoreStaging,
  cleanupOrphanedPendingRestore,
  publishPendingRestoreAtomically
} = require('../src/pending-restore-staging.cjs');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-pending-restore-'));
}

test('pending restore : publication uniquement après extraction et validation', async () => {
  const root = tmpRoot();
  const pendingDir = path.join(root, 'pending-restore');
  const sourceFile = path.join(root, 'backup.rdlbackup');
  fs.writeFileSync(sourceFile, 'fixture');
  try {
    let sawFinalDuringExtract = null;
    const result = await publishPendingRestoreAtomically({
      rootDir: root,
      pendingDir,
      sourceFile,
      extract: async (_source, staging) => {
        sawFinalDuringExtract = fs.existsSync(pendingDir);
        fs.writeFileSync(path.join(staging, 'manifest.json'), '{"format":2}', 'utf8');
      },
      validate: async (staging) => {
        assert.equal(fs.existsSync(path.join(staging, 'manifest.json')), true);
        return { manifest: { format: 2 } };
      }
    });

    assert.equal(sawFinalDuringExtract, false);
    assert.equal(result.pendingDir, pendingDir);
    assert.equal(fs.existsSync(pendingDir), true);
    assert.equal(fs.readdirSync(root).some((name) => name.startsWith('.pending-restore.staging-')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending restore : échec de déchiffrement ne laisse ni final ni staging', async () => {
  const root = tmpRoot();
  const pendingDir = path.join(root, 'pending-restore');
  const sourceFile = path.join(root, 'backup.rdlbackup');
  fs.writeFileSync(sourceFile, 'fixture');
  try {
    await assert.rejects(
      publishPendingRestoreAtomically({
        rootDir: root,
        pendingDir,
        sourceFile,
        extract: async (_source, staging) => {
          fs.writeFileSync(path.join(staging, 'partiel.bin'), 'partiel');
          throw new Error('secret invalide');
        },
        validate: async () => ({ ok: true })
      }),
      /secret invalide/
    );
    assert.equal(fs.existsSync(pendingDir), false);
    assert.equal(fs.readdirSync(root).some((name) => name.startsWith('.pending-restore.staging-')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending restore : échec de validation nettoie le staging', async () => {
  const root = tmpRoot();
  const pendingDir = path.join(root, 'pending-restore');
  const sourceFile = path.join(root, 'backup.rdlbackup');
  fs.writeFileSync(sourceFile, 'fixture');
  try {
    await assert.rejects(
      publishPendingRestoreAtomically({
        rootDir: root,
        pendingDir,
        sourceFile,
        extract: async (_source, staging) => {
          fs.writeFileSync(path.join(staging, 'manifest.json'), '{}');
        },
        validate: async () => { throw new Error('snapshot invalide'); }
      }),
      /snapshot invalide/
    );
    assert.equal(fs.existsSync(pendingDir), false);
    assert.equal(fs.readdirSync(root).some((name) => name.startsWith('.pending-restore.staging-')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending restore : une restauration déjà préparée n’est jamais écrasée', async () => {
  const root = tmpRoot();
  const pendingDir = path.join(root, 'pending-restore');
  const sourceFile = path.join(root, 'backup.rdlbackup');
  fs.mkdirSync(pendingDir);
  fs.writeFileSync(path.join(pendingDir, 'keep.txt'), 'existant');
  fs.writeFileSync(sourceFile, 'fixture');
  try {
    await assert.rejects(
      publishPendingRestoreAtomically({
        rootDir: root,
        pendingDir,
        sourceFile,
        extract: async () => {},
        validate: async () => ({ ok: true })
      }),
      /déjà préparée/
    );
    assert.equal(fs.readFileSync(path.join(pendingDir, 'keep.txt'), 'utf8'), 'existant');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending restore : les staging abandonnés sont nettoyables au démarrage', () => {
  const root = tmpRoot();
  try {
    fs.mkdirSync(path.join(root, '.pending-restore.staging-123-abcdef'));
    fs.mkdirSync(path.join(root, 'pending-restore'));
    fs.mkdirSync(path.join(root, 'autre-dossier'));

    assert.equal(cleanupAbandonedPendingRestoreStaging(root), 1);
    assert.equal(fs.existsSync(path.join(root, '.pending-restore.staging-123-abcdef')), false);
    assert.equal(fs.existsSync(path.join(root, 'pending-restore')), true);
    assert.equal(fs.existsSync(path.join(root, 'autre-dossier')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending restore : un final sans marqueur est supprimé comme orphelin', () => {
  const root = tmpRoot();
  const pendingDir = path.join(root, 'pending-restore');
  const markerPath = path.join(root, 'restore-pending.json');
  fs.mkdirSync(pendingDir);
  fs.writeFileSync(path.join(pendingDir, 'manifest.json'), '{}');
  fs.writeFileSync(`${markerPath}.tmp`, '{"partial":true}', 'utf8');
  try {
    assert.equal(cleanupOrphanedPendingRestore({ pendingDir, markerPath }), true);
    assert.equal(fs.existsSync(pendingDir), false);
    assert.equal(fs.existsSync(`${markerPath}.tmp`), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending restore : un final avec marqueur reste intact', () => {
  const root = tmpRoot();
  const pendingDir = path.join(root, 'pending-restore');
  const markerPath = path.join(root, 'restore-pending.json');
  fs.mkdirSync(pendingDir);
  fs.writeFileSync(markerPath, '{"format":1}', 'utf8');
  try {
    assert.equal(cleanupOrphanedPendingRestore({ pendingDir, markerPath }), false);
    assert.equal(fs.existsSync(pendingDir), true);
    assert.equal(fs.existsSync(markerPath), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
