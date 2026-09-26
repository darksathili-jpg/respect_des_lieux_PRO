import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  LocalDatabase,
  SIGNALEMENT_STATUSES,
  SIGNALEMENT_GRAVITIES,
  SIGNALEMENT_DIRECT_IDENTITY_FIELDS
} = require('../src/database.cjs');
const { LocalPhotoStore } = require('../src/storage.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-r3-signalements-'));
  const db = new LocalDatabase(path.join(root, 'data', 'r3.sqlite3'));
  db.init();
  const photos = new LocalPhotoStore(path.join(root, 'photos'));
  return { root, db, photos };
}

function cleanup(ctx) {
  try { ctx.db.close(); } catch {}
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

function tinyJpeg(marker = 1) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, marker & 0xff, 0x22, 0x33, 0xff, 0xd9]);
}

test('R3 : contrat domaine centralisé pour statuts, gravités et identifiants directs', () => {
  assert.deepEqual(SIGNALEMENT_STATUSES, ['Ouvert', 'Clos']);
  assert.deepEqual(SIGNALEMENT_GRAVITIES, ['', 'Mineure', 'Modérée', 'Importante', 'Critique']);
  assert.deepEqual(SIGNALEMENT_DIRECT_IDENTITY_FIELDS, ['eleve', 'classe', 'signale_par']);
});

test('R3 : création rejette les valeurs hors contrat au lieu de les tronquer ou accepter', () => {
  const ctx = fixture();
  try {
    assert.throws(() => ctx.db.createSignalement({ date: '2026-02-31', lieu: 'Hall' }), /date/i);
    assert.throws(() => ctx.db.createSignalement({ date: '2026-09-25', heure: '29:99', lieu: 'Hall' }), /heure/i);
    assert.throws(() => ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Hall', gravite: 'Extrême' }), /gravit/i);
    assert.throws(() => ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Hall', statut: 'Archivé' }), /statut/i);
    assert.throws(() => ctx.db.createSignalement({ date: '2026-09-25', lieu: 'X'.repeat(201) }), /lieu|200|long/i);
    assert.equal(ctx.db.getStats().signalements, 0);
  } finally {
    cleanup(ctx);
  }
});

test('R3 : dossier ouvert modifiable, dossier clos verrouillé puis explicitement rouvrable', () => {
  const ctx = fixture();
  try {
    const created = ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Salle A', gravite: 'Mineure' });
    const updated = ctx.db.updateSignalement(created.id, { lieu: 'Salle B', description: 'Constat corrigé' });
    assert.equal(updated.lieu, 'Salle B');
    assert.equal(updated.description, 'Constat corrigé');

    const closed = ctx.db.setSignalementStatus(created.id, 'Clos');
    assert.equal(closed.statut, 'Clos');
    assert.match(closed.closed_at, /^\d{4}-/);
    assert.throws(() => ctx.db.updateSignalement(created.id, { lieu: 'Interdit' }), /clos|rouvr/i);

    const reopened = ctx.db.setSignalementStatus(created.id, 'Ouvert');
    assert.equal(reopened.statut, 'Ouvert');
    assert.equal(reopened.closed_at, '');
    const editedAgain = ctx.db.updateSignalement(created.id, { lieu: 'Salle C' });
    assert.equal(editedAgain.lieu, 'Salle C');
  } finally {
    cleanup(ctx);
  }
});

test('R3 : réduction des identifiants ne peut pas être silencieusement annulée après réouverture', () => {
  const ctx = fixture();
  try {
    const created = ctx.db.createSignalement({
      date: '2026-09-25',
      lieu: 'Salle identité',
      eleve: 'Élève Exemple',
      classe: 'TG1',
      signale_par: 'Adulte Exemple'
    });
    ctx.db.setSignalementStatus(created.id, 'Clos');
    const reduced = ctx.db.reduceDirectIdentifiers(created.id);
    assert.equal(reduced.eleve, '');
    assert.equal(reduced.classe, '');
    assert.equal(reduced.signale_par, '');
    assert.match(reduced.identity_reduced_at, /^\d{4}-/);

    ctx.db.setSignalementStatus(created.id, 'Ouvert');
    assert.throws(
      () => ctx.db.updateSignalement(created.id, { eleve: 'Réintroduit', classe: 'TG2', signale_par: 'Réintroduit' }),
      /identit|réduit|réintroduction|reintroduction/i
    );
  } finally {
    cleanup(ctx);
  }
});

test('R3 : recherche identitaire est désactivée par défaut et activée seulement explicitement', () => {
  const ctx = fixture();
  try {
    ctx.db.createSignalement({ date: '2026-09-25', lieu: 'CDI', eleve: 'Alice Martin', classe: 'TG1' });
    const hidden = ctx.db.querySignalements({ query: 'Alice Martin', limit: 50, offset: 0, includeIdentities: false });
    assert.equal(hidden.rows.length, 0);
    const explicit = ctx.db.querySignalements({ query: 'Alice Martin', limit: 50, offset: 0, includeIdentities: true });
    assert.equal(explicit.rows.length, 1);
    assert.equal(explicit.rows[0].eleve, 'Alice Martin');
  } finally {
    cleanup(ctx);
  }
});

test('R3 : lecture ciblée regroupe dossier, réparations, photos et historique sans chargement global', () => {
  const ctx = fixture();
  try {
    const created = ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Gymnase' });
    ctx.db.createReparation({ signalement_id: created.id, mesure: 'Repeindre' });
    const source = path.join(ctx.root, 'preuve.jpg');
    fs.writeFileSync(source, tinyJpeg(3));
    ctx.photos.attach(created.id, source, ctx.db);

    const detail = ctx.db.getSignalementDetail(created.id);
    assert.equal(Number(detail.signalement.id), Number(created.id));
    assert.equal(detail.reparations.length, 1);
    assert.equal(detail.photos.length, 1);
    assert.ok(detail.events.some((event) => event.event_type === 'created'));
    assert.ok(detail.events.some((event) => event.event_type === 'photo_attached'));
  } finally {
    cleanup(ctx);
  }
});

test('R3 : recherche paginée retrouve un dossier situé au-delà des 500 premiers', () => {
  const ctx = fixture();
  try {
    ctx.db.transaction(() => {
      const insert = ctx.db.db.prepare('INSERT INTO signalements(num, date, lieu, statut) VALUES(?, ?, ?, ?)');
      for (let i = 1; i <= 850; i += 1) {
        insert.run(`2099-${String(i).padStart(4, '0')}`, '2099-01-01', `Zone-${i}`, 'Ouvert');
      }
    });
    const result = ctx.db.querySignalements({ query: 'Zone-849', limit: 50, offset: 0, includeIdentities: false });
    assert.ok(result.rows.some((row) => row.lieu === 'Zone-849'));
    assert.equal(result.total, 1);
  } finally {
    cleanup(ctx);
  }
});

test('R3 : historique minimal trace création, édition, clôture et réouverture', () => {
  const ctx = fixture();
  try {
    const created = ctx.db.createSignalement({ date: '2026-09-25', lieu: 'Historique' });
    ctx.db.updateSignalement(created.id, { description: 'Mise à jour' });
    ctx.db.setSignalementStatus(created.id, 'Clos');
    ctx.db.setSignalementStatus(created.id, 'Ouvert');
    const events = ctx.db.listSignalementEvents(created.id, 20).map((event) => event.event_type);
    for (const expected of ['created', 'updated', 'closed', 'reopened']) {
      assert.ok(events.includes(expected), `événement attendu absent: ${expected}`);
    }
  } finally {
    cleanup(ctx);
  }
});
