import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../src/reparation-edit-extension.cjs');
const { LocalDatabase } = require('../src/database.cjs');

test('une réparation existante peut être modifiée sans créer de doublon', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-repair-edit-'));
  const dbPath = path.join(root, 'db.sqlite3');
  const db = new LocalDatabase(dbPath).init();
  try {
    const signalement = db.createSignalement({ date: '2026-09-25', lieu: 'Salle test', type: 'test' });
    const repair = db.createReparation({
      signalement_id: signalement.id,
      mesure: 'Mesure initiale',
      referent: 'Référent A',
      debut: '2026-09-25',
      duree: '1 heure',
      notes: 'Note initiale',
      statut: 'En cours'
    });

    const updated = db.createReparation({
      _repair_id: repair.id,
      signalement_id: signalement.id,
      mesure: 'Mesure corrigée',
      referent: 'Référent B',
      debut: '2026-09-26',
      duree: '2 heures',
      notes: 'Note corrigée',
      statut: 'Terminée'
    });

    assert.equal(updated.id, repair.id);
    assert.equal(updated.mesure, 'Mesure corrigée');
    assert.equal(updated.referent, 'Référent B');
    assert.equal(updated.debut, '2026-09-26');
    assert.equal(updated.duree, '2 heures');
    assert.equal(updated.notes, 'Note corrigée');
    assert.equal(updated.statut, 'Terminée');

    const rows = db.listReparations(100);
    assert.equal(rows.length, 1, 'l’édition ne doit jamais dupliquer la réparation');
    assert.equal(rows[0].mesure, 'Mesure corrigée');
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('une édition avec identifiant inconnu est refusée', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-repair-edit-missing-'));
  const db = new LocalDatabase(path.join(root, 'db.sqlite3')).init();
  try {
    assert.throws(
      () => db.createReparation({ _repair_id: 999, mesure: 'X' }),
      /Réparation introuvable/
    );
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
