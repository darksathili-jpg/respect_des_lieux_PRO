import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { commitDirectoryAtomically, cleanupAbandonedStaging } = require('../src/atomic-snapshot.cjs');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-atomic-snapshot-'));
}

test('snapshot atomique : le dossier final n’apparaît qu’après validation', async () => {
  const root = tmpRoot();
  try {
    const finalName = 'backup-2026-09-28T19-30-00-000Z';
    let sawFinalDuringBuild = null;
    const result = await commitDirectoryAtomically({
      parentDir: root,
      finalName,
      build: async (staging) => {
        sawFinalDuringBuild = fs.existsSync(path.join(root, finalName));
        fs.writeFileSync(path.join(staging, 'manifest.json'), '{"ok":true}', 'utf8');
      },
      validate: async (staging) => {
        assert.equal(fs.existsSync(path.join(staging, 'manifest.json')), true);
        return { ok: true };
      }
    });

    assert.equal(sawFinalDuringBuild, false);
    assert.equal(result.folder, path.join(root, finalName));
    assert.equal(fs.existsSync(result.folder), true);
    assert.equal(fs.readdirSync(root).filter((name) => name.includes('.staging-')).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('snapshot atomique : un échec de construction ne laisse aucun faux backup final', async () => {
  const root = tmpRoot();
  try {
    const finalName = 'backup-2026-09-28T19-31-00-000Z';
    await assert.rejects(
      commitDirectoryAtomically({
        parentDir: root,
        finalName,
        build: async (staging) => {
          fs.writeFileSync(path.join(staging, 'partiel.bin'), 'incomplet');
          throw new Error('crash simulé');
        },
        validate: async () => ({ ok: true })
      }),
      /crash simulé/
    );

    assert.equal(fs.existsSync(path.join(root, finalName)), false);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('snapshot atomique : un échec de validation nettoie le staging', async () => {
  const root = tmpRoot();
  try {
    const finalName = 'backup-2026-09-28T19-32-00-000Z';
    await assert.rejects(
      commitDirectoryAtomically({
        parentDir: root,
        finalName,
        build: async (staging) => {
          fs.writeFileSync(path.join(staging, 'manifest.json'), '{}');
        },
        validate: async () => { throw new Error('snapshot invalide'); }
      }),
      /snapshot invalide/
    );

    assert.equal(fs.existsSync(path.join(root, finalName)), false);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('snapshot atomique : les staging abandonnés sont nettoyables au démarrage', () => {
  const root = tmpRoot();
  try {
    fs.mkdirSync(path.join(root, '.backup-2026-09-28.staging-123-abcdef'));
    fs.mkdirSync(path.join(root, 'backup-2026-09-27'));
    fs.mkdirSync(path.join(root, 'autre-dossier'));

    assert.equal(cleanupAbandonedStaging(root), 1);
    assert.equal(fs.existsSync(path.join(root, '.backup-2026-09-28.staging-123-abcdef')), false);
    assert.equal(fs.existsSync(path.join(root, 'backup-2026-09-27')), true);
    assert.equal(fs.existsSync(path.join(root, 'autre-dossier')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
