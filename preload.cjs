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

function installUiLayers() {
  setTimeout(() => {
    // V5.2.1 visual layer. It deliberately lives above the validated local
    // database/storage foundation so the graphic redesign cannot alter data.
    if (!document.querySelector('script[data-rdl-theme-layer]')) {
      const theme = document.createElement('script');
      theme.src = './theme-v521.js';
      theme.defer = true;
      theme.dataset.rdlThemeLayer = 'active';
      document.body.appendChild(theme);
    }

    if (!document.querySelector('link[data-rdl-detail-layer]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = './detail.css';
      style.dataset.rdlDetailLayer = 'style';
      document.head.appendChild(style);
    }

    if (!document.querySelector('script[data-rdl-detail-layer]')) {
      const script = document.createElement('script');
      script.src = './detail.js';
      script.dataset.rdlDetailLayer = 'script';
      script.defer = true;
      document.body.appendChild(script);
    }
  }, 0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installUiLayers, { once: true });
} else {
  installUiLayers();
}
