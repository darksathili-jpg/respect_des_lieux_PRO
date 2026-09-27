const { contextBridge, ipcRenderer } = require('electron');

function cleanIpcError(error) {
  const raw = String(error?.message || error || 'Erreur locale.');
  const message = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
  return new Error(message || 'Erreur locale.');
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch((error) => {
    throw cleanIpcError(error);
  });
}

contextBridge.exposeInMainWorld('rdl', Object.freeze({
  bootstrap: () => invoke('rdl:bootstrap'),

  listSignalements: (limit) => invoke('rdl:signalements:list', limit),
  querySignalements: (options) => invoke('rdl:signalements:query', options),
  getSignalementDetail: (id) => invoke('rdl:signalements:get-detail', id),
  createSignalement: (payload) => invoke('rdl:signalements:create', payload),
  updateSignalement: (id, patch) => invoke('rdl:signalements:update', id, patch),
  setSignalementStatus: (id, status) => invoke('rdl:signalements:set-status', id, status),

  listReparations: (limit) => invoke('rdl:reparations:list', limit),
  queryReparations: (options) => invoke('rdl:reparations:query', options),
  getReparation: (id, includeIdentities = false) => invoke('rdl:reparations:get', id, includeIdentities === true),
  createReparation: (payload) => invoke('rdl:reparations:create', payload),
  updateReparation: (id, patch) => invoke('rdl:reparations:update', id, patch),
  setReparationStatus: (id, status) => invoke('rdl:reparations:set-status', id, status),

  attachPhoto: (signalementId) => invoke('rdl:photos:attach', signalementId),
  listPhotos: (signalementId) => invoke('rdl:photos:list', signalementId),
  openPhoto: (photoId) => invoke('rdl:photos:open', photoId),
  removePhoto: (photoId) => invoke('rdl:photos:remove', photoId),

  getRetentionPolicy: () => invoke('rdl:privacy:retention:get'),
  configureRetentionPolicy: (payload) => invoke('rdl:privacy:retention:configure', payload),
  lifecycleReview: () => invoke('rdl:privacy:lifecycle'),
  reduceDirectIdentifiers: (id) => invoke('rdl:privacy:reduce-identifiers', id),
  purgeSignalement: (id, confirmationNum) => invoke('rdl:privacy:purge', id, confirmationNum),
  exportAccessReview: (query) => invoke('rdl:privacy:export-review', query),
  listPrivacyEvents: (limit) => invoke('rdl:privacy:events', limit),

  createBackup: () => invoke('rdl:backup:create'),
  exportEncryptedBackup: (passphrase) => invoke('rdl:backup:export-encrypted', passphrase),
  prepareEncryptedRestore: (passphrase) => invoke('rdl:backup:prepare-restore', passphrase),

  openDataFolder: () => invoke('rdl:system:open-data-folder'),
  openBackupsFolder: () => invoke('rdl:system:open-backups-folder'),
  openExportsFolder: () => invoke('rdl:system:open-exports-folder'),
  restartApp: () => invoke('rdl:system:restart'),
  health: () => invoke('rdl:system:health')
}));
