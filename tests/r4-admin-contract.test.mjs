import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preload = fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../main.cjs', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8');

test('admin R4 : les opérations critiques sont sérialisées dans le preload', () => {
  for (const key of [
    "invokeExclusive('retention'",
    "invokeExclusive(`reduce:${Number(id)}`",
    "invokeExclusive(`purge:${Number(id)}`",
    "invokeExclusive('access-review'",
    "invokeExclusive('backup-local'",
    "invokeExclusive('backup-encrypted'",
    "invokeExclusive('restore-prepare'"
  ]) {
    assert.match(preload, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('admin R4 : les contrôles critiques passent par withBusy et aria-busy', () => {
  assert.match(app, /function withBusy[\s\S]*setAttribute\('aria-busy', 'true'\)[\s\S]*control\.disabled = true/);
  assert.match(app, /#backup-now'[\s\S]*createLocalBackup\(event\.currentTarget\)/);
  assert.match(app, /#backup-view-action'[\s\S]*createLocalBackup\(event\.currentTarget\)/);
  assert.match(app, /#encrypted-backup'[\s\S]*withBusy\(event\.currentTarget/);
  assert.match(app, /#encrypted-restore'[\s\S]*withBusy\(event\.currentTarget/);
  assert.match(app, /#retention-form'[\s\S]*withBusy\(submit/);
  assert.match(app, /#rights-export'[\s\S]*withBusy\(event\.currentTarget/);
  assert.match(app, /if \(reduce\)[\s\S]*withBusy\(reduce/);
  assert.match(app, /else if \(purge\)[\s\S]*withBusy\(purge/);
});

test('admin R4 : aucune ouverture de chemin arbitraire n’est exposée au renderer', () => {
  assert.doesNotMatch(preload, /openPath\s*:/);
  assert.doesNotMatch(preload, /openFolder\s*:\s*\([^)]*path/i);
  assert.match(preload, /openDataFolder:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('rdl:system:open-data-folder'\)/);
  assert.match(preload, /openBackupsFolder:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('rdl:system:open-backups-folder'\)/);
  assert.match(preload, /openExportsFolder:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('rdl:system:open-exports-folder'\)/);

  assert.match(main, /shell\.openPath\(paths\.root\)/);
  assert.match(main, /shell\.openPath\(paths\.backups\)/);
  assert.match(main, /shell\.openPath\(paths\.exports\)/);
  assert.doesNotMatch(main, /rdl:system:open-(?:path|folder)'\s*,\s*async\s*\([^)]/);
});

test('admin R4 : le health IPC utilise le diagnostic enrichi sans secret', () => {
  assert.match(main, /rdl:system:health'[\s\S]*buildSystemHealth\(/);
  assert.doesNotMatch(main, /buildSystemHealth\([\s\S]{0,500}passphrase/i);
});
