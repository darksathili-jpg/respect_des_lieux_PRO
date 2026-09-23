const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_JPEG_BYTES = 3 * 1024 * 1024;

class LocalPhotoStore {
  constructor(photoDir) {
    this.photoDir = photoDir;
    fs.mkdirSync(this.photoDir, { recursive: true });
  }

  resolveStoredName(storedName) {
    const safe = path.basename(String(storedName || ''));
    if (!safe || safe !== storedName) throw new Error('Nom de photo invalide.');
    return path.join(this.photoDir, safe);
  }

  validateJpeg(filePath) {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('Le fichier sélectionné n’est pas valide.');
    if (stat.size <= 0 || stat.size > MAX_JPEG_BYTES) {
      throw new Error('La photo doit être un JPEG de 3 Mo maximum.');
    }
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(3);
    try {
      fs.readSync(fd, header, 0, 3, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (!(header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)) {
      throw new Error('Le fichier n’est pas un JPEG valide.');
    }
    return stat;
  }

  attach(signalementId, sourcePath, db) {
    const signalement = db.getSignalement(signalementId);
    if (!signalement) throw new Error('Signalement introuvable.');
    const stat = this.validateJpeg(sourcePath);
    const bytes = fs.readFileSync(sourcePath);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const storedName = `${signalementId}-${Date.now()}-${sha256.slice(0, 16)}.jpg`;
    const target = this.resolveStoredName(storedName);

    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
    try {
      return db.insertPhotoMetadata({
        signalement_id: signalementId,
        original_name: path.basename(sourcePath),
        stored_name: storedName,
        size_bytes: stat.size,
        sha256
      });
    } catch (error) {
      try { fs.unlinkSync(target); } catch {}
      throw error;
    }
  }
}

module.exports = { LocalPhotoStore, MAX_JPEG_BYTES };
