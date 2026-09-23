const { DatabaseSync, backup } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const text = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
const idNumber = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Identifiant invalide.');
  return n;
};
const nowIso = () => new Date().toISOString();

function addMonthsIso(iso, months) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

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

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ) STRICT;

      CREATE TABLE IF NOT EXISTS privacy_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        dossier_num TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
        closed_at TEXT NOT NULL DEFAULT '',
        identity_reduced_at TEXT NOT NULL DEFAULT '',
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
      CREATE INDEX IF NOT EXISTS idx_privacy_events_date ON privacy_events(created_at DESC);
    `);

    this.migrateSchema();
    return this;
  }

  migrateSchema() {
    this.ensureOpen();
    const columns = new Set(this.db.prepare('PRAGMA table_info(signalements)').all().map((row) => row.name));
    if (!columns.has('closed_at')) {
      this.db.exec("ALTER TABLE signalements ADD COLUMN closed_at TEXT NOT NULL DEFAULT ''");
    }
    if (!columns.has('identity_reduced_at')) {
      this.db.exec("ALTER TABLE signalements ADD COLUMN identity_reduced_at TEXT NOT NULL DEFAULT ''");
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_signalements_closed_at ON signalements(closed_at)');
    this.db.prepare(`
      INSERT INTO schema_meta(key, value) VALUES('schema_version', '2')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
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

  recordPrivacyEvent(eventType, dossierNum = '', detail = '') {
    this.ensureOpen();
    this.db.prepare('INSERT INTO privacy_events(event_type, dossier_num, detail) VALUES(?, ?, ?)')
      .run(text(eventType, 100), text(dossierNum, 40), text(detail, 500));
  }

  listPrivacyEvents(limit = 100) {
    this.ensureOpen();
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    return this.db.prepare('SELECT * FROM privacy_events ORDER BY id DESC LIMIT ?').all(safeLimit);
  }

  getSetting(key) {
    this.ensureOpen();
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(text(key, 100));
    return row ? String(row.value) : null;
  }

  setSetting(key, value) {
    this.ensureOpen();
    this.db.prepare(`
      INSERT INTO app_settings(key, value, updated_at) VALUES(?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(text(key, 100), text(value, 1000));
  }

  deleteSetting(key) {
    this.ensureOpen();
    this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(text(key, 100));
  }

  getRetentionPolicy() {
    const rawMonths = this.getSetting('retention_months');
    const approvedAt = this.getSetting('retention_approved_at') || '';
    const months = Number(rawMonths);
    const active = Number.isInteger(months) && months >= 1 && months <= 120 && Boolean(approvedAt);
    return {
      active,
      months: active ? months : null,
      approvedAt: active ? approvedAt : '',
      note: this.getSetting('retention_note') || ''
    };
  }

  configureRetentionPolicy(payload = {}) {
    const enabled = Boolean(payload.enabled);
    if (!enabled) {
      this.transaction(() => {
        this.deleteSetting('retention_months');
        this.deleteSetting('retention_approved_at');
        this.deleteSetting('retention_note');
        this.recordPrivacyEvent('retention_policy_disabled', '', 'Politique de conservation désactivée');
      });
      return this.getRetentionPolicy();
    }

    const months = Number(payload.months);
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      throw new Error('La durée doit être un nombre entier compris entre 1 et 120 mois.');
    }
    if (payload.confirmed !== true) {
      throw new Error('La durée ne peut être activée sans confirmation de validation par l’établissement/DPD.');
    }

    this.transaction(() => {
      this.setSetting('retention_months', String(months));
      this.setSetting('retention_approved_at', nowIso());
      this.setSetting('retention_note', text(payload.note, 500));
      this.recordPrivacyEvent('retention_policy_enabled', '', `${months} mois`);
    });
    return this.getRetentionPolicy();
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
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
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

  getSignalementByNum(num) {
    this.ensureOpen();
    return this.db.prepare('SELECT * FROM signalements WHERE num = ?').get(text(num, 40)) || null;
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
    const signalementId = idNumber(id);
    const current = this.getSignalement(signalementId);
    if (!current) throw new Error('Signalement introuvable.');

    const allowed = ['date','heure','lieu','type','gravite','signale_par','description','eleve','classe','statut'];
    const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
    if (!entries.length) return current;
    if (entries.some(([key, value]) => key === 'lieu' && !text(value, 200))) {
      throw new Error('Le lieu ne peut pas être vide.');
    }

    return this.transaction(() => {
      const columns = entries.map(([key]) => `${key} = ?`).join(', ');
      const values = entries.map(([key, value]) => text(value, key === 'description' ? 5000 : 200));
      const nextStatus = entries.find(([key]) => key === 'statut')?.[1];
      let closureSql = '';
      if (nextStatus === 'Clos' && current.statut !== 'Clos') {
        closureSql = ", closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')";
      } else if (nextStatus && nextStatus !== 'Clos' && current.statut === 'Clos') {
        closureSql = ", closed_at = ''";
      }
      this.db.prepare(`UPDATE signalements SET ${columns}${closureSql}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .run(...values, signalementId);
      return this.getSignalement(signalementId);
    });
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

  getLifecycleReview(referenceDate = new Date()) {
    this.ensureOpen();
    const policy = this.getRetentionPolicy();
    if (!policy.active) return { policy, rows: [] };
    const now = new Date(referenceDate);
    const rows = this.db.prepare(`
      SELECT id, num, date, lieu, type, statut, closed_at, identity_reduced_at,
             (SELECT count(*) FROM photos p WHERE p.signalement_id = signalements.id) AS photo_count
      FROM signalements
      WHERE statut = 'Clos' AND closed_at <> ''
      ORDER BY closed_at ASC
    `).all().map((row) => {
      const dueAt = addMonthsIso(row.closed_at, policy.months);
      const dueMs = dueAt ? new Date(dueAt).getTime() : NaN;
      const daysRemaining = Number.isFinite(dueMs) ? Math.ceil((dueMs - now.getTime()) / 86400000) : null;
      let state = 'future';
      if (daysRemaining !== null && daysRemaining <= 0) state = 'due';
      else if (daysRemaining !== null && daysRemaining <= 30) state = 'soon';
      return { ...row, due_at: dueAt || '', days_remaining: daysRemaining, lifecycle_state: state };
    });
    return { policy, rows };
  }

  reduceDirectIdentifiers(id) {
    this.ensureOpen();
    const signalementId = idNumber(id);
    const current = this.getSignalement(signalementId);
    if (!current) throw new Error('Signalement introuvable.');
    if (current.statut !== 'Clos') throw new Error('La réduction des identifiants est réservée aux dossiers clos.');
    return this.transaction(() => {
      this.db.prepare(`
        UPDATE signalements
        SET eleve = '', classe = '', famille = '', identity_reduced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(signalementId);
      this.recordPrivacyEvent('direct_identifiers_reduced', current.num, 'Identité élève/classe supprimée des champs structurés');
      return this.getSignalement(signalementId);
    });
  }

  getPurgePlan(id, confirmationNum) {
    this.ensureOpen();
    const current = this.getSignalement(idNumber(id));
    if (!current) throw new Error('Signalement introuvable.');
    if (current.statut !== 'Clos') throw new Error('Seul un dossier clos peut être supprimé définitivement.');
    if (text(confirmationNum, 40) !== current.num) throw new Error('Confirmation invalide : le numéro du dossier doit être saisi exactement.');
    const photos = this.listPhotos(current.id);
    return { id: Number(current.id), num: current.num, storedNames: photos.map((p) => p.stored_name) };
  }

  purgeSignalement(id, confirmationNum) {
    const plan = this.getPurgePlan(id, confirmationNum);
    this.transaction(() => {
      this.db.prepare('DELETE FROM reparations WHERE signalement_id = ?').run(plan.id);
      this.db.prepare('DELETE FROM photos WHERE signalement_id = ?').run(plan.id);
      this.db.prepare('DELETE FROM signalements WHERE id = ?').run(plan.id);
      this.recordPrivacyEvent('dossier_purged', plan.num, 'Dossier supprimé de la base active');
    });
    return plan;
  }

  forcePurgeByNum(num) {
    const current = this.getSignalementByNum(num);
    if (!current) return null;
    const photos = this.listPhotos(current.id);
    const plan = { id: Number(current.id), num: current.num, storedNames: photos.map((p) => p.stored_name) };
    this.transaction(() => {
      this.db.prepare('DELETE FROM reparations WHERE signalement_id = ?').run(plan.id);
      this.db.prepare('DELETE FROM photos WHERE signalement_id = ?').run(plan.id);
      this.db.prepare('DELETE FROM signalements WHERE id = ?').run(plan.id);
      this.recordPrivacyEvent('purge_reapplied_after_restore', plan.num, 'Suppression réappliquée depuis le registre de purge');
    });
    return plan;
  }

  buildAccessReview(query) {
    this.ensureOpen();
    const q = text(query, 200);
    if (q.length < 2) throw new Error('Saisissez au moins 2 caractères pour préparer une revue.');
    const like = `%${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const signalements = this.db.prepare(`
      SELECT * FROM signalements
      WHERE eleve LIKE ? ESCAPE '\\'
         OR classe LIKE ? ESCAPE '\\'
         OR signale_par LIKE ? ESCAPE '\\'
         OR description LIKE ? ESCAPE '\\'
      ORDER BY date DESC, id DESC
    `).all(like, like, like, like);

    const ids = signalements.map((row) => Number(row.id));
    let reparations = [];
    let photos = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      reparations = this.db.prepare(`SELECT * FROM reparations WHERE signalement_id IN (${placeholders}) ORDER BY id`).all(...ids);
      photos = this.db.prepare(`SELECT id, signalement_id, mime_type, size_bytes, sha256, created_at FROM photos WHERE signalement_id IN (${placeholders}) ORDER BY id`).all(...ids);
    }

    const directRepairMatches = this.db.prepare(`
      SELECT r.*, s.num AS signalement_num
      FROM reparations r JOIN signalements s ON s.id = r.signalement_id
      WHERE r.referent LIKE ? ESCAPE '\\' OR r.notes LIKE ? ESCAPE '\\' OR r.mesure LIKE ? ESCAPE '\\'
      ORDER BY r.id
    `).all(like, like, like);

    return {
      format: 1,
      generatedAt: nowIso(),
      query: q,
      reviewRequired: true,
      warning: 'Ce dossier est une aide à la revue interne. Vérifier et masquer les données de tiers avant toute communication à une personne concernée.',
      signalements,
      reparations,
      directRepairMatches,
      photos
    };
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

module.exports = { LocalDatabase, addMonthsIso };
