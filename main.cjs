const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const { LocalDatabase } = require('./src/database.cjs');
const { LocalPhotoStore } = require('./src/storage.cjs');

app.setName('Respect des Lieux PRO');

if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
  app.setPath('userData', path.join(process.env.LOCALAPPDATA, 'Respect des Lieux PRO'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let db = null;
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
  [root, data, photos, backups].forEach(ensureDir);
  return {
    root,
    data,
    photos,
    backups,
    database: path.join(data, 'respect-des-lieux.sqlite3')
  };
}

function configureLocalOnlySession() {
  const ses = session.defaultSession;

  // L'application métier n'a besoin d'aucun accès réseau. On bloque donc
  // toute requête HTTP(S) au niveau Electron, indépendamment du renderer.
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
  if (!url.startsWith('file://')) {
    throw new Error('IPC refusé : origine non locale.');
  }
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
  fs.cpSync(paths.photos, targetDir, { recursive: true, force: true });
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
    format: 1,
    appVersion: app.getVersion(),
    createdAt: new Date().toISOString(),
    reason,
    database: 'respect-des-lieux.sqlite3',
    photos: 'photos',
    integrity: integrityBefore
  };
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
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

function registerIpc() {
  secureHandle('rdl:bootstrap', async () => ({
    appVersion: app.getVersion(),
    paths: { root: paths.root, database: paths.database, backups: paths.backups },
    stats: db.getStats(),
    signalements: db.listSignalements(500),
    reparations: db.listReparations(1000),
    integrity: db.integrityCheck()
  }));

  secureHandle('rdl:signalements:list', (limit = 500) => db.listSignalements(limit));
  secureHandle('rdl:signalements:create', (payload) => db.createSignalement(payload));
  secureHandle('rdl:signalements:update', (id, patch) => db.updateSignalement(id, patch));

  secureHandle('rdl:reparations:list', (limit = 1000) => db.listReparations(limit));
  secureHandle('rdl:reparations:create', (payload) => db.createReparation(payload));

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

  secureHandle('rdl:backup:create', async () => createBackup('manual'));
  secureHandle('rdl:system:open-data-folder', async () => shell.openPath(paths.root));
  secureHandle('rdl:system:open-backups-folder', async () => shell.openPath(paths.backups));
  secureHandle('rdl:system:health', async () => ({
    integrity: db.integrityCheck(),
    stats: db.getStats(),
    paths: { root: paths.root, database: paths.database, backups: paths.backups }
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
  db = new LocalDatabase(paths.database);
  db.init();
  photoStore = new LocalPhotoStore(paths.photos);
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
