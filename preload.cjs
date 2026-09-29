const { contextBridge, ipcRenderer } = require('electron');

const inFlight = new Map();

function invokeExclusive(key, channel, ...args) {
  if (inFlight.has(key)) return inFlight.get(key);
  const operation = ipcRenderer.invoke(channel, ...args)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, operation);
  return operation;
}

contextBridge.exposeInMainWorld('rdl', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('rdl:bootstrap'),

  listSignalements: (limit) => ipcRenderer.invoke('rdl:signalements:list', limit),
  querySignalements: (options) => ipcRenderer.invoke('rdl:signalements:query', options),
  getSignalementDetail: (id) => ipcRenderer.invoke('rdl:signalements:get-detail', id),
  createSignalement: (payload) => ipcRenderer.invoke('rdl:signalements:create', payload),
  updateSignalement: (id, patch) => ipcRenderer.invoke('rdl:signalements:update', id, patch),
  setSignalementStatus: (id, status) => ipcRenderer.invoke('rdl:signalements:set-status', id, status),

  listReparations: (limit) => ipcRenderer.invoke('rdl:reparations:list', limit),
  queryReparations: (options) => ipcRenderer.invoke('rdl:reparations:query', options),
  getReparation: (id) => ipcRenderer.invoke('rdl:reparations:get', id),
  createReparation: (payload) => ipcRenderer.invoke('rdl:reparations:create', payload),
  updateReparation: (id, payload) => ipcRenderer.invoke('rdl:reparations:update', id, payload),

  attachPhoto: (signalementId) => ipcRenderer.invoke('rdl:photos:attach', signalementId),
  listPhotos: (signalementId) => ipcRenderer.invoke('rdl:photos:list', signalementId),
  openPhoto: (photoId) => ipcRenderer.invoke('rdl:photos:open', photoId),
  removePhoto: (photoId) => ipcRenderer.invoke('rdl:photos:remove', photoId),

  getRetentionPolicy: () => ipcRenderer.invoke('rdl:privacy:retention:get'),
  configureRetentionPolicy: (payload) => invokeExclusive('retention', 'rdl:privacy:retention:configure', payload),
  lifecycleReview: () => ipcRenderer.invoke('rdl:privacy:lifecycle'),
  reduceDirectIdentifiers: (id) => invokeExclusive(`reduce:${Number(id)}`, 'rdl:privacy:reduce-identifiers', id),
  purgeSignalement: (id, confirmationNum) => invokeExclusive(`purge:${Number(id)}`, 'rdl:privacy:purge', id, confirmationNum),
  exportAccessReview: (query) => invokeExclusive('access-review', 'rdl:privacy:export-review', query),
  listPrivacyEvents: (limit) => ipcRenderer.invoke('rdl:privacy:events', limit),

  createBackup: () => invokeExclusive('backup-local', 'rdl:backup:create'),
  exportEncryptedBackup: (passphrase) => invokeExclusive('backup-encrypted', 'rdl:backup:export-encrypted', passphrase),
  prepareEncryptedRestore: (passphrase) => invokeExclusive('restore-prepare', 'rdl:backup:prepare-restore', passphrase),

  openDataFolder: () => ipcRenderer.invoke('rdl:system:open-data-folder'),
  openBackupsFolder: () => ipcRenderer.invoke('rdl:system:open-backups-folder'),
  openExportsFolder: () => ipcRenderer.invoke('rdl:system:open-exports-folder'),
  restartApp: () => ipcRenderer.invoke('rdl:system:restart'),
  health: () => ipcRenderer.invoke('rdl:system:health')
}));
