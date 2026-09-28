import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('renderer/app.js', 'utf8');
const detail = fs.readFileSync('renderer/detail.js', 'utf8');
const html = fs.readFileSync('renderer/index.html', 'utf8');

test('R3-P2 : les actions Réparations sont rendues directement sans décoration post-rendu', () => {
  assert.match(app, /data-repair-id="\$\{Number\(r\.id\)\}"/);
  assert.match(app, /data-edit-repair="\$\{Number\(r\.id\)\}"/);
  assert.match(app, /aria-label="Modifier la réparation \$\{Number\(r\.id\)\}"/);

  assert.doesNotMatch(detail, /MutationObserver/);
  assert.doesNotMatch(detail, /decorateRepairRows/);
  assert.doesNotMatch(detail, /decoratingRepairs/);
  assert.doesNotMatch(detail, /listReparations\(1000\)/);
});

test('R3-P2 : le dialogue Réparations possède un seul chemin create/update et des sorties non soumettantes', () => {
  assert.doesNotMatch(app, /\$\('#repair-form'\)\.addEventListener\('submit'/);
  assert.match(app, /rdl:create-repair/);
  assert.match(app, /rdl:repairs-changed/);
  assert.match(detail, /window\.rdl\.createReparation/);
  assert.match(detail, /window\.rdl\.updateReparation/);
  assert.match(detail, /data-repair-cancel/);
  assert.match(detail, /keepRepairFocusInside/);
  assert.match(detail, /return \$\$\('button:not\(\[disabled\]\)/);
  assert.ok(detail.includes("$$('[data-repair-cancel]', repairDialog).forEach"));
  assert.doesNotMatch(detail, /return \$\('button:not\(\[disabled\]\)/);
  assert.match(html, /id="repair-form" class="dialog-card"/);
  assert.doesNotMatch(html, /id="repair-form" method="dialog"/);
  assert.match(html, /data-repair-cancel aria-label="Fermer"/);
  assert.match(html, /type="button" data-repair-cancel>Annuler<\/button>/);
  assert.match(html, /type="submit">Enregistrer<\/button>/);
});
