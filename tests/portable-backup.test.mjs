import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createEncryptedBackup, extractEncryptedBackup, validatePassphrase } = require('../src/portable-backup.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-portable-'));
  const source = path.join(root, 'source');
  const output = path.join(root, 'backup.rdlbackup');
  const restored = path.join(root, 'restored');
  fs.mkdirSync(path.join(source, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify({ format: 2, test: true }), 'utf8');
  fs.writeFileSync(path.join(source, 'respect-des-lieux.sqlite3'), Buffer.from('sqlite-placeholder'));
  fs.writeFileSync(path.join(source, 'photos', '1.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return { root, source, output, restored };
}

test('phrase secrète : longueur minimale imposée', () => {
  assert.throws(() => validatePassphrase('trop-court'), /12/);
  assert.equal(validatePassphrase('une phrase suffisamment longue'), 'une phrase suffisamment longue');
});

test('sauvegarde chiffrée : aller-retour exact', async () => {
  const ctx = fixture();
  try {
    const passphrase = 'Phrase secrète test 2026!';
    const created = await createEncryptedBackup(ctx.source, ctx.output, passphrase);
    assert.equal(created.encryption, 'AES-256-GCM');
    assert.equal(created.files, 3);
    assert.equal(fs.existsSync(ctx.output), true);

    const extracted = await extractEncryptedBackup(ctx.output, ctx.restored, passphrase);
    assert.equal(extracted.files, 3);
    for (const rel of ['manifest.json', 'respect-des-lieux.sqlite3', path.join('photos', '1.jpg')]) {
      assert.deepEqual(fs.readFileSync(path.join(ctx.restored, rel)), fs.readFileSync(path.join(ctx.source, rel)));
    }
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('sauvegarde chiffrée : mauvais secret ou altération refusés', async () => {
  const ctx = fixture();
  try {
    await createEncryptedBackup(ctx.source, ctx.output, 'Phrase secrète correcte 2026!');
    await assert.rejects(
      extractEncryptedBackup(ctx.output, ctx.restored, 'Phrase secrète incorrecte 2026!'),
      /incorrecte|altérée|authenticate|auth/i
    );

    const data = fs.readFileSync(ctx.output);
    data[Math.floor(data.length / 2)] ^= 0xff;
    fs.writeFileSync(ctx.output, data);
    await assert.rejects(
      extractEncryptedBackup(ctx.output, ctx.restored, 'Phrase secrète correcte 2026!'),
      /incorrecte|altérée|authenticate|auth/i
    );
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
