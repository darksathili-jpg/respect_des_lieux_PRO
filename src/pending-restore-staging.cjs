const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function stagingDirFor(rootDir) {
  const suffix = crypto.randomBytes(6).toString('hex');
  return path.join(rootDir, `.pending-restore.staging-${process.pid}-${suffix}`);
}

function cleanupAbandonedPendingRestoreStaging(rootDir) {
  if (!fs.existsSync(rootDir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\.pending-restore\.staging-/.test(entry.name)) continue;
    fs.rmSync(path.join(rootDir, entry.name), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

function cleanupOrphanedPendingRestore({ pendingDir, markerPath }) {
  if (!pendingDir || !markerPath) throw new Error('Chemins pending/marker requis.');
  if (fs.existsSync(markerPath)) return false;
  fs.rmSync(`${markerPath}.tmp`, { force: true });
  if (!fs.existsSync(pendingDir)) return false;
  fs.rmSync(pendingDir, { recursive: true, force: true });
  return true;
}

async function publishPendingRestoreAtomically({ rootDir, pendingDir, sourceFile, extract, validate }) {
  if (!rootDir || !pendingDir || !sourceFile) throw new Error('Paramètres de restauration incomplets.');
  if (typeof extract !== 'function' || typeof validate !== 'function') {
    throw new Error('Callbacks extract/validate requis.');
  }

  fs.mkdirSync(rootDir, { recursive: true });
  if (fs.existsSync(pendingDir)) {
    throw new Error('Une restauration est déjà préparée. Redémarrez ou annulez-la avant d’en préparer une autre.');
  }

  const stagingDir = stagingDirFor(rootDir);
  fs.mkdirSync(stagingDir, { recursive: false });

  try {
    await extract(sourceFile, stagingDir);
    const validation = await validate(stagingDir);
    if (fs.existsSync(pendingDir)) {
      throw new Error('Une restauration a été préparée simultanément.');
    }
    fs.renameSync(stagingDir, pendingDir);
    return { pendingDir, validation };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  cleanupAbandonedPendingRestoreStaging,
  cleanupOrphanedPendingRestore,
  publishPendingRestoreAtomically
};
