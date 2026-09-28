const path = require('node:path');
const fs = require('node:fs');
const { dialog } = require('electron');

const photoFixture = String(process.env.RDL_R3_E2E_PHOTO_PATH || '').trim();
const r4BackupPath = String(process.env.RDL_R4_E2E_BACKUP_PATH || '').trim();
const r4ReviewPath = String(process.env.RDL_R4_E2E_REVIEW_PATH || '').trim();

function resolveInsideIsolatedProfile(candidate, label, { mustExist = false } = {}) {
  if (!candidate) return '';
  const resolved = path.resolve(candidate);
  const localAppData = process.env.LOCALAPPDATA ? path.resolve(process.env.LOCALAPPDATA) : '';
  const relative = localAppData ? path.relative(localAppData, resolved) : '..';
  const insideIsolatedProfile = Boolean(localAppData)
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);

  if (!insideIsolatedProfile) {
    throw new Error(`${label} E2E refusé : le chemin doit rester dans le profil LOCALAPPDATA isolé.`);
  }
  if (mustExist && (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())) {
    throw new Error(`${label} E2E refusé : fichier absent.`);
  }
  return resolved;
}

const resolvedPhotoFixture = resolveInsideIsolatedProfile(photoFixture, 'R3', { mustExist: Boolean(photoFixture) });
const resolvedR4BackupPath = resolveInsideIsolatedProfile(r4BackupPath, 'R4 sauvegarde');
const resolvedR4ReviewPath = resolveInsideIsolatedProfile(r4ReviewPath, 'R4 revue');

if (resolvedPhotoFixture || resolvedR4BackupPath || resolvedR4ReviewPath) {
  const originalShowOpenDialog = dialog.showOpenDialog.bind(dialog);
  const originalShowSaveDialog = dialog.showSaveDialog.bind(dialog);

  dialog.showOpenDialog = async (...args) => {
    const options = args.length > 1 ? args[1] : args[0];
    if (resolvedPhotoFixture && options?.title === 'Ajouter une photo JPEG') {
      return { canceled: false, filePaths: [resolvedPhotoFixture] };
    }
    if (resolvedR4BackupPath && options?.title === 'Choisir une sauvegarde chiffrée à restaurer') {
      if (!fs.existsSync(resolvedR4BackupPath) || !fs.statSync(resolvedR4BackupPath).isFile()) {
        throw new Error('R4 restauration E2E refusée : sauvegarde chiffrée absente.');
      }
      return { canceled: false, filePaths: [resolvedR4BackupPath] };
    }
    return originalShowOpenDialog(...args);
  };

  dialog.showSaveDialog = async (...args) => {
    const options = args.length > 1 ? args[1] : args[0];
    if (resolvedR4BackupPath && options?.title === 'Exporter une sauvegarde chiffrée') {
      return { canceled: false, filePath: resolvedR4BackupPath };
    }
    if (resolvedR4ReviewPath && options?.title === 'Enregistrer le dossier de revue des droits') {
      return { canceled: false, filePath: resolvedR4ReviewPath };
    }
    return originalShowSaveDialog(...args);
  };

  if (resolvedPhotoFixture) console.log('RDL_R3_E2E_DIALOG_ADAPTER_ENABLED');
  if (resolvedR4BackupPath || resolvedR4ReviewPath) console.log('RDL_R4_E2E_DIALOG_ADAPTER_ENABLED');
}
