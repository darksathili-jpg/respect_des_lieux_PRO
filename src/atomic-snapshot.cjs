const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function stagingName(finalName) {
  const suffix = crypto.randomBytes(6).toString('hex');
  return `.${finalName}.staging-${process.pid}-${suffix}`;
}

async function commitDirectoryAtomically({ parentDir, finalName, build, validate }) {
  if (!parentDir || !finalName) throw new Error('Destination de snapshot invalide.');
  if (typeof build !== 'function' || typeof validate !== 'function') {
    throw new Error('Callbacks build/validate requis.');
  }

  fs.mkdirSync(parentDir, { recursive: true });
  const finalDir = path.join(parentDir, finalName);
  const stagingDir = path.join(parentDir, stagingName(finalName));

  if (fs.existsSync(finalDir)) throw new Error(`Snapshot déjà présent : ${finalName}`);
  fs.mkdirSync(stagingDir, { recursive: false });

  try {
    await build(stagingDir);
    const validation = await validate(stagingDir);
    if (fs.existsSync(finalDir)) throw new Error(`Snapshot déjà présent : ${finalName}`);
    fs.renameSync(stagingDir, finalDir);
    return { folder: finalDir, validation };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function cleanupAbandonedStaging(parentDir) {
  if (!fs.existsSync(parentDir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\.backup-.*\.staging-/.test(entry.name)) continue;
    fs.rmSync(path.join(parentDir, entry.name), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

module.exports = {
  commitDirectoryAtomically,
  cleanupAbandonedStaging
};
