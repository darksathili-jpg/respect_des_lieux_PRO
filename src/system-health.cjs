const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const BACKUP_FORMAT_VERSION = 2;
const RESTORE_MARKER_FORMAT_VERSION = 1;

function directoryAccess(dir) {
  const status = { exists: false, readable: false, writable: false };
  try {
    const stat = fs.statSync(dir);
    status.exists = stat.isDirectory();
    if (!status.exists) return status;
    try {
      fs.accessSync(dir, fs.constants.R_OK);
      status.readable = true;
    } catch {}
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      status.writable = true;
    } catch {}
  } catch {}
  return status;
}

function diskState(rootDir) {
  try {
    const stat = fs.statfsSync(rootDir);
    const blockSize = Number(stat.bsize || 0);
    const availableBlocks = Number(stat.bavail ?? stat.bfree ?? 0);
    const totalBlocks = Number(stat.blocks || 0);
    return {
      availableBytes: Math.max(0, blockSize * availableBlocks),
      totalBytes: Math.max(0, blockSize * totalBlocks)
    };
  } catch (error) {
    return { availableBytes: null, totalBytes: null, error: error.message };
  }
}

function databaseSchemaVersion(databasePath) {
  if (!fs.existsSync(databasePath)) return null;
  const probe = new DatabaseSync(databasePath, { timeout: 5000, readOnly: true });
  try {
    const row = probe.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
    const value = Number(row?.value);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  } finally {
    probe.close();
  }
}

function latestBackup(backupsDir) {
  if (!fs.existsSync(backupsDir)) return null;
  const entries = fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-'))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (!entries.length) return null;
  const folder = path.join(backupsDir, entries[0].name);
  const manifestPath = path.join(folder, 'manifest.json');
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
  return {
    name: entries[0].name,
    createdAt: manifest?.createdAt || null,
    reason: manifest?.reason || null,
    format: Number.isFinite(Number(manifest?.format)) ? Number(manifest.format) : null
  };
}

function pendingRestoreState({ pendingDir, restoreMarker }) {
  const pendingDirectory = fs.existsSync(pendingDir);
  const markerExists = fs.existsSync(restoreMarker);
  let preparedAt = null;
  if (markerExists) {
    try {
      const marker = JSON.parse(fs.readFileSync(restoreMarker, 'utf8'));
      preparedAt = marker?.preparedAt || null;
    } catch {}
  }
  return {
    pending: pendingDirectory || markerExists,
    pendingDirectory,
    markerExists,
    preparedAt
  };
}

function buildSystemHealth({ paths, integrity, stats, retention, appVersion }) {
  if (!paths?.root || !paths?.database || !paths?.backups || !paths?.exports || !paths?.photos || !paths?.data) {
    throw new Error('Chemins système incomplets.');
  }
  return {
    integrity,
    stats,
    retention,
    appVersion,
    paths: {
      root: paths.root,
      database: paths.database,
      backups: paths.backups,
      exports: paths.exports
    },
    disk: diskState(paths.root),
    lastBackup: latestBackup(paths.backups),
    restore: pendingRestoreState({ pendingDir: paths.pendingRestore, restoreMarker: paths.restoreMarker }),
    formats: {
      databaseSchema: databaseSchemaVersion(paths.database),
      backup: BACKUP_FORMAT_VERSION,
      restoreMarker: RESTORE_MARKER_FORMAT_VERSION
    },
    directories: {
      root: directoryAccess(paths.root),
      data: directoryAccess(paths.data),
      photos: directoryAccess(paths.photos),
      backups: directoryAccess(paths.backups),
      exports: directoryAccess(paths.exports)
    }
  };
}

module.exports = {
  BACKUP_FORMAT_VERSION,
  RESTORE_MARKER_FORMAT_VERSION,
  directoryAccess,
  diskState,
  databaseSchemaVersion,
  latestBackup,
  pendingRestoreState,
  buildSystemHealth
};
