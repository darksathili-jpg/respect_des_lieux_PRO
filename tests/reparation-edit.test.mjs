import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../src/database.cjs');
const { ReparationDomain } = require('../src/reparation-domain.cjs');

function fixture(prefix = 'rdl-repair-domain-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = new LocalDatabase(path.join(root, 'db.sqlite3')).init();
  const repairs = new ReparationDomain(db);
  return { root, db, repairs };
}

function cleanup(ctx) {
  ctx.db.close();
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

test('une réparation existante peut être modifiée sans créer de doublon', () => {
  const ctx = fixture();
  try {
    const signalement = ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Salle test', type: 'test' });
    const repair = ctx.repairs.createReparation({
      signalement_id: signalement.id,
      mesure: 'Mesure initiale',
      referent: 'Référent A',
      debut: '2026-09-25',
      duree: '1 heure',
      notes: 'Note initiale',
      statut: 'En cours'
    });

    const updated = ctx.repairs.updateReparation(repair.id, {
      mesure: 'Mesure corrigée',
      referent: 'Référent B',
      debut: '2026-09-26',
      duree: '2 heures',
      notes: 'Note corrigée'
    });

    assert.equal(updated.id, repair.id);
    assert.equal(updated.mesure, 'Mesure corrigée');
    assert.equal(updated.referent, 'Référent B');
    assert.equal(updated.debut, '2026-09-26');
    assert.equal(updated.duree, '2 heures');
    assert.equal(updated.notes, 'Note corrigée');
    assert.equal(updated.statut, 'En cours');

    const rows = ctx.repairs.queryReparations({ limit: 100, includeIdentities: true }).rows;
    assert.equal(rows.length, 1, 'l’édition ne doit jamais dupliquer la réparation');
    assert.equal(rows[0].mesure, 'Mesure corrigée');
  } finally {
    cleanup(ctx);
  }
});

test('une édition avec identifiant inconnu est refusée', () => {
  const ctx = fixture('rdl-repair-domain-missing-');
  try {
    assert.throws(
      () => ctx.repairs.updateReparation(999, { mesure: 'X' }),
      /Réparation introuvable/
    );
  } finally {
    cleanup(ctx);
  }
});

test('le statut passe par une transition dédiée et date les états terminaux', () => {
  const ctx = fixture('rdl-repair-domain-status-');
  try {
    const signalement = ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Salle statut' });
    const repair = ctx.repairs.createReparation({ signalement_id: signalement.id, mesure: 'Intervention' });

    assert.throws(() => ctx.repairs.updateReparation(repair.id, { statut: 'Terminée' }), /statut.*séparément|transition dédiée/i);
    const done = ctx.repairs.setReparationStatus(repair.id, 'Terminée');
    assert.match(done.cloture, /^\d{4}-\d{2}-\d{2}$/);
    const reopened = ctx.repairs.setReparationStatus(repair.id, 'En cours');
    assert.equal(reopened.cloture, '');
  } finally {
    cleanup(ctx);
  }
});

test('un dossier clos interdit toute mutation de ses réparations', () => {
  const ctx = fixture('rdl-repair-domain-closed-');
  try {
    const signalement = ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Salle close' });
    const repair = ctx.repairs.createReparation({ signalement_id: signalement.id, mesure: 'Avant clôture' });
    ctx.db.setSignalementStatus(signalement.id, 'Clos');

    assert.throws(() => ctx.repairs.createReparation({ signalement_id: signalement.id, mesure: 'Nouvelle' }), /clos|rouvr/i);
    assert.throws(() => ctx.repairs.updateReparation(repair.id, { mesure: 'Modification' }), /clos|rouvr/i);
    assert.throws(() => ctx.repairs.setReparationStatus(repair.id, 'Terminée'), /clos|rouvr/i);
  } finally {
    cleanup(ctx);
  }
});
