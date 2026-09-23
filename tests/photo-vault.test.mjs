import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../src/database.cjs');
const {
  LocalPhotoStore,
  MAX_PHOTOS_PER_SIGNALEMENT,
  MIN_FREE_SPACE_RESERVE_BYTES,
  ensureDiskHeadroom
} = require('../src/storage.cjs');

function tinyJpeg(marker = 1) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, marker & 0xff, 0x22, 0x33, 0xff, 0xd9]);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-photo-vault-'));
  const db = new LocalDatabase(path.join(root, 'data', 'test.sqlite3'));
  db.init();
  const photos = new LocalPhotoStore(path.join(root, 'photos'));
  return { root, db, photos };
}

function cleanup(ctx) {
  try { ctx.db.close(); } catch {}
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

test('coffre photo : maximum 2 fichiers par signalement', () => {
  const ctx = fixture();
  try {
    assert.equal(MAX_PHOTOS_PER_SIGNALEMENT, 2);
    const s = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'Cour' });
    for (let i = 1; i <= 3; i += 1) {
      fs.writeFileSync(path.join(ctx.root, `photo-${i}.jpg`), tinyJpeg(i));
    }
    ctx.photos.attach(s.id, path.join(ctx.root, 'photo-1.jpg'), ctx.db);
    ctx.photos.attach(s.id, path.join(ctx.root, 'photo-2.jpg'), ctx.db);
    assert.equal(ctx.db.listPhotos(s.id).length, 2);
    assert.throws(
      () => ctx.photos.attach(s.id, path.join(ctx.root, 'photo-3.jpg'), ctx.db),
      /Maximum atteint.*2 photos/i
    );
  } finally {
    cleanup(ctx);
  }
});

test('coffre photo : un JPEG identique n’est pas dupliqué', () => {
  const ctx = fixture();
  try {
    const s = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'CDI' });
    const a = path.join(ctx.root, 'a.jpg');
    const b = path.join(ctx.root, 'b.jpg');
    const bytes = tinyJpeg(7);
    fs.writeFileSync(a, bytes);
    fs.writeFileSync(b, bytes);
    ctx.photos.attach(s.id, a, ctx.db);
    assert.throws(() => ctx.photos.attach(s.id, b, ctx.db), /déjà associée/i);
    assert.equal(ctx.db.listPhotos(s.id).length, 1);
  } finally {
    cleanup(ctx);
  }
});

test('coffre photo : simulation disque presque plein, écriture refusée avant copie', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-low-disk-'));
  const original = fs.statfsSync;
  try {
    assert.equal(MIN_FREE_SPACE_RESERVE_BYTES, 64 * 1024 * 1024);
    fs.statfsSync = () => ({ bsize: 4096, bavail: 8 });
    assert.throws(
      () => ensureDiskHeadroom(root, 1024),
      /Espace disque insuffisant.*64 Mo/i
    );
  } finally {
    fs.statfsSync = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
