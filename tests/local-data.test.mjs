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

function jpegWithExif() {
  const exif = Buffer.from('Exif\0\0GPS=50.000,3.000', 'latin1');
  const app1 = Buffer.alloc(4 + exif.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(exif.length + 2, 2);
  exif.copy(app1, 4);
  const scanAndEnd = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, scanAndEnd]);
}

test('schéma local R3 et intégrité SQLite', () => {
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
    const version = ctx.db.db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
    assert.equal(version.value, '3');
    const cols = new Set(ctx.db.db.prepare('PRAGMA table_info(signalements)').all().map((r) => r.name));
    assert.equal(cols.has('closed_at'), true);
    assert.equal(cols.has('identity_reduced_at'), true);
    const tables = new Set(ctx.db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    assert.equal(tables.has('signalement_events'), true, 'R3 doit conserver un historique minimal des mutations métier');
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

test('photo JPEG stockée hors base, limitée à 3 Mo et débarrassée des métadonnées', () => {
  const ctx = fixture();
  try {
    const s = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'Gymnase' });
    const source = path.join(ctx.root, 'eleve-nom-gps.jpg');
    fs.writeFileSync(source, jpegWithExif());
    const photo = ctx.photos.attach(s.id, source, ctx.db);
    assert.equal(photo.mime_type, 'image/jpeg');
    assert.equal(photo.original_name, 'photo.jpg');
    assert.equal(ctx.db.getStats().photos, 1);

    const storedPath = path.join(ctx.photoDir, photo.stored_name);
    assert.equal(fs.existsSync(storedPath), true);
    const stored = fs.readFileSync(storedPath);
    assert.equal(stored.includes(Buffer.from('Exif', 'latin1')), false);
    assert.equal(stored.includes(Buffer.from('GPS=50.000,3.000', 'latin1')), false);

    const tooLarge = path.join(ctx.root, 'large.jpg');
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 1);
    bytes[0] = 0xff; bytes[1] = 0xd8; bytes[2] = 0xff;
    fs.writeFileSync(tooLarge, bytes);
    assert.throws(() => ctx.photos.attach(s.id, tooLarge, ctx.db), /3 Mo/i);
  } finally {
    cleanup(ctx);
  }
});

test('politique de conservation sans durée arbitraire et avec validation explicite', () => {
  const ctx = fixture();
  try {
    assert.equal(ctx.db.getRetentionPolicy().active, false);
    assert.throws(
      () => ctx.db.configureRetentionPolicy({ enabled: true, months: 12, confirmed: false }),
      /confirmation/i
    );
    const policy = ctx.db.configureRetentionPolicy({ enabled: true, months: 12, confirmed: true, note: 'Validation interne test' });
    assert.equal(policy.active, true);
    assert.equal(policy.months, 12);
    assert.match(policy.approvedAt, /^\d{4}-/);
    const disabled = ctx.db.configureRetentionPolicy({ enabled: false });
    assert.equal(disabled.active, false);
  } finally {
    cleanup(ctx);
  }
});

test('clôture tracée et échéance calculée sans purge automatique', () => {
  const ctx = fixture();
  try {
    const s = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'Cour' });
    const closed = ctx.db.setSignalementStatus(s.id, 'Clos');
    assert.match(closed.closed_at, /^\d{4}-/);
    ctx.db.configureRetentionPolicy({ enabled: true, months: 1, confirmed: true });
    const future = new Date(new Date(closed.closed_at).getTime() + 70 * 86400000);
    const review = ctx.db.getLifecycleReview(future);
    assert.equal(review.rows.length, 1);
    assert.equal(review.rows[0].num, s.num);
    assert.equal(review.rows[0].lifecycle_state, 'due');
    assert.equal(ctx.db.getStats().signalements, 1, 'aucune suppression automatique ne doit avoir lieu');
  } finally {
    cleanup(ctx);
  }
});

test('réduction des identifiants structurés réservée aux dossiers clos et inclut signalé par', () => {
  const ctx = fixture();
  try {
    const s = ctx.db.createSignalement({
      date: '2026-09-23',
      lieu: 'Hall',
      eleve: 'Nom Élève',
      classe: 'T1',
      signale_par: 'Nom adulte'
    });
    assert.throws(() => ctx.db.reduceDirectIdentifiers(s.id), /dossiers clos/i);
    ctx.db.setSignalementStatus(s.id, 'Clos');
    const reduced = ctx.db.reduceDirectIdentifiers(s.id);
    assert.equal(reduced.eleve, '');
    assert.equal(reduced.classe, '');
    assert.equal(reduced.signale_par, '');
    assert.match(reduced.identity_reduced_at, /^\d{4}-/);
    assert.equal(ctx.db.listPrivacyEvents(10)[0].event_type, 'direct_identifiers_reduced');
    const eventTypes = ctx.db.listSignalementEvents(s.id, 20).map((event) => event.event_type);
    assert.ok(eventTypes.includes('identities_reduced'));
  } finally {
    cleanup(ctx);
  }
});

test('suppression contrôlée exige numéro exact et permet staging photo réversible', () => {
  const ctx = fixture();
  try {
    const s = ctx.db.createSignalement({ date: '2026-09-23', lieu: 'Gymnase' });
    const source = path.join(ctx.root, 'preuve.jpg');
    fs.writeFileSync(source, jpegWithExif());
    const photo = ctx.photos.attach(s.id, source, ctx.db);
    ctx.db.setSignalementStatus(s.id, 'Clos');

    assert.throws(() => ctx.db.getPurgePlan(s.id, 'mauvais'), /confirmation invalide/i);
    const plan = ctx.db.getPurgePlan(s.id, s.num);
    const stage = ctx.photos.stageDelete(plan.storedNames);
    assert.equal(fs.existsSync(path.join(ctx.photoDir, photo.stored_name)), false);
    ctx.photos.rollbackStagedDelete(stage);
    assert.equal(fs.existsSync(path.join(ctx.photoDir, photo.stored_name)), true);

    const stage2 = ctx.photos.stageDelete(plan.storedNames);
    ctx.db.purgeSignalement(s.id, s.num);
    ctx.photos.commitStagedDelete(stage2);
    assert.equal(ctx.db.getSignalement(s.id), null);
    assert.equal(fs.existsSync(path.join(ctx.photoDir, photo.stored_name)), false);
  } finally {
    cleanup(ctx);
  }
});

test('revue de droit d’accès produit un dossier interne avec avertissement tiers', () => {
  const ctx = fixture();
  try {
    ctx.db.createSignalement({ date: '2026-09-23', lieu: 'CDI', eleve: 'Alice Martin', description: 'Dégradation constatée' });
    assert.throws(() => ctx.db.buildAccessReview('A'), /2 caractères/i);
    const review = ctx.db.buildAccessReview('Alice');
    assert.equal(review.signalements.length, 1);
    assert.equal(review.reviewRequired, true);
    assert.match(review.warning, /tiers/i);
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
