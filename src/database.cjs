const { DatabaseSync, backup } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const text = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
const idNumber = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Identifiant invalide.');
  return n;
};

class LocalDatabase {
  constructor(databasePath) {
    this.databasePath = databasePath;
    this.db = null;
  }

  init() {
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    this.db = new DatabaseSync(this.databasePath, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA trusted_schema = OFF;

      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS signalement_counters (
        year INTEGER PRIMARY KEY,
        last_value INTEGER NOT NULL CHECK(last_value >= 0)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS signalements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        num TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        heure TEXT NOT NULL DEFAULT '',
        lieu TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT '',
        gravite TEXT NOT NULL DEFAULT '',
        signale_par TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        eleve TEXT NOT NULL DEFAULT '',
        classe TEXT NOT NULL DEFAULT '',
        famille TEXT NOT NULL DEFAULT '',
        statut TEXT NOT NULL DEFAULT 'Ouvert',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ) STRICT;

      CREATE TABLE IF NOT EXISTS reparations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signalement_id INTEGER NOT NULL,
        mesure TEXT NOT NULL DEFAULT '',
        referent TEXT NOT NULL DEFAULT '',
        debut TEXT NOT NULL DEFAULT '',
        duree TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        cloture TEXT NOT NULL DEFAULT '',
        statut TEXT NOT NULL DEFAULT 'En cours',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(signalement_id) REFERENCES signalements(id) ON DELETE RESTRICT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signalement_id INTEGER NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL CHECK(mime_type = 'image/jpeg'),
        size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 3145728),
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(signalement_id) REFERENCES signalements(id) ON DELETE RESTRICT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_signalements_date ON signalements(date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_signalements_statut ON signalements(statut);
      CREATE INDEX IF NOT EXISTS idx_signalements_lieu ON signalements(lieu);
      CREATE INDEX IF NOT EXISTS idx_reparations_signalement ON reparations(signalement_id);
      CREATE INDEX IF NOT EXISTS idx_reparations_statut ON reparations(statut);
      CREATE INDEX IF NOT EXISTS idx_photos_signalement ON photos(signalement_id);

      INSERT INTO schema_meta(key, value) VALUES('schema_version', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    return this;
  }

  ensureOpen() {
    if (!this.db) throw new Error('Base locale non initialisée.');
  }

  transaction(fn) {
    this.ensureOpen();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  createSignalement(payload = {}) {
    const date = text(payload.date, 10) || new Date().toISOString().slice(0, 10);
    const yearMatch = /^(\d{4})-/.exec(date);
    const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
    const lieu = text(payload.lieu, 200);
    if (!lieu) throw new Error('Le lieu est obligatoire.');

    return this.transaction(() => {
      this.db.prepare(`
        INSERT INTO signalement_counters(year, last_value) VALUES(?, 1)
        ON CONFLICT(year) DO UPDATE SET last_value = last_value + 1
      `).run(year);
      const counter = this.db.prepare('SELECT last_value FROM signalement_counters WHERE year = ?').get(year);
      const num = `${year}-${String(Number(counter.last_value)).padStart(4, '0')}`;

      const result = this.db.prepare(`
        INSERT INTO signalements(
          num, date, heure, lieu, type, gravite, signale_par,
          description, eleve, classe, famille, statut
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        num,
        date,
        text(payload.heure, 8),
        lieu,
        text(payload.type, 120),
        text(payload.gravite, 80),
        text(payload.signale_par, 200),
        text(payload.description, 5000),
        text(payload.eleve, 200),
        text(payload.classe, 100),
        text(payload.famille, 200),
        text(payload.statut, 80) || 'Ouvert'
      );
      return this.getSignalement(Number(result.lastInsertRowid));
    });
  }

  getSignalement(id) {
    this.ensureOpen();
    return this.db.prepare(`
      SELECT s.*,
             (SELECT count(*) FROM photos p WHERE p.signalement_id = s.id) AS photo_count,
             (SELECT count(*) FROM reparations r WHERE r.signalement_id = s.id) AS reparation_count
      FROM signalements s
      WHERE s.id = ?
    `).get(idNumber(id)) || null;
  }

  listSignalements(limit = 500) {
    this.ensureOpen();
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return this.db.prepare(`
      SELECT s.*,
             (SELECT count(*) FROM photos p WHERE p.signalement_id = s.id) AS photo_count,
             (SELECT count(*) FROM reparations r WHERE r.signalement_id = s.id) AS reparation_count
      FROM signalements s
      ORDER BY s.date DESC, s.id DESC
      LIMIT ?
    `).all(safeLimit);
  }

  updateSignalement(id, patch = {}) {
    this.ensureOpen();
    const allowed = ['date','heure','lieu','type','gravite','signale_par','description','eleve','classe','famille','statut'];
    const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
    if (!entries.length) return this.getSignalement(id);
    if (entries.some(([key, value]) => key === 'lieu' && !text(value, 200))) {
      throw new Error('Le lieu ne peut pas être vide.');
    }
    const columns = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([key, value]) => text(value, key === 'description' ? 5000 : 200));
    this.db.prepare(`UPDATE signalements SET ${columns}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(...values, idNumber(id));
    return this.getSignalement(id);
  }

  createReparation(payload = {}) {
    this.ensureOpen();
    const signalementId = idNumber(payload.signalement_id);
    if (!this.getSignalement(signalementId)) throw new Error('Signalement introuvable.');
    const result = this.db.prepare(`
      INSERT INTO reparations(signalement_id, mesure, referent, debut, duree, notes, cloture, statut)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      signalementId,
      text(payload.mesure, 2000),
      text(payload.referent, 200),
      text(payload.debut, 30),
      text(payload.duree, 100),
      text(payload.notes, 5000),
      text(payload.cloture, 30),
      text(payload.statut, 80) || 'En cours'
    );
    return this.db.prepare('SELECT * FROM reparations WHERE id = ?').get(Number(result.lastInsertRowid));
  }

  listReparations(limit = 1000) {
    this.ensureOpen();
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    return this.db.prepare(`
      SELECT r.*, s.num AS signalement_num, s.lieu AS signalement_lieu
      FROM reparations r
      JOIN signalements s ON s.id = r.signalement_id
      ORDER BY r.id DESC
      LIMIT ?
    `).all(safeLimit);
  }

  insertPhotoMetadata(payload) {
    this.ensureOpen();
    const result = this.db.prepare(`
      INSERT INTO photos(signalement_id, original_name, stored_name, mime_type, size_bytes, sha256)
      VALUES(?, ?, ?, 'image/jpeg', ?, ?)
    `).run(
      idNumber(payload.signalement_id),
      text(payload.original_name, 300),
      text(payload.stored_name, 300),
      Number(payload.size_bytes),
      text(payload.sha256, 64)
    );
    return this.getPhoto(Number(result.lastInsertRowid));
  }

  getPhoto(id) {
    this.ensureOpen();
    return this.db.prepare('SELECT * FROM photos WHERE id = ?').get(idNumber(id)) || null;
  }

  listPhotos(signalementId) {
    this.ensureOpen();
    return this.db.prepare('SELECT * FROM photos WHERE signalement_id = ? ORDER BY id DESC').all(idNumber(signalementId));
  }

  getStats() {
    this.ensureOpen();
    const s = this.db.prepare(`
      SELECT count(*) AS total,
             sum(CASE WHEN statut = 'Ouvert' THEN 1 ELSE 0 END) AS ouverts,
             sum(CASE WHEN statut = 'Clos' THEN 1 ELSE 0 END) AS clos
      FROM signalements
    `).get();
    const r = this.db.prepare('SELECT count(*) AS total FROM reparations').get();
    const p = this.db.prepare('SELECT count(*) AS total, coalesce(sum(size_bytes),0) AS bytes FROM photos').get();
    return {
      signalements: Number(s.total || 0),
      ouverts: Number(s.ouverts || 0),
      clos: Number(s.clos || 0),
      reparations: Number(r.total || 0),
      photos: Number(p.total || 0),
      photosBytes: Number(p.bytes || 0)
    };
  }

  integrityCheck() {
    this.ensureOpen();
    const rows = this.db.prepare('PRAGMA quick_check').all();
    const messages = rows.map((row) => String(Object.values(row)[0]));
    return { ok: messages.length > 0 && messages.every((message) => message === 'ok'), messages };
  }

  async backupTo(targetPath) {
    this.ensureOpen();
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await backup(this.db, targetPath, { rate: 100 });
    return targetPath;
  }

  close() {
    if (!this.db) return;
    try { this.db.exec('PRAGMA optimize'); } catch {}
    this.db.close();
    this.db = null;
  }
}

module.exports = { LocalDatabase };
