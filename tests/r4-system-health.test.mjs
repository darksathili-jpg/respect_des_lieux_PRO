import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSystemHealth } = require('../src/system-health.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-health-'));
  const data = path.join(root, 'data');
  const photos = path.join(root, 'photos');
  const backups = path.join(root, 'backups');
  const exportsDir = path.join(root, 'exports');
  for (const dir of [data, photos, backups, exportsDir]) fs.mkdirSync(dir, { recursive: true });
  const database = path.join(data, 'respect-des-lieux.sqlite3');
  const sqlite = new DatabaseSync(database);
  sqlite.exec("CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT; INSERT INTO schema_meta VALUES('schema_version','3');");
  sqlite.close();
  const backup = path.join(backups, 'backup-2026-09-29T05-00-00-000Z');
  fs.mkdirSync(backup);
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ format: 2, createdAt: '2026-09-29T05:00:00.000Z', reason: 'manual' }));
  return {
    root,
    paths: {
      root, data, photos, backups, exports: exportsDir,
      pendingRestore: path.join(root, 'pending-restore'),
      restoreMarker: path.join(root, 'restore-pending.json'),
      database
    }
  };
}

test('health enrichi : formats, disque, dernière sauvegarde et dossiers sont remontés sans secret', () => {
  const fx = fixture();
  try {
    const health = buildSystemHealth({
      paths: fx.paths,
      integrity: { ok: true },
      stats: { signalements: 1 },
      retention: { active: false },
      appVersion: '5.2.1-test'
    });
    assert.equal(health.integrity.ok, true);
    assert.equal(health.formats.databaseSchema, 3);
    assert.equal(health.formats.backup, 2);
    assert.equal(health.formats.restoreMarker, 1);
    assert.equal(health.lastBackup.name, 'backup-2026-09-29T05-00-00-000Z');
    assert.equal(health.lastBackup.reason, 'manual');
    assert.equal(health.restore.pending, false);
    assert.equal(health.directories.root.exists, true);
    assert.equal(health.directories.root.readable, true);
    assert.equal(health.directories.root.writable, true);
    assert.ok(health.disk.availableBytes === null || health.disk.availableBytes >= 0);
    assert.equal('passphrase' in health, false);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('health enrichi : une restauration en attente est explicitement signalée', () => {
  const fx = fixture();
  try {
    fs.mkdirSync(fx.paths.pendingRestore);
    fs.writeFileSync(fx.paths.restoreMarker, JSON.stringify({ format: 1, preparedAt: '2026-09-29T05:30:00.000Z' }));
    const health = buildSystemHealth({
      paths: fx.paths,
      integrity: { ok: true }, stats: {}, retention: {}, appVersion: 'test'
    });
    assert.equal(health.restore.pending, true);
    assert.equal(health.restore.pendingDirectory, true);
    assert.equal(health.restore.markerExists, true);
    assert.equal(health.restore.preparedAt, '2026-09-29T05:30:00.000Z');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});
