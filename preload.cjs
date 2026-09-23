const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rdl', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('rdl:bootstrap'),
  listSignalements: (limit) => ipcRenderer.invoke('rdl:signalements:list', limit),
  createSignalement: (payload) => ipcRenderer.invoke('rdl:signalements:create', payload),
  updateSignalement: (id, patch) => ipcRenderer.invoke('rdl:signalements:update', id, patch),
  listReparations: (limit) => ipcRenderer.invoke('rdl:reparations:list', limit),
  createReparation: (payload) => ipcRenderer.invoke('rdl:reparations:create', payload),
  attachPhoto: (signalementId) => ipcRenderer.invoke('rdl:photos:attach', signalementId),
  listPhotos: (signalementId) => ipcRenderer.invoke('rdl:photos:list', signalementId),
  openPhoto: (photoId) => ipcRenderer.invoke('rdl:photos:open', photoId),

  getRetentionPolicy: () => ipcRenderer.invoke('rdl:privacy:retention:get'),
  configureRetentionPolicy: (payload) => ipcRenderer.invoke('rdl:privacy:retention:configure', payload),
  lifecycleReview: () => ipcRenderer.invoke('rdl:privacy:lifecycle'),
  reduceDirectIdentifiers: (id) => ipcRenderer.invoke('rdl:privacy:reduce-identifiers', id),
  purgeSignalement: (id, confirmationNum) => ipcRenderer.invoke('rdl:privacy:purge', id, confirmationNum),
  exportAccessReview: (query) => ipcRenderer.invoke('rdl:privacy:export-review', query),
  listPrivacyEvents: (limit) => ipcRenderer.invoke('rdl:privacy:events', limit),

  createBackup: () => ipcRenderer.invoke('rdl:backup:create'),
  exportEncryptedBackup: (passphrase) => ipcRenderer.invoke('rdl:backup:export-encrypted', passphrase),
  prepareEncryptedRestore: (passphrase) => ipcRenderer.invoke('rdl:backup:prepare-restore', passphrase),

  openDataFolder: () => ipcRenderer.invoke('rdl:system:open-data-folder'),
  openBackupsFolder: () => ipcRenderer.invoke('rdl:system:open-backups-folder'),
  openExportsFolder: () => ipcRenderer.invoke('rdl:system:open-exports-folder'),
  restartApp: () => ipcRenderer.invoke('rdl:system:restart'),
  health: () => ipcRenderer.invoke('rdl:system:health')
}));
