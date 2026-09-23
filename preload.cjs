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
  createBackup: () => ipcRenderer.invoke('rdl:backup:create'),
  openDataFolder: () => ipcRenderer.invoke('rdl:system:open-data-folder'),
  openBackupsFolder: () => ipcRenderer.invoke('rdl:system:open-backups-folder'),
  health: () => ipcRenderer.invoke('rdl:system:health')
}));
