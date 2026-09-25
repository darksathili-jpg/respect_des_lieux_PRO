const path = require('node:path');
const fs = require('node:fs');
const { dialog } = require('electron');

const fixture = String(process.env.RDL_R3_E2E_PHOTO_PATH || '').trim();

if (fixture) {
  const resolvedFixture = path.resolve(fixture);
  const localAppData = process.env.LOCALAPPDATA ? path.resolve(process.env.LOCALAPPDATA) : '';
  const relative = localAppData ? path.relative(localAppData, resolvedFixture) : '..';
  const insideIsolatedProfile = Boolean(localAppData)
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);

  if (!insideIsolatedProfile) {
    throw new Error('R3 E2E refusé : la fixture photo doit rester dans le profil LOCALAPPDATA isolé.');
  }
  if (!fs.existsSync(resolvedFixture) || !fs.statSync(resolvedFixture).isFile()) {
    throw new Error('R3 E2E refusé : fixture photo absente.');
  }

  const originalShowOpenDialog = dialog.showOpenDialog.bind(dialog);
  dialog.showOpenDialog = async (...args) => {
    const options = args.length > 1 ? args[1] : args[0];
    if (options?.title === 'Ajouter une photo JPEG') {
      return { canceled: false, filePaths: [resolvedFixture] };
    }
    return originalShowOpenDialog(...args);
  };

  console.log('RDL_R3_E2E_DIALOG_ADAPTER_ENABLED');
}
