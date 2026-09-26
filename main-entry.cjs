// Charge les extensions persistantes avant le bootstrap Electron.
// L’adaptateur E2E est strictement inerte hors environnement de qualification R3.
require('./src/e2e-native-dialog-adapter.cjs');
require('./src/reparation-edit-extension.cjs');
require('./main-bootstrap.cjs');
