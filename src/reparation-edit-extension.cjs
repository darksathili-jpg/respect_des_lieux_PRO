const { LocalDatabase } = require('./database.cjs');

const originalCreateReparation = LocalDatabase.prototype.createReparation;
const text = (value, max = 5000) => String(value ?? '').trim().slice(0, max);

if (!LocalDatabase.prototype.__rdlRepairEditingInstalled) {
  Object.defineProperty(LocalDatabase.prototype, '__rdlRepairEditingInstalled', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  LocalDatabase.prototype.createReparation = function createOrUpdateReparation(payload = {}) {
    const rawEditId = payload._repair_id;
    if (rawEditId === undefined || rawEditId === null || rawEditId === '') {
      return originalCreateReparation.call(this, payload);
    }

    this.ensureOpen();
    const repairId = Number(rawEditId);
    if (!Number.isSafeInteger(repairId) || repairId <= 0) {
      throw new Error('Identifiant de réparation invalide.');
    }

    const current = this.db.prepare('SELECT * FROM reparations WHERE id = ?').get(repairId);
    if (!current) throw new Error('Réparation introuvable.');

    const mesure = text(payload.mesure, 2000);
    if (!mesure) throw new Error('La mesure / action est obligatoire.');

    const has = (key) => Object.prototype.hasOwnProperty.call(payload, key);
    const values = {
      mesure,
      referent: has('referent') ? text(payload.referent, 200) : current.referent,
      debut: has('debut') ? text(payload.debut, 30) : current.debut,
      duree: has('duree') ? text(payload.duree, 100) : current.duree,
      notes: has('notes') ? text(payload.notes, 5000) : current.notes,
      cloture: has('cloture') ? text(payload.cloture, 30) : current.cloture,
      statut: text(payload.statut, 80) || current.statut || 'En cours'
    };

    this.db.prepare(`
      UPDATE reparations
      SET mesure = ?, referent = ?, debut = ?, duree = ?, notes = ?, cloture = ?, statut = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(
      values.mesure,
      values.referent,
      values.debut,
      values.duree,
      values.notes,
      values.cloture,
      values.statut,
      repairId
    );

    return this.db.prepare('SELECT * FROM reparations WHERE id = ?').get(repairId);
  };
}

module.exports = { repairEditingInstalled: true };
