const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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
      webSecurity: true
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
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
    integrity: db.integrityCheck()
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
  ipcMain.handle('rdl:bootstrap', async () => ({
    appVersion: app.getVersion(),
    paths: { root: paths.root, database: paths.database, backups: paths.backups },
    stats: db.getStats(),
    signalements: db.listSignalements(500),
    reparations: db.listReparations(1000),
    integrity: db.integrityCheck()
  }));

  ipcMain.handle('rdl:signalements:list', (_event, limit = 500) => db.listSignalements(limit));
  ipcMain.handle('rdl:signalements:create', (_event, payload) => db.createSignalement(payload));
  ipcMain.handle('rdl:signalements:update', (_event, id, patch) => db.updateSignalement(id, patch));

  ipcMain.handle('rdl:reparations:list', (_event, limit = 1000) => db.listReparations(limit));
  ipcMain.handle('rdl:reparations:create', (_event, payload) => db.createReparation(payload));

  ipcMain.handle('rdl:photos:attach', async (_event, signalementId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Ajouter une photo JPEG',
      properties: ['openFile'],
      filters: [{ name: 'Image JPEG', extensions: ['jpg', 'jpeg'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, photo: photoStore.attach(signalementId, result.filePaths[0], db) };
  });

  ipcMain.handle('rdl:photos:list', (_event, signalementId) => db.listPhotos(signalementId));
  ipcMain.handle('rdl:photos:open', async (_event, photoId) => {
    const photo = db.getPhoto(photoId);
    if (!photo) throw new Error('Photo introuvable.');
    const fullPath = photoStore.resolveStoredName(photo.stored_name);
    const error = await shell.openPath(fullPath);
    if (error) throw new Error(error);
    return true;
  });

  ipcMain.handle('rdl:backup:create', async () => createBackup('manual'));
  ipcMain.handle('rdl:system:open-data-folder', async () => shell.openPath(paths.root));
  ipcMain.handle('rdl:system:open-backups-folder', async () => shell.openPath(paths.backups));
  ipcMain.handle('rdl:system:health', async () => ({
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
