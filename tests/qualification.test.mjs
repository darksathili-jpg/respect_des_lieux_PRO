import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../src/database.cjs');

function fixture(prefix = 'rdl-pro-qualification-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(root, 'data', 'qualification.sqlite3');
  const db = new LocalDatabase(dbPath);
  db.init();
  return { root, dbPath, db };
}

function cleanup(ctx) {
  try { ctx.db?.close(); } catch {}
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

test('qualification volume : 5 000 signalements et 10 000 réparations restent lisibles dans la fenêtre UI', () => {
  const ctx = fixture();
  try {
    ctx.db.transaction(() => {
      const insertSignalement = ctx.db.db.prepare('INSERT INTO signalements(num, date, lieu, statut) VALUES(?, ?, ?, ?)');
      for (let i = 1; i <= 5000; i += 1) {
        insertSignalement.run(`2026-${String(i).padStart(4, '0')}`, '2026-09-23', `Lieu ${i % 80}`, i % 4 === 0 ? 'Clos' : 'Ouvert');
      }
      const insertReparation = ctx.db.db.prepare('INSERT INTO reparations(signalement_id, mesure, statut) VALUES(?, ?, ?)');
      for (let i = 1; i <= 10000; i += 1) {
        insertReparation.run(((i - 1) % 5000) + 1, `Mesure ${i}`, i % 3 === 0 ? 'Terminée' : 'En cours');
      }
    });

    const started = performance.now();
    const signalements = ctx.db.listSignalements(500);
    const reparations = ctx.db.listReparations(1000);
    const elapsedMs = performance.now() - started;

    assert.equal(signalements.length, 500);
    assert.equal(reparations.length, 1000);
    assert.equal(ctx.db.getStats().signalements, 5000);
    assert.equal(ctx.db.getStats().reparations, 10000);
    assert.equal(ctx.db.integrityCheck().ok, true);
    assert.ok(elapsedMs < 3000, `Fenêtre de lecture trop lente: ${elapsedMs.toFixed(1)} ms`);
  } finally {
    cleanup(ctx);
  }
});

test('qualification crash : une écriture validée survit à une fermeture brutale du processus', () => {
  const ctx = fixture('rdl-pro-crash-commit-');
  try {
    ctx.db.close();
    const databaseModule = path.resolve('src/database.cjs');
    const script = `
      const { LocalDatabase } = require(${JSON.stringify(databaseModule)});
      const db = new LocalDatabase(${JSON.stringify(ctx.dbPath)});
      db.init();
      db.createSignalement({ date: '2026-09-23', lieu: 'Test crash validé' });
      process.exit(17);
    `;
    const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 15000 });
    assert.equal(child.status, 17, child.stderr || child.stdout);

    ctx.db = new LocalDatabase(ctx.dbPath);
    ctx.db.init();
    assert.equal(ctx.db.getStats().signalements, 1);
    assert.equal(ctx.db.integrityCheck().ok, true);
  } finally {
    cleanup(ctx);
  }
});

test('qualification crash : une transaction interrompue avant COMMIT est annulée à la réouverture', () => {
  const ctx = fixture('rdl-pro-crash-rollback-');
  try {
    ctx.db.close();
    const databaseModule = path.resolve('src/database.cjs');
    const script = `
      const { LocalDatabase } = require(${JSON.stringify(databaseModule)});
      const db = new LocalDatabase(${JSON.stringify(ctx.dbPath)});
      db.init();
      db.db.exec('BEGIN IMMEDIATE');
      db.db.prepare('INSERT INTO signalements(num, date, lieu) VALUES(?, ?, ?)').run('2026-9999', '2026-09-23', 'Transaction interrompue');
      process.exit(18);
    `;
    const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 15000 });
    assert.equal(child.status, 18, child.stderr || child.stdout);

    ctx.db = new LocalDatabase(ctx.dbPath);
    ctx.db.init();
    assert.equal(ctx.db.getStats().signalements, 0);
    assert.equal(ctx.db.integrityCheck().ok, true);
  } finally {
    cleanup(ctx);
  }
});
