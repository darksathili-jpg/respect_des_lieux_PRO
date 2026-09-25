const { DatabaseSync, backup } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const SIGNALEMENT_STATUSES = Object.freeze(['Ouvert', 'Clos']);
const SIGNALEMENT_GRAVITIES = Object.freeze(['', 'Mineure', 'Modérée', 'Importante', 'Critique']);
const SIGNALEMENT_DIRECT_IDENTITY_FIELDS = Object.freeze(['eleve', 'classe', 'signale_par']);
const SIGNAL_FIELD_LIMITS = Object.freeze({
  date: 10,
  heure: 8,
  lieu: 200,
  type: 120,
  gravite: 80,
  signale_par: 200,
  description: 5000,
  eleve: 200,
  classe: 100,
  statut: 80
});

const text = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
const idNumber = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Identifiant invalide.');
  return n;
};
const nowIso = () => new Date().toISOString();

function boundedText(value, max, label, { required = false } = {}) {
  const raw = String(value ?? '').trim();
  if (raw.length > max) throw new Error(`${label} trop long : ${max} caractères maximum.`);
  if (required && !raw) throw new Error(`${label} est obligatoire.`);
  return raw;
}

function assertIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date invalide : format AAAA-MM-JJ attendu.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Date calendrier invalide.');
  }
  return value;
}

function assertTimeOrEmpty(value) {
  if (!value) return '';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new Error('Heure invalide : format HH:MM attendu.');
  }
  return value;
}

function assertSignalementStatus(value) {
  if (!SIGNALEMENT_STATUSES.includes(value)) throw new Error(`Statut invalide : ${SIGNALEMENT_STATUSES.join(' ou ')} attendu.`);
  return value;
}

function assertSignalementGravity(value) {
  if (!SIGNALEMENT_GRAVITIES.includes(value)) throw new Error('Gravité invalide.');
  return value;
}

function escapeLike(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

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

      CREATE TABLE IF NOT EXISTS signalement_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signalement_id INTEGER,
        dossier_num TEXT NOT NULL DEFAULT '',
        event_type TEXT NOT NULL,
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
      CREATE INDEX IF NOT EXISTS idx_signalement_events_signalement ON signalement_events(signalement_id, id DESC);
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
      INSERT INTO schema_meta(key, value) VALUES('schema_version', '3')
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

  recordSignalementEvent(signalementId, dossierNum, eventType, detail = '') {
    this.ensureOpen();
    this.db.prepare('INSERT INTO signalement_events(signalement_id, dossier_num, event_type, detail) VALUES(?, ?, ?, ?)')
      .run(signalementId ? idNumber(signalementId) : null, text(dossierNum, 40), text(eventType, 100), text(detail, 500));
  }

  listSignalementEvents(signalementId, limit = 100) {
    this.ensureOpen();
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    return this.db.prepare('SELECT * FROM signalement_events WHERE signalement_id = ? ORDER BY id DESC LIMIT ?')
      .all(idNumber(signalementId), safeLimit);
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
    const date = boundedText(payload.date || new Date().toISOString().slice(0, 10), SIGNAL_FIELD_LIMITS.date, 'La date', { required: true });
    assertIsoDate(date);
    const heure = boundedText(payload.heure, SIGNAL_FIELD_LIMITS.heure, 'L’heure');
    assertTimeOrEmpty(heure);
    const lieu = boundedText(payload.lieu, SIGNAL_FIELD_LIMITS.lieu, 'Le lieu', { required: true });
    const type = boundedText(payload.type, SIGNAL_FIELD_LIMITS.type, 'Le type');
    const gravite = boundedText(payload.gravite, SIGNAL_FIELD_LIMITS.gravite, 'La gravité');
    assertSignalementGravity(gravite);
    const signalePar = boundedText(payload.signale_par, SIGNAL_FIELD_LIMITS.signale_par, 'Le champ « Signalé par »');
    const description = boundedText(payload.description, SIGNAL_FIELD_LIMITS.description, 'La description');
    const eleve = boundedText(payload.eleve, SIGNAL_FIELD_LIMITS.eleve, 'Le champ « Élève »');
    const classe = boundedText(payload.classe, SIGNAL_FIELD_LIMITS.classe, 'Le champ « Classe »');
    const statut = boundedText(payload.statut || 'Ouvert', SIGNAL_FIELD_LIMITS.statut, 'Le statut', { required: true });
    assertSignalementStatus(statut);
    const year = Number(date.slice(0, 4));

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
      `).run(num, date, heure, lieu, type, gravite, signalePar, description, eleve, classe, statut);
      const id = Number(result.lastInsertRowid);
      this.recordSignalementEvent(id, num, 'created', 'Signalement créé');
      return this.getSignalement(id);
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
    return this.db.prepare('SELECT * FROM signalements WHERE num = ?').get(boundedText(num, 40, 'Le numéro de dossier')) || null;
  }

  querySignalements(options = {}) {
    this.ensureOpen();
    const query = boundedText(options.query, 200, 'La recherche');
    const includeIdentities = options.includeIdentities === true;
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
    const offset = Math.max(Number(options.offset) || 0, 0);
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || offset > 1000000) {
      throw new Error('Pagination invalide.');
    }

    let where = '';
    let params = [];
    if (query) {
      const like = `%${escapeLike(query)}%`;
      const searchable = ['s.num', 's.date', 's.heure', 's.lieu', 's.type', 's.gravite', 's.statut'];
      if (includeIdentities) searchable.push('s.eleve', 's.classe', 's.signale_par', 's.description');
      where = `WHERE (${searchable.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(' OR ')})`;
      params = searchable.map(() => like);
    }

    const rows = this.db.prepare(`
      SELECT s.*,
             (SELECT count(*) FROM photos p WHERE p.signalement_id = s.id) AS photo_count,
             (SELECT count(*) FROM reparations r WHERE r.signalement_id = s.id) AS reparation_count
      FROM signalements s
      ${where}
      ORDER BY s.date DESC, s.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    const total = this.db.prepare(`SELECT count(*) AS n FROM signalements s ${where}`).get(...params);
    return { rows, total: Number(total?.n || 0), limit, offset, query, includeIdentities };
  }

  listSignalements(limit = 500) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return this.querySignalements({ limit: Math.min(safeLimit, 200), offset: 0, includeIdentities: true }).rows;
  }

  getSignalementDetail(id) {
    this.ensureOpen();
    const signalementId = idNumber(id);
    const signalement = this.getSignalement(signalementId);
    if (!signalement) throw new Error('Signalement introuvable.');
    const reparations = this.db.prepare(`
      SELECT r.*, s.num AS signalement_num, s.lieu AS signalement_lieu
      FROM reparations r JOIN signalements s ON s.id = r.signalement_id
      WHERE r.signalement_id = ? ORDER BY r.id DESC
    `).all(signalementId);
    const photos = this.listPhotos(signalementId);
    const events = this.listSignalementEvents(signalementId, 100);
    return { signalement, reparations, photos, events };
  }

  updateSignalement(id, patch = {}) {
    this.ensureOpen();
    const signalementId = idNumber(id);
    const current = this.getSignalement(signalementId);
    if (!current) throw new Error('Signalement introuvable.');

    const keys = Object.keys(patch || {});
    if (keys.includes('statut')) {
      if (keys.length !== 1) throw new Error('Le statut doit être modifié séparément des données métier.');
      return this.setSignalementStatus(signalementId, patch.statut);
    }
    if (current.statut === 'Clos') throw new Error('Le dossier est clos : rouvrez-le avant toute modification métier.');

    const allowed = ['date', 'heure', 'lieu', 'type', 'gravite', 'signale_par', 'description', 'eleve', 'classe'];
    const unknown = keys.filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`Champ de modification non autorisé : ${unknown.join(', ')}.`);
    if (!keys.length) return current;

    const normalized = {};
    for (const key of keys) {
      const max = SIGNAL_FIELD_LIMITS[key];
      const labels = { date: 'La date', heure: 'L’heure', lieu: 'Le lieu', type: 'Le type', gravite: 'La gravité', signale_par: 'Le champ « Signalé par »', description: 'La description', eleve: 'Le champ « Élève »', classe: 'Le champ « Classe »' };
      normalized[key] = boundedText(patch[key], max, labels[key], { required: key === 'lieu' });
    }
    if (Object.hasOwn(normalized, 'date')) assertIsoDate(normalized.date);
    if (Object.hasOwn(normalized, 'heure')) assertTimeOrEmpty(normalized.heure);
    if (Object.hasOwn(normalized, 'gravite')) assertSignalementGravity(normalized.gravite);

    if (current.identity_reduced_at) {
      const reintroduced = SIGNALEMENT_DIRECT_IDENTITY_FIELDS.filter((field) => Object.hasOwn(normalized, field) && normalized[field]);
      if (reintroduced.length) {
        throw new Error('Identité réduite : réintroduction silencieuse interdite. Créez un nouveau besoin de traitement documenté si une identité redevient nécessaire.');
      }
    }

    return this.transaction(() => {
      const entries = Object.entries(normalized);
      const columns = entries.map(([key]) => `${key} = ?`).join(', ');
      this.db.prepare(`UPDATE signalements SET ${columns}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .run(...entries.map(([, value]) => value), signalementId);
      this.recordSignalementEvent(signalementId, current.num, 'updated', `Champs modifiés : ${entries.map(([key]) => key).join(', ')}`);
      return this.getSignalement(signalementId);
    });
  }

  setSignalementStatus(id, status) {
    this.ensureOpen();
    const signalementId = idNumber(id);
    const current = this.getSignalement(signalementId);
    if (!current) throw new Error('Signalement introuvable.');
    const nextStatus = boundedText(status, SIGNAL_FIELD_LIMITS.statut, 'Le statut', { required: true });
    assertSignalementStatus(nextStatus);
    if (current.statut === nextStatus) return current;

    return this.transaction(() => {
      if (nextStatus === 'Clos') {
        this.db.prepare(`
          UPDATE signalements
          SET statut = 'Clos', closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(signalementId);
        this.recordSignalementEvent(signalementId, current.num, 'closed', 'Dossier clos');
      } else {
        this.db.prepare(`
          UPDATE signalements
          SET statut = 'Ouvert', closed_at = '', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(signalementId);
        this.recordSignalementEvent(signalementId, current.num, 'reopened', 'Dossier rouvert');
      }
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
    const signalementId = idNumber(payload.signalement_id);
    const result = this.db.prepare(`
      INSERT INTO photos(signalement_id, original_name, stored_name, mime_type, size_bytes, sha256)
      VALUES(?, ?, ?, 'image/jpeg', ?, ?)
    `).run(
      signalementId,
      text(payload.original_name, 300),
      text(payload.stored_name, 300),
      Number(payload.size_bytes),
      text(payload.sha256, 64)
    );
    const photo = this.getPhoto(Number(result.lastInsertRowid));
    const signalement = this.getSignalement(signalementId);
    if (signalement) this.recordSignalementEvent(signalementId, signalement.num, 'photo_attached', 'Photo JPEG assainie ajoutée');
    return photo;
  }

  getPhoto(id) {
    this.ensureOpen();
    return this.db.prepare('SELECT * FROM photos WHERE id = ?').get(idNumber(id)) || null;
  }

  listPhotos(signalementId) {
    this.ensureOpen();
    return this.db.prepare('SELECT * FROM photos WHERE signalement_id = ? ORDER BY id DESC').all(idNumber(signalementId));
  }

  deletePhotoMetadata(id) {
    this.ensureOpen();
    const photoId = idNumber(id);
    const photo = this.getPhoto(photoId);
    if (!photo) throw new Error('Photo introuvable.');
    const signalement = this.getSignalement(photo.signalement_id);
    this.db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
    if (signalement) this.recordSignalementEvent(signalement.id, signalement.num, 'photo_removed', 'Photo retirée du dossier');
    return photo;
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
        SET eleve = '', classe = '', signale_par = '', famille = '', identity_reduced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(signalementId);
      this.recordPrivacyEvent('direct_identifiers_reduced', current.num, 'Élève, classe et signalé par supprimés des champs structurés');
      this.recordSignalementEvent(signalementId, current.num, 'identities_reduced', 'Identifiants directs structurés réduits');
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

module.exports = {
  LocalDatabase,
  addMonthsIso,
  SIGNALEMENT_STATUSES,
  SIGNALEMENT_GRAVITIES,
  SIGNALEMENT_DIRECT_IDENTITY_FIELDS
};
