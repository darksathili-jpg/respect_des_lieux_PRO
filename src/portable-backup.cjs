const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { pipeline } = require('node:stream/promises');

const ENC_MAGIC = Buffer.from('RDLENC1\0', 'ascii');
const PACK_MAGIC = Buffer.from('RDLPACK1', 'ascii');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const OUTER_HEADER_BYTES = ENC_MAGIC.length + SALT_BYTES + IV_BYTES;
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function validatePassphrase(passphrase) {
  const value = String(passphrase || '');
  if (value.length < 12 || value.length > 256) {
    throw new Error('La phrase secrète doit contenir entre 12 et 256 caractères.');
  }
  return value;
}

function listRegularFiles(root) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Les liens symboliques ne sont pas autorisés dans une sauvegarde.');
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

async function writeFileToStream(stream, filePath) {
  for await (const chunk of fs.createReadStream(filePath)) {
    await writeChunk(stream, chunk);
  }
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(validatePassphrase(passphrase), salt, 32, SCRYPT_OPTIONS);
}

function safeRelativePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) throw new Error('Chemin de sauvegarde invalide.');
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error('Chemin de sauvegarde non sûr.');
  return parts.join('/');
}

async function createEncryptedBackup(sourceDir, targetFile, passphrase) {
  const sourceRoot = path.resolve(sourceDir);
  const files = listRegularFiles(sourceRoot);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, Buffer.concat([ENC_MAGIC, salt, iv]), { mode: 0o600 });
  const output = fs.createWriteStream(targetFile, { flags: 'a', mode: 0o600 });
  cipher.pipe(output);

  try {
    await writeChunk(cipher, PACK_MAGIC);
    for (const file of files) {
      const rel = safeRelativePath(path.relative(sourceRoot, file));
      const relBytes = Buffer.from(rel, 'utf8');
      if (relBytes.length > 4096) throw new Error('Chemin trop long dans la sauvegarde.');
      const stat = fs.statSync(file);
      const header = Buffer.alloc(12);
      header.writeUInt32BE(relBytes.length, 0);
      header.writeBigUInt64BE(BigInt(stat.size), 4);
      await writeChunk(cipher, header);
      await writeChunk(cipher, relBytes);
      await writeFileToStream(cipher, file);
    }
    const end = Buffer.alloc(12);
    await writeChunk(cipher, end);
    cipher.end();
    await once(output, 'finish');
    const tag = cipher.getAuthTag();
    fs.appendFileSync(targetFile, tag);
  } catch (error) {
    try { cipher.destroy(); } catch {}
    try { output.destroy(); } catch {}
    try { fs.rmSync(targetFile, { force: true }); } catch {}
    throw error;
  }

  return {
    file: targetFile,
    files: files.length,
    bytes: fs.statSync(targetFile).size,
    format: 1,
    encryption: 'AES-256-GCM',
    kdf: 'scrypt'
  };
}

function readExact(fd, buffer, offset, length, position) {
  let total = 0;
  while (total < length) {
    const n = fs.readSync(fd, buffer, offset + total, length - total, position + total);
    if (n === 0) throw new Error('Sauvegarde tronquée.');
    total += n;
  }
}

function unpackPlainArchive(packFile, targetDir) {
  const root = path.resolve(targetDir);
  fs.mkdirSync(root, { recursive: true });
  const fd = fs.openSync(packFile, 'r');
  const stat = fs.fstatSync(fd);
  let position = 0;
  let count = 0;
  try {
    const magic = Buffer.alloc(PACK_MAGIC.length);
    readExact(fd, magic, 0, magic.length, position);
    position += magic.length;
    if (!magic.equals(PACK_MAGIC)) throw new Error('Format interne de sauvegarde invalide.');

    while (position < stat.size) {
      const header = Buffer.alloc(12);
      readExact(fd, header, 0, header.length, position);
      position += header.length;
      const pathLength = header.readUInt32BE(0);
      const fileSize = header.readBigUInt64BE(4);
      if (pathLength === 0) break;
      if (pathLength > 4096) throw new Error('Chemin trop long dans la sauvegarde.');
      if (fileSize > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Fichier trop volumineux dans la sauvegarde.');

      const pathBytes = Buffer.alloc(pathLength);
      readExact(fd, pathBytes, 0, pathLength, position);
      position += pathLength;
      const rel = safeRelativePath(pathBytes.toString('utf8'));
      const destination = path.resolve(root, ...rel.split('/'));
      if (destination !== root && !destination.startsWith(`${root}${path.sep}`)) {
        throw new Error('Chemin de sauvegarde hors dossier cible.');
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const out = fs.openSync(destination, 'wx', 0o600);
      try {
        let remaining = Number(fileSize);
        const chunk = Buffer.alloc(Math.min(64 * 1024, Math.max(remaining, 1)));
        while (remaining > 0) {
          const size = Math.min(chunk.length, remaining);
          readExact(fd, chunk, 0, size, position);
          position += size;
          fs.writeSync(out, chunk, 0, size);
          remaining -= size;
        }
      } finally {
        fs.closeSync(out);
      }
      count += 1;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { files: count };
}

async function extractEncryptedBackup(archiveFile, targetDir, passphrase) {
  const stat = fs.statSync(archiveFile);
  if (!stat.isFile() || stat.size <= OUTER_HEADER_BYTES + TAG_BYTES) throw new Error('Sauvegarde chiffrée invalide ou vide.');

  const fd = fs.openSync(archiveFile, 'r');
  const outer = Buffer.alloc(OUTER_HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    readExact(fd, outer, 0, outer.length, 0);
    readExact(fd, tag, 0, TAG_BYTES, stat.size - TAG_BYTES);
  } finally {
    fs.closeSync(fd);
  }

  const magic = outer.subarray(0, ENC_MAGIC.length);
  if (!magic.equals(ENC_MAGIC)) throw new Error('Format de sauvegarde chiffrée non reconnu.');
  const saltStart = ENC_MAGIC.length;
  const salt = outer.subarray(saltStart, saltStart + SALT_BYTES);
  const iv = outer.subarray(saltStart + SALT_BYTES, OUTER_HEADER_BYTES);
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const targetRoot = path.resolve(targetDir);
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  const tempPack = path.join(path.dirname(targetRoot), `.rdl-pack-${crypto.randomUUID()}.tmp`);
  const input = fs.createReadStream(archiveFile, {
    start: OUTER_HEADER_BYTES,
    end: stat.size - TAG_BYTES - 1
  });
  const output = fs.createWriteStream(tempPack, { flags: 'wx', mode: 0o600 });

  try {
    await pipeline(input, decipher, output);
    const result = unpackPlainArchive(tempPack, targetRoot);
    return { ...result, targetDir: targetRoot };
  } catch (error) {
    fs.rmSync(targetRoot, { recursive: true, force: true });
    if (/authenticate|auth/i.test(String(error.message))) {
      throw new Error('Phrase secrète incorrecte ou sauvegarde altérée.');
    }
    throw error;
  } finally {
    try { fs.rmSync(tempPack, { force: true }); } catch {}
  }
}

module.exports = {
  createEncryptedBackup,
  extractEncryptedBackup,
  validatePassphrase,
  ENC_MAGIC,
  PACK_MAGIC
};
