import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../src/database.cjs');
const { LocalPhotoStore } = require('../src/storage.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-pro-'));
  const dbPath = path.join(root, 'data', 'test.sqlite3');
  const photoDir = path.join(root, 'photos');
  const db = new LocalDatabase(dbPath);
  db.init();
  const photos = new LocalPhotoStore(photoDir);
  return { root, dbPath, photoDir, db, photos };
}

function cleanup(ctx) {
  try { ctx.db.close(); } catch {}
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

test('schéma local et intégrité SQLite', () => {
  const ctx = fixture();
  try {
    assert.equal(ctx.db.integrityCheck().ok, true);
    assert.deepEqual(ctx.db.getStats(), {
      signalements: 0,
      ouverts: 0,
      clos: 0,
      reparations: 0,
      photos: 0,
      photosBytes: 0
    });
  } finally {
    cleanup(ctx);
  }
});

test('numérotation annuelle transactionnelle et unique', () => {
  const ctx = fixture();
  try {
    const a = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'Hall' });
    const b = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'CDI' });
    const c = ctx.db.createSignalement({ date: '2027-01-05', lieu: 'Cour' });
    assert.equal(a.num, '2026-0001');
    assert.equal(b.num, '2026-0002');
    assert.equal(c.num, '2027-0001');
    assert.equal(ctx.db.getStats().signalements, 3);
  } finally {
    cleanup(ctx);
  }
});

test('réparation liée à un signalement existant', () => {
  const ctx = fixture();
  try {
    const s = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'Salle 101' });
    const r = ctx.db.createReparation({ signalement_id: s.id, mesure: 'Remplacement', referent: 'Agent' });
    assert.equal(Number(r.signalement_id), Number(s.id));
    assert.equal(ctx.db.listReparations()[0].signalement_num, s.num);
    assert.throws(() => ctx.db.createReparation({ signalement_id: 999999, mesure: 'Impossible' }), /introuvable/i);
  } finally {
    cleanup(ctx);
  }
});

test('photo JPEG stockée hors base avec garde-fou 3 Mo', () => {
  const ctx = fixture();
  try {
    const s = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'Gymnase' });
    const source = path.join(ctx.root, 'preuve.jpg');
    fs.writeFileSync(source, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]));
    const photo = ctx.photos.attach(s.id, source, ctx.db);
    assert.equal(photo.mime_type, 'image/jpeg');
    assert.equal(ctx.db.getStats().photos, 1);
    assert.equal(fs.existsSync(path.join(ctx.photoDir, photo.stored_name)), true);

    const tooLarge = path.join(ctx.root, 'large.jpg');
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 1);
    bytes[0] = 0xff; bytes[1] = 0xd8; bytes[2] = 0xff;
    fs.writeFileSync(tooLarge, bytes);
    assert.throws(() => ctx.photos.attach(s.id, tooLarge, ctx.db), /3 Mo/i);
  } finally {
    cleanup(ctx);
  }
});

test('backup SQLite cohérent et lisible', async () => {
  const ctx = fixture();
  try {
    ctx.db.createSignalement({ date: '2026-09-23', lieu: 'Atelier' });
    const target = path.join(ctx.root, 'backup', 'snapshot.sqlite3');
    await ctx.db.backupTo(target);
    assert.equal(fs.existsSync(target), true);
    const restored = new DatabaseSync(target, { timeout: 5000 });
    try {
      const row = restored.prepare('SELECT count(*) AS n FROM signalements').get();
      assert.equal(Number(row.n), 1);
      const check = restored.prepare('PRAGMA quick_check').get();
      assert.equal(Object.values(check)[0], 'ok');
    } finally {
      restored.close();
    }
  } finally {
    cleanup(ctx);
  }
});
