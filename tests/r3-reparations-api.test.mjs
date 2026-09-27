import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalDatabase } = require('../src/database.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-r3-repairs-'));
  const db = new LocalDatabase(path.join(root, 'db.sqlite3')).init();
  const signalement = db.createSignalement({ date: '2026-09-27', lieu: 'Salle R3', type: 'Dégradation' });
  return { root, db, signalement };
}

function cleanup(ctx) {
  ctx.db.close();
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

test('R3-P2 expose create/get/update distincts sans duplication', () => {
  const ctx = fixture();
  try {
    const created = ctx.db.createReparation({
      signalement_id: ctx.signalement.id,
      mesure: 'Remplacer la poignée',
      referent: 'Agent A',
      debut: '2026-09-27',
      statut: 'En cours'
    });
    assert.ok(created.id > 0);
    assert.equal(ctx.db.getReparation(created.id).mesure, 'Remplacer la poignée');

    const updated = ctx.db.updateReparation(created.id, {
      mesure: 'Poignée remplacée',
      statut: 'Terminée',
      cloture: '2026-09-28'
    });
    assert.equal(updated.id, created.id);
    assert.equal(updated.mesure, 'Poignée remplacée');
    assert.equal(updated.statut, 'Terminée');
    assert.equal(ctx.db.queryReparations({ limit: 20 }).total, 1);
  } finally { cleanup(ctx); }
});

test('R3-P2 refuse statuts et dates invalides', () => {
  const ctx = fixture();
  try {
    assert.throws(() => ctx.db.createReparation({ signalement_id: ctx.signalement.id, mesure: 'X', statut: 'N’importe quoi' }), /Statut de réparation invalide/);
    assert.throws(() => ctx.db.createReparation({ signalement_id: ctx.signalement.id, mesure: 'X', debut: '27-09-2026' }), /Date de début invalide/);
  } finally { cleanup(ctx); }
});

test('R3-P2 refuse création et modification sur dossier clos', () => {
  const ctx = fixture();
  try {
    const repair = ctx.db.createReparation({ signalement_id: ctx.signalement.id, mesure: 'Mesure initiale' });
    ctx.db.setSignalementStatus(ctx.signalement.id, 'Clos');
    assert.throws(() => ctx.db.createReparation({ signalement_id: ctx.signalement.id, mesure: 'Interdit' }), /dossier est clos/);
    assert.throws(() => ctx.db.updateReparation(repair.id, { mesure: 'Interdit' }), /dossier est clos/);
  } finally { cleanup(ctx); }
});

test('R3-P2 requête paginée retrouve une réparation au-delà de la première page', () => {
  const ctx = fixture();
  try {
    for (let i = 0; i < 230; i += 1) ctx.db.createReparation({ signalement_id: ctx.signalement.id, mesure: `Mesure ${i}` });
    const page = ctx.db.queryReparations({ query: 'Mesure 5', limit: 50, offset: 0 });
    assert.ok(page.total >= 1);
    assert.ok(page.rows.some((row) => row.mesure.includes('Mesure 5')));
    const second = ctx.db.queryReparations({ limit: 50, offset: 200 });
    assert.equal(second.rows.length, 30);
  } finally { cleanup(ctx); }
});
