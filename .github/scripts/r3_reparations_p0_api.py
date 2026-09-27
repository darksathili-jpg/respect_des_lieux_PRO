from pathlib import Path


def replace_once(path, old, new):
    text = Path(path).read_text(encoding='utf-8')
    if new in text:
        return False
    if old not in text:
        raise SystemExit(f'Anchor not found in {path}')
    Path(path).write_text(text.replace(old, new, 1), encoding='utf-8')
    return True

# database.cjs — constants and validation
replace_once(
    'src/database.cjs',
    "const SIGNALEMENT_DIRECT_IDENTITY_FIELDS = Object.freeze(['eleve', 'classe', 'signale_par']);\n",
    "const SIGNALEMENT_DIRECT_IDENTITY_FIELDS = Object.freeze(['eleve', 'classe', 'signale_par']);\nconst REPARATION_STATUSES = Object.freeze(['En cours', 'Terminée', 'Annulée']);\nconst REPARATION_FIELD_LIMITS = Object.freeze({ mesure: 2000, referent: 200, debut: 10, duree: 100, notes: 5000, cloture: 10, statut: 80 });\n"
)
replace_once(
    'src/database.cjs',
    "function assertSignalementGravity(value) {\n  if (!SIGNALEMENT_GRAVITIES.includes(value)) throw new Error('Gravité invalide.');\n  return value;\n}\n",
    "function assertSignalementGravity(value) {\n  if (!SIGNALEMENT_GRAVITIES.includes(value)) throw new Error('Gravité invalide.');\n  return value;\n}\n\nfunction assertReparationStatus(value) {\n  if (!REPARATION_STATUSES.includes(value)) throw new Error(`Statut de réparation invalide : ${REPARATION_STATUSES.join(', ')} attendu.`);\n  return value;\n}\n\nfunction assertIsoDateOrEmpty(value, label) {\n  if (!value) return '';\n  try { return assertIsoDate(value); } catch { throw new Error(`${label} invalide : format AAAA-MM-JJ attendu.`); }\n}\n"
)

old_block = """  createReparation(payload = {}) {
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
"""
new_block = """  normalizeReparationPayload(payload = {}, { partial = false } = {}) {
    const allowed = ['mesure', 'referent', 'debut', 'duree', 'notes', 'cloture', 'statut'];
    const keys = Object.keys(payload || {}).filter((key) => key !== 'signalement_id');
    const unknown = keys.filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`Champ de réparation non autorisé : ${unknown.join(', ')}.`);
    const sourceKeys = partial ? keys : allowed;
    const normalized = {};
    for (const key of sourceKeys) {
      const value = key === 'statut' && !partial && !payload[key] ? 'En cours' : payload[key];
      normalized[key] = boundedText(value, REPARATION_FIELD_LIMITS[key], key === 'mesure' ? 'La mesure / action' : `Le champ ${key}`, { required: key === 'mesure' });
    }
    if (Object.hasOwn(normalized, 'debut')) assertIsoDateOrEmpty(normalized.debut, 'Date de début');
    if (Object.hasOwn(normalized, 'cloture')) assertIsoDateOrEmpty(normalized.cloture, 'Date de clôture');
    if (Object.hasOwn(normalized, 'statut')) assertReparationStatus(normalized.statut || 'En cours');
    return normalized;
  }

  getReparation(id) {
    this.ensureOpen();
    return this.db.prepare(`
      SELECT r.*, s.num AS signalement_num, s.lieu AS signalement_lieu, s.statut AS signalement_statut
      FROM reparations r JOIN signalements s ON s.id = r.signalement_id
      WHERE r.id = ?
    `).get(idNumber(id)) || null;
  }

  queryReparations(options = {}) {
    this.ensureOpen();
    const query = boundedText(options.query, 200, 'La recherche');
    const status = boundedText(options.status, 80, 'Le statut');
    if (status) assertReparationStatus(status);
    const includeIdentities = options.includeIdentities === true;
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
    const offset = Math.max(Number(options.offset) || 0, 0);
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || offset > 1000000) throw new Error('Pagination invalide.');
    const clauses = [];
    const params = [];
    if (status) { clauses.push('r.statut = ?'); params.push(status); }
    if (query) {
      const like = `%${escapeLike(query)}%`;
      const searchable = ['s.num', 's.lieu', 'r.mesure', 'r.debut', 'r.duree', 'r.statut'];
      if (includeIdentities) searchable.push('r.referent', 'r.notes');
      clauses.push(`(${searchable.map((column) => `${column} LIKE ? ESCAPE '\\\\'`).join(' OR ')})`);
      params.push(...searchable.map(() => like));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT r.*, s.num AS signalement_num, s.lieu AS signalement_lieu, s.statut AS signalement_statut
      FROM reparations r JOIN signalements s ON s.id = r.signalement_id
      ${where}
      ORDER BY r.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    const total = this.db.prepare(`SELECT count(*) AS n FROM reparations r JOIN signalements s ON s.id = r.signalement_id ${where}`).get(...params);
    return { rows, total: Number(total?.n || 0), limit, offset, query, status, includeIdentities };
  }

  createReparation(payload = {}) {
    this.ensureOpen();
    const signalementId = idNumber(payload.signalement_id);
    const signalement = this.getSignalement(signalementId);
    if (!signalement) throw new Error('Signalement introuvable.');
    if (signalement.statut === 'Clos') throw new Error('Le dossier est clos : rouvrez-le avant d’ajouter une réparation.');
    const normalized = this.normalizeReparationPayload(payload);
    const result = this.db.prepare(`
      INSERT INTO reparations(signalement_id, mesure, referent, debut, duree, notes, cloture, statut)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(signalementId, normalized.mesure, normalized.referent, normalized.debut, normalized.duree, normalized.notes, normalized.cloture, normalized.statut);
    return this.getReparation(Number(result.lastInsertRowid));
  }

  updateReparation(id, patch = {}) {
    this.ensureOpen();
    const repairId = idNumber(id);
    const current = this.getReparation(repairId);
    if (!current) throw new Error('Réparation introuvable.');
    const signalement = this.getSignalement(current.signalement_id);
    if (!signalement) throw new Error('Signalement introuvable.');
    if (signalement.statut === 'Clos') throw new Error('Le dossier est clos : rouvrez-le avant de modifier une réparation.');
    const normalized = this.normalizeReparationPayload(patch, { partial: true });
    const entries = Object.entries(normalized);
    if (!entries.length) return current;
    this.db.prepare(`UPDATE reparations SET ${entries.map(([key]) => `${key} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(...entries.map(([, value]) => value), repairId);
    return this.getReparation(repairId);
  }

  listReparations(limit = 1000) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const rows = [];
    for (let offset = 0; rows.length < safeLimit; offset += 200) {
      const page = this.queryReparations({ limit: Math.min(200, safeLimit - rows.length), offset, includeIdentities: true });
      rows.push(...page.rows);
      if (rows.length >= page.total || !page.rows.length) break;
    }
    return rows;
  }
"""
replace_once('src/database.cjs', old_block, new_block)

# main IPC
replace_once(
    'main.cjs',
    "  secureHandle('rdl:reparations:list', (limit = 1000) => db.listReparations(limit));\n  secureHandle('rdl:reparations:create', (payload) => db.createReparation(payload));\n",
    "  secureHandle('rdl:reparations:list', (limit = 1000) => db.listReparations(limit));\n  secureHandle('rdl:reparations:query', (options = {}) => db.queryReparations(options));\n  secureHandle('rdl:reparations:get', (id) => db.getReparation(id));\n  secureHandle('rdl:reparations:create', (payload) => db.createReparation(payload));\n  secureHandle('rdl:reparations:update', (id, patch) => db.updateReparation(id, patch));\n"
)

# preload contract
replace_once(
    'preload.cjs',
    "  listReparations: (limit) => ipcRenderer.invoke('rdl:reparations:list', limit),\n  createReparation: (payload) => ipcRenderer.invoke('rdl:reparations:create', payload),\n  updateReparation: (id, payload) => ipcRenderer.invoke('rdl:reparations:create', { ...payload, _repair_id: id }),\n",
    "  listReparations: (limit) => ipcRenderer.invoke('rdl:reparations:list', limit),\n  queryReparations: (options) => ipcRenderer.invoke('rdl:reparations:query', options),\n  getReparation: (id) => ipcRenderer.invoke('rdl:reparations:get', id),\n  createReparation: (payload) => ipcRenderer.invoke('rdl:reparations:create', payload),\n  updateReparation: (id, payload) => ipcRenderer.invoke('rdl:reparations:update', id, payload),\n"
)

# renderer targeted edit lookup
replace_once(
    'renderer/detail.js',
    "      const rows = await window.rdl.listReparations(1000);\n      const repair = rows.find((row) => Number(row.id) === repairId);\n      if (!repair) throw new Error('Réparation introuvable.');\n",
    "      const repair = await window.rdl.getReparation(repairId);\n      if (!repair) throw new Error('Réparation introuvable.');\n"
)

# stop loading the monkey patch in production
replace_once(
    'main-entry.cjs',
    "require('./src/reparation-edit-extension.cjs');\n",
    ""
)

print('R3-P2 repair API foundation patched')
