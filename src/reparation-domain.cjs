const REPARATION_STATUSES = Object.freeze(['En cours', 'Terminée', 'Annulée']);
const REPARATION_TERMINAL_STATUSES = new Set(['Terminée', 'Annulée']);
const REPARATION_FIELD_LIMITS = Object.freeze({
  mesure: 2000,
  referent: 200,
  debut: 10,
  duree: 100,
  notes: 5000,
  cloture: 10,
  statut: 80
});

function idNumber(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Identifiant de réparation invalide.');
  return n;
}

function boundedText(value, max, label, { required = false } = {}) {
  const raw = String(value ?? '').trim();
  if (raw.length > max) throw new Error(`${label} trop long : ${max} caractères maximum.`);
  if (required && !raw) throw new Error(`${label} est obligatoire.`);
  return raw;
}

function assertIsoDateOrEmpty(value, label) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} invalide : format AAAA-MM-JJ attendu.`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} calendrier invalide.`);
  }
  return value;
}

function assertStatus(value) {
  if (!REPARATION_STATUSES.includes(value)) {
    throw new Error(`Statut de réparation invalide : ${REPARATION_STATUSES.join(', ')} attendu.`);
  }
  return value;
}

function escapeLike(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

class ReparationDomain {
  constructor(database) {
    if (!database || !database.db) throw new Error('Base locale Réparations non initialisée.');
    this.database = database;
  }

  ensureParentOpen(signalementId) {
    const signalement = this.database.getSignalement(signalementId);
    if (!signalement) throw new Error('Signalement introuvable.');
    if (signalement.statut === 'Clos') {
      throw new Error('Le dossier est clos : rouvrez-le avant toute modification de réparation.');
    }
    return signalement;
  }

  _getReparationRaw(id) {
    const repairId = idNumber(id);
    return this.database.db.prepare(`
      SELECT r.*, s.num AS signalement_num, s.lieu AS signalement_lieu, s.statut AS signalement_statut
      FROM reparations r
      JOIN signalements s ON s.id = r.signalement_id
      WHERE r.id = ?
    `).get(repairId) || null;
  }

  getReparation(id, options = {}) {
    const repair = this._getReparationRaw(id);
    if (!repair) return null;
    if (options.includeIdentities === true) return repair;
    return { ...repair, referent: '' };
  }

  queryReparations(options = {}) {
    const query = boundedText(options.query, 200, 'La recherche');
    const includeIdentities = options.includeIdentities === true;
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
    const offset = Math.max(Number(options.offset) || 0, 0);
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || offset > 1000000) {
      throw new Error('Pagination Réparations invalide.');
    }

    let where = '';
    let params = [];
    if (query) {
      const like = `%${escapeLike(query)}%`;
      const searchable = [
        's.num', 's.lieu', 'r.mesure', 'r.debut', 'r.duree', 'r.cloture', 'r.statut'
      ];
      if (includeIdentities) searchable.push('r.referent');
      where = `WHERE (${searchable.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(' OR ')})`;
      params = searchable.map(() => like);
    }

    const referentSelect = includeIdentities ? 'r.referent' : "'' AS referent";
    const rows = this.database.db.prepare(`
      SELECT r.id, r.signalement_id, r.mesure, ${referentSelect}, r.debut, r.duree,
             r.notes, r.cloture, r.statut, r.created_at, r.updated_at,
             s.num AS signalement_num, s.lieu AS signalement_lieu, s.statut AS signalement_statut
      FROM reparations r
      JOIN signalements s ON s.id = r.signalement_id
      ${where}
      ORDER BY r.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    const total = this.database.db.prepare(`
      SELECT count(*) AS n
      FROM reparations r
      JOIN signalements s ON s.id = r.signalement_id
      ${where}
    `).get(...params);

    return { rows, total: Number(total?.n || 0), limit, offset, query, includeIdentities };
  }

  createReparation(payload = {}) {
    const signalementId = idNumber(payload.signalement_id);
    const signalement = this.ensureParentOpen(signalementId);
    const mesure = boundedText(payload.mesure, REPARATION_FIELD_LIMITS.mesure, 'La mesure / action', { required: true });
    const referent = boundedText(payload.referent, REPARATION_FIELD_LIMITS.referent, 'Le référent');
    const debut = assertIsoDateOrEmpty(
      boundedText(payload.debut, REPARATION_FIELD_LIMITS.debut, 'La date de début'),
      'La date de début'
    );
    const duree = boundedText(payload.duree, REPARATION_FIELD_LIMITS.duree, 'La durée');
    const notes = boundedText(payload.notes, REPARATION_FIELD_LIMITS.notes, 'Les notes');
    const statut = assertStatus(
      boundedText(payload.statut || 'En cours', REPARATION_FIELD_LIMITS.statut, 'Le statut', { required: true })
    );
    let cloture = assertIsoDateOrEmpty(
      boundedText(payload.cloture, REPARATION_FIELD_LIMITS.cloture, 'La date de clôture'),
      'La date de clôture'
    );
    if (REPARATION_TERMINAL_STATUSES.has(statut)) cloture ||= todayIso();
    else if (cloture) throw new Error('Une réparation En cours ne peut pas porter de date de clôture.');

    return this.database.transaction(() => {
      const result = this.database.db.prepare(`
        INSERT INTO reparations(signalement_id, mesure, referent, debut, duree, notes, cloture, statut)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `).run(signalementId, mesure, referent, debut, duree, notes, cloture, statut);
      const repair = this._getReparationRaw(Number(result.lastInsertRowid));
      this.database.recordSignalementEvent(
        signalementId,
        signalement.num,
        'repair_created',
        `Réparation ${repair.id} créée · statut ${repair.statut}`
      );
      return repair;
    });
  }

  updateReparation(id, patch = {}) {
    const repairId = idNumber(id);
    const current = this._getReparationRaw(repairId);
    if (!current) throw new Error('Réparation introuvable.');
    const signalement = this.ensureParentOpen(current.signalement_id);

    const keys = Object.keys(patch || {});
    const forbidden = keys.filter((key) => ['signalement_id', 'statut', 'cloture', 'id'].includes(key));
    if (forbidden.length) {
      if (forbidden.includes('statut')) throw new Error('Le statut doit être modifié séparément via une transition dédiée.');
      throw new Error(`Champ de modification Réparations non autorisé : ${forbidden.join(', ')}.`);
    }
    const allowed = ['mesure', 'referent', 'debut', 'duree', 'notes'];
    const unknown = keys.filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`Champ de modification Réparations non autorisé : ${unknown.join(', ')}.`);
    if (!keys.length) return current;

    const labels = {
      mesure: 'La mesure / action',
      referent: 'Le référent',
      debut: 'La date de début',
      duree: 'La durée',
      notes: 'Les notes'
    };
    const normalized = {};
    for (const key of keys) {
      normalized[key] = boundedText(
        patch[key],
        REPARATION_FIELD_LIMITS[key],
        labels[key],
        { required: key === 'mesure' }
      );
    }
    if (Object.hasOwn(normalized, 'debut')) normalized.debut = assertIsoDateOrEmpty(normalized.debut, 'La date de début');

    return this.database.transaction(() => {
      const entries = Object.entries(normalized);
      const columns = entries.map(([key]) => `${key} = ?`).join(', ');
      this.database.db.prepare(`
        UPDATE reparations
        SET ${columns}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(...entries.map(([, value]) => value), repairId);
      this.database.recordSignalementEvent(
        current.signalement_id,
        signalement.num,
        'repair_updated',
        `Réparation ${repairId} · champs modifiés : ${entries.map(([key]) => key).join(', ')}`
      );
      return this._getReparationRaw(repairId);
    });
  }

  setReparationStatus(id, status) {
    const repairId = idNumber(id);
    const current = this._getReparationRaw(repairId);
    if (!current) throw new Error('Réparation introuvable.');
    const signalement = this.ensureParentOpen(current.signalement_id);
    const nextStatus = assertStatus(
      boundedText(status, REPARATION_FIELD_LIMITS.statut, 'Le statut', { required: true })
    );
    if (current.statut === nextStatus) return current;
    const cloture = REPARATION_TERMINAL_STATUSES.has(nextStatus) ? todayIso() : '';

    return this.database.transaction(() => {
      this.database.db.prepare(`
        UPDATE reparations
        SET statut = ?, cloture = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(nextStatus, cloture, repairId);
      this.database.recordSignalementEvent(
        current.signalement_id,
        signalement.num,
        'repair_status_changed',
        `Réparation ${repairId} · ${current.statut} → ${nextStatus}`
      );
      return this._getReparationRaw(repairId);
    });
  }
}

module.exports = {
  ReparationDomain,
  REPARATION_STATUSES,
  REPARATION_FIELD_LIMITS
};
