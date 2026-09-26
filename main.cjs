const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const { LocalDatabase } = require('./src/database.cjs');
const { ReparationDomain } = require('./src/reparation-domain.cjs');
const { LocalPhotoStore } = require('./src/storage.cjs');
const { createEncryptedBackup, extractEncryptedBackup, validatePassphrase } = require('./src/portable-backup.cjs');

app.setName('Respect des Lieux PRO');

if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
  app.setPath('userData', path.join(process.env.LOCALAPPDATA, 'Respect des Lieux PRO'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let db = null;
let repairDomain = null;
let photoStore = null;
let paths = null;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appPaths() {
  const root = app.getPath('userData');
  const data = path.join(root, 'data');
  const photos = path.join(root, 'photos');
  const backups = path.join(root, 'backups');
  const exportsDir = path.join(root, 'exports');
  const pendingRestore = path.join(root, 'pending-restore');
  [root, data, photos, backups, exportsDir].forEach(ensureDir);
  return {
    root,
    data,
    photos,
    backups,
    exports: exportsDir,
    pendingRestore,
    database: path.join(data, 'respect-des-lieux.sqlite3'),
    privacyLedger: path.join(root, 'privacy-purge-ledger.json'),
    restoreMarker: path.join(root, 'restore-pending.json')
  };
}

function configureLocalOnlySession() {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true })
  );
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: '#eef3f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
}

function assertTrustedIpc(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('IPC refusé : émetteur non autorisé.');
  }
  if (event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('IPC refusé : seul le document principal est autorisé.');
  }
  const url = String(event.senderFrame?.url || '');
  if (!url.startsWith('file://')) throw new Error('IPC refusé : origine non locale.');
}

function secureHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpc(event);
    return handler(...args);
  });
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupPrefix(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function copyPhotos(targetDir) {
  if (!fs.existsSync(paths.photos)) return;
  fs.cpSync(paths.photos, targetDir, {
    recursive: true,
    force: true,
    filter: (source) => !source.includes(`${path.sep}.trash${path.sep}`) && !source.endsWith(`${path.sep}.trash`)
  });
}

function pruneBackups(keep = 14) {
  const entries = fs.readdirSync(paths.backups, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-'))
    .sort((a, b) => b.name.localeCompare(a.name));
  for (const entry of entries.slice(keep)) {
    fs.rmSync(path.join(paths.backups, entry.name), { recursive: true, force: true });
  }
}

async function createBackup(reason = 'manual') {
  const integrityBefore = db.integrityCheck();
  if (!integrityBefore.ok) throw new Error('Sauvegarde refusée : l’intégrité SQLite doit être contrôlée.');

  const folder = path.join(paths.backups, `backup-${safeTimestamp()}`);
  const photosTarget = path.join(folder, 'photos');
  ensureDir(folder);
  ensureDir(photosTarget);

  const targetDb = path.join(folder, 'respect-des-lieux.sqlite3');
  await db.backupTo(targetDb);
  copyPhotos(photosTarget);

  const manifest = {
    format: 2,
    appVersion: app.getVersion(),
    createdAt: new Date().toISOString(),
    reason,
    database: 'respect-des-lieux.sqlite3',
    photos: 'photos',
    integrity: integrityBefore,
    privacyLedgerPreservedOutsideBackups: true
  };
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
  pruneBackups(14);
  return { folder, manifest };
}

async function ensureDailyBackup() {
  const today = backupPrefix();
  const alreadyDone = fs.readdirSync(paths.backups, { withFileTypes: true })
    .some((entry) => entry.isDirectory() && entry.name.startsWith(`backup-${today}`));
  if (!alreadyDone) {
    try {
      await createBackup('daily-startup');
    } catch (error) {
      console.error('Sauvegarde quotidienne impossible:', error);
    }
  }
}

function quickCheckDatabaseFile(databasePath) {
  if (!fs.existsSync(databasePath)) throw new Error('Base SQLite absente de la sauvegarde.');
  const probe = new DatabaseSync(databasePath, { timeout: 5000, readOnly: true });
  try {
    const rows = probe.prepare('PRAGMA quick_check').all();
    const messages = rows.map((row) => String(Object.values(row)[0]));
    return { ok: messages.length > 0 && messages.every((message) => message === 'ok'), messages };
  } finally {
    probe.close();
  }
}

function validateSnapshotFolder(folder) {
  const manifestPath = path.join(folder, 'manifest.json');
  const databasePath = path.join(folder, 'respect-des-lieux.sqlite3');
  if (!fs.existsSync(manifestPath)) throw new Error('Manifeste absent de la sauvegarde.');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('Manifeste de sauvegarde illisible.');
  }
  if (!manifest || Number(manifest.format) < 1) throw new Error('Format de manifeste non reconnu.');
  const integrity = quickCheckDatabaseFile(databasePath);
  if (!integrity.ok) throw new Error(`Sauvegarde SQLite invalide : ${integrity.messages.join(', ')}`);
  const photosDir = path.join(folder, 'photos');
  if (!fs.existsSync(photosDir)) ensureDir(photosDir);
  return { manifest, databasePath, photosDir, integrity };
}

function replaceActiveDataFromSnapshot(snapshotFolder) {
  const snapshot = validateSnapshotFolder(snapshotFolder);
  ensureDir(paths.data);
  const incomingDb = `${paths.database}.incoming`;
  const incomingPhotos = path.join(paths.root, '.photos-incoming');
  fs.rmSync(incomingDb, { force: true });
  fs.rmSync(incomingPhotos, { recursive: true, force: true });
  fs.copyFileSync(snapshot.databasePath, incomingDb);
  fs.cpSync(snapshot.photosDir, incomingPhotos, { recursive: true, force: true });

  fs.rmSync(paths.database, { force: true });
  fs.rmSync(`${paths.database}-wal`, { force: true });
  fs.rmSync(`${paths.database}-shm`, { force: true });
  fs.rmSync(paths.photos, { recursive: true, force: true });
  fs.renameSync(incomingDb, paths.database);
  fs.renameSync(incomingPhotos, paths.photos);
  return snapshot;
}

function applyPendingRestoreBeforeOpen() {
  if (!fs.existsSync(paths.restoreMarker)) return { restored: false };
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(paths.restoreMarker, 'utf8'));
  } catch {
    throw new Error('Marqueur de restauration illisible.');
  }
  if (!marker || marker.format !== 1 || path.resolve(marker.pendingDir || '') !== path.resolve(paths.pendingRestore)) {
    throw new Error('Marqueur de restauration invalide.');
  }

  try {
    const result = replaceActiveDataFromSnapshot(paths.pendingRestore);
    fs.rmSync(paths.restoreMarker, { force: true });
    fs.rmSync(paths.pendingRestore, { recursive: true, force: true });
    return { restored: true, manifest: result.manifest };
  } catch (error) {
    if (marker.safeguardFolder && fs.existsSync(marker.safeguardFolder)) {
      try { replaceActiveDataFromSnapshot(marker.safeguardFolder); } catch {}
    }
    fs.rmSync(paths.restoreMarker, { force: true });
    fs.rmSync(paths.pendingRestore, { recursive: true, force: true });
    throw error;
  }
}

async function exportEncryptedBackup(passphrase) {
  validatePassphrase(passphrase);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter une sauvegarde chiffrée',
    defaultPath: path.join(app.getPath('documents'), `respect-des-lieux-${safeTimestamp()}.rdlbackup`),
    filters: [{ name: 'Sauvegarde Respect des Lieux', extensions: ['rdlbackup'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const snapshot = await createBackup('portable-encrypted-export');
  const encrypted = await createEncryptedBackup(snapshot.folder, result.filePath, passphrase);
  db.recordPrivacyEvent('encrypted_backup_exported', '', 'Sauvegarde externe AES-256-GCM créée');
  return { canceled: false, filePath: result.filePath, ...encrypted };
}

async function prepareEncryptedRestore(passphrase) {
  validatePassphrase(passphrase);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir une sauvegarde chiffrée à restaurer',
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde Respect des Lieux', extensions: ['rdlbackup'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  fs.rmSync(paths.pendingRestore, { recursive: true, force: true });
  await extractEncryptedBackup(result.filePaths[0], paths.pendingRestore, passphrase);
  const validation = validateSnapshotFolder(paths.pendingRestore);
  const safeguard = await createBackup('pre-encrypted-restore');
  const marker = {
    format: 1,
    preparedAt: new Date().toISOString(),
    pendingDir: paths.pendingRestore,
    safeguardFolder: safeguard.folder
  };
  const tmp = `${paths.restoreMarker}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(marker, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, paths.restoreMarker);
  return {
    canceled: false,
    ready: true,
    source: result.filePaths[0],
    snapshotCreatedAt: validation.manifest.createdAt || '',
    restartRequired: true
  };
}

function readPurgeLedger() {
  if (!fs.existsSync(paths.privacyLedger)) return { format: 1, entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(paths.privacyLedger, 'utf8'));
    if (!parsed || parsed.format !== 1 || !Array.isArray(parsed.entries)) throw new Error('format invalide');
    return parsed;
  } catch (error) {
    throw new Error(`Registre de purge illisible : ${error.message}`);
  }
}

function writePurgeLedger(ledger) {
  const tmp = `${paths.privacyLedger}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, paths.privacyLedger);
}

function addPurgeLedgerEntry(num) {
  const ledger = readPurgeLedger();
  if (!ledger.entries.some((entry) => entry.num === num)) {
    ledger.entries.push({ num, purgedAt: new Date().toISOString() });
    writePurgeLedger(ledger);
  }
}

function removePurgeLedgerEntry(num) {
  const ledger = readPurgeLedger();
  ledger.entries = ledger.entries.filter((entry) => entry.num !== num);
  writePurgeLedger(ledger);
}

function enforcePurgeLedger() {
  const ledger = readPurgeLedger();
  for (const entry of ledger.entries) {
    const current = db.getSignalementByNum(entry.num);
    if (!current) continue;
    const storedNames = db.listPhotos(current.id).map((photo) => photo.stored_name);
    const stage = photoStore.stageDelete(storedNames);
    try {
      db.forcePurgeByNum(entry.num);
      photoStore.commitStagedDelete(stage);
    } catch (error) {
      photoStore.rollbackStagedDelete(stage);
      throw error;
    }
  }
}

function safeExportName(query) {
  return String(query || 'personne')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'personne';
}

async function exportAccessReview(query) {
  const review = db.buildAccessReview(query);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer le dossier de revue des droits',
    defaultPath: path.join(paths.exports, `revue-droits-${safeExportName(query)}-${safeTimestamp()}.json`),
    filters: [{ name: 'Dossier de revue JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, JSON.stringify(review, null, 2), { encoding: 'utf8', mode: 0o600 });
  db.recordPrivacyEvent('access_review_exported', '', 'Export JSON préparé pour revue interne');
  return {
    canceled: false,
    filePath: result.filePath,
    matches: review.signalements.length,
    warning: review.warning
  };
}

async function purgeSignalement(id, confirmationNum) {
  const plan = db.getPurgePlan(id, confirmationNum);
  addPurgeLedgerEntry(plan.num);
  const stage = photoStore.stageDelete(plan.storedNames);
  try {
    const result = db.purgeSignalement(id, confirmationNum);
    photoStore.commitStagedDelete(stage);
    return result;
  } catch (error) {
    photoStore.rollbackStagedDelete(stage);
    try { removePurgeLedgerEntry(plan.num); } catch {}
    throw error;
  }
}

function removePhoto(photoId) {
  const photo = db.getPhoto(photoId);
  if (!photo) throw new Error('Photo introuvable.');
  const stage = photoStore.stageDelete([photo.stored_name]);
  try {
    const removed = db.transaction(() => db.deletePhotoMetadata(photo.id));
    photoStore.commitStagedDelete(stage);
    return { removed: true, photo: removed };
  } catch (error) {
    try { photoStore.rollbackStagedDelete(stage); } catch {}
    throw error;
  }
}

function registerIpc() {
  secureHandle('rdl:bootstrap', async () => ({
    appVersion: app.getVersion(),
    paths: { root: paths.root, database: paths.database, backups: paths.backups, exports: paths.exports },
    stats: db.getStats(),
    signalements: db.listSignalements(200),
    reparations: repairDomain.queryReparations({ limit: 200, offset: 0, includeIdentities: false }).rows,
    integrity: db.integrityCheck(),
    retention: db.getRetentionPolicy(),
    lifecycle: db.getLifecycleReview(),
    privacyEvents: db.listPrivacyEvents(50)
  }));

  secureHandle('rdl:signalements:list', (limit = 200) => db.listSignalements(limit));
  secureHandle('rdl:signalements:query', (options = {}) => db.querySignalements(options));
  secureHandle('rdl:signalements:get-detail', (id) => db.getSignalementDetail(id));
  secureHandle('rdl:signalements:create', (payload) => db.createSignalement(payload));
  secureHandle('rdl:signalements:update', (id, patch) => db.updateSignalement(id, patch));
  secureHandle('rdl:signalements:set-status', (id, status) => db.setSignalementStatus(id, status));

  secureHandle('rdl:reparations:list', (limit = 200) => repairDomain.queryReparations({ limit, offset: 0, includeIdentities: true }).rows);
  secureHandle('rdl:reparations:query', (options = {}) => repairDomain.queryReparations(options));
  secureHandle('rdl:reparations:get', (id) => repairDomain.getReparation(id));
  secureHandle('rdl:reparations:create', (payload) => repairDomain.createReparation(payload));
  secureHandle('rdl:reparations:update', (id, patch) => repairDomain.updateReparation(id, patch));
  secureHandle('rdl:reparations:set-status', (id, status) => repairDomain.setReparationStatus(id, status));

  secureHandle('rdl:photos:attach', async (signalementId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Ajouter une photo JPEG',
      properties: ['openFile'],
      filters: [{ name: 'Image JPEG', extensions: ['jpg', 'jpeg'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, photo: photoStore.attach(signalementId, result.filePaths[0], db) };
  });
  secureHandle('rdl:photos:list', (signalementId) => db.listPhotos(signalementId));
  secureHandle('rdl:photos:open', async (photoId) => {
    const photo = db.getPhoto(photoId);
    if (!photo) throw new Error('Photo introuvable.');
    const fullPath = photoStore.resolveStoredName(photo.stored_name);
    const error = await shell.openPath(fullPath);
    if (error) throw new Error(error);
    return true;
  });
  secureHandle('rdl:photos:remove', (photoId) => removePhoto(photoId));

  secureHandle('rdl:privacy:retention:get', () => db.getRetentionPolicy());
  secureHandle('rdl:privacy:retention:configure', (payload) => db.configureRetentionPolicy(payload));
  secureHandle('rdl:privacy:lifecycle', () => db.getLifecycleReview());
  secureHandle('rdl:privacy:reduce-identifiers', (id) => db.reduceDirectIdentifiers(id));
  secureHandle('rdl:privacy:purge', (id, confirmationNum) => purgeSignalement(id, confirmationNum));
  secureHandle('rdl:privacy:export-review', (query) => exportAccessReview(query));
  secureHandle('rdl:privacy:events', (limit = 100) => db.listPrivacyEvents(limit));

  secureHandle('rdl:backup:create', async () => createBackup('manual'));
  secureHandle('rdl:backup:export-encrypted', (passphrase) => exportEncryptedBackup(passphrase));
  secureHandle('rdl:backup:prepare-restore', (passphrase) => prepareEncryptedRestore(passphrase));

  secureHandle('rdl:system:open-data-folder', async () => shell.openPath(paths.root));
  secureHandle('rdl:system:open-backups-folder', async () => shell.openPath(paths.backups));
  secureHandle('rdl:system:open-exports-folder', async () => shell.openPath(paths.exports));
  secureHandle('rdl:system:restart', async () => {
    setImmediate(() => {
      app.relaunch();
      app.exit(0);
    });
    return true;
  });
  secureHandle('rdl:system:health', async () => ({
    integrity: db.integrityCheck(),
    stats: db.getStats(),
    retention: db.getRetentionPolicy(),
    paths: { root: paths.root, database: paths.database, backups: paths.backups, exports: paths.exports }
  }));
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  configureLocalOnlySession();
  paths = appPaths();
  const restoreResult = applyPendingRestoreBeforeOpen();
  db = new LocalDatabase(paths.database);
  db.init();
  repairDomain = new ReparationDomain(db);
  photoStore = new LocalPhotoStore(paths.photos);
  enforcePurgeLedger();
  if (restoreResult.restored) {
    db.recordPrivacyEvent('encrypted_backup_restored', '', 'Restauration locale chiffrée appliquée au démarrage');
  }
  registerIpc();
  createWindow();
  await ensureDailyBackup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { db?.close(); } catch (error) { console.error(error); }
});
