const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_JPEG_BYTES = 3 * 1024 * 1024;
const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const METADATA_MARKERS = new Set([0xe1, 0xed, 0xfe]); // APP1 (EXIF/XMP), APP13 (IPTC), COM

function stripJpegMetadata(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('Le fichier n’est pas un JPEG valide.');
  }

  const chunks = [JPEG_SOI];
  let i = 2;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('Structure JPEG invalide.');
    const markerStart = i;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) throw new Error('Structure JPEG tronquée.');

    const marker = bytes[i];
    i += 1;
    if (marker === 0xda) {
      chunks.push(bytes.subarray(markerStart));
      i = bytes.length;
      break;
    }
    if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(bytes.subarray(markerStart, i));
      if (marker === 0xd9) break;
      continue;
    }
    if (i + 2 > bytes.length) throw new Error('Segment JPEG tronqué.');
    const segmentLength = bytes.readUInt16BE(i);
    if (segmentLength < 2) throw new Error('Longueur de segment JPEG invalide.');
    const segmentEnd = i + segmentLength;
    if (segmentEnd > bytes.length) throw new Error('Segment JPEG incomplet.');
    if (!METADATA_MARKERS.has(marker)) chunks.push(bytes.subarray(markerStart, segmentEnd));
    i = segmentEnd;
  }

  const sanitized = Buffer.concat(chunks);
  if (sanitized.length < 4 || sanitized[0] !== 0xff || sanitized[1] !== 0xd8) {
    throw new Error('JPEG assaini invalide.');
  }
  return sanitized;
}

class LocalPhotoStore {
  constructor(photoDir) {
    this.photoDir = photoDir;
    this.trashDir = path.join(this.photoDir, '.trash');
    fs.mkdirSync(this.photoDir, { recursive: true });
    fs.mkdirSync(this.trashDir, { recursive: true });
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
    this.validateJpeg(sourcePath);

    const sourceBytes = fs.readFileSync(sourcePath);
    const sanitizedBytes = stripJpegMetadata(sourceBytes);
    if (sanitizedBytes.length <= 0 || sanitizedBytes.length > MAX_JPEG_BYTES) {
      throw new Error('La photo assainie dépasse la limite autorisée.');
    }

    const sha256 = crypto.createHash('sha256').update(sanitizedBytes).digest('hex');
    const storedName = `${signalementId}-${Date.now()}-${sha256.slice(0, 16)}.jpg`;
    const target = this.resolveStoredName(storedName);

    fs.writeFileSync(target, sanitizedBytes, { flag: 'wx', mode: 0o600 });
    try {
      return db.insertPhotoMetadata({
        signalement_id: signalementId,
        original_name: 'photo.jpg',
        stored_name: storedName,
        size_bytes: sanitizedBytes.length,
        sha256
      });
    } catch (error) {
      try { fs.unlinkSync(target); } catch {}
      throw error;
    }
  }

  stageDelete(storedNames = []) {
    const unique = [...new Set(storedNames.map((name) => path.basename(String(name || ''))).filter(Boolean))];
    const stageId = crypto.randomUUID();
    const stageDir = path.join(this.trashDir, stageId);
    fs.mkdirSync(stageDir, { recursive: true });
    const moved = [];
    try {
      for (const name of unique) {
        const source = this.resolveStoredName(name);
        if (!fs.existsSync(source)) continue;
        const target = path.join(stageDir, name);
        fs.renameSync(source, target);
        moved.push({ name, source, target });
      }
      return { stageDir, moved };
    } catch (error) {
      for (const item of moved.reverse()) {
        try { fs.renameSync(item.target, item.source); } catch {}
      }
      try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
      throw error;
    }
  }

  rollbackStagedDelete(stage) {
    if (!stage?.moved) return;
    for (const item of [...stage.moved].reverse()) {
      if (!fs.existsSync(item.target)) continue;
      fs.renameSync(item.target, item.source);
    }
    try { fs.rmSync(stage.stageDir, { recursive: true, force: true }); } catch {}
  }

  commitStagedDelete(stage) {
    if (!stage?.stageDir) return;
    fs.rmSync(stage.stageDir, { recursive: true, force: true });
  }
}

module.exports = { LocalPhotoStore, MAX_JPEG_BYTES, stripJpegMetadata };
