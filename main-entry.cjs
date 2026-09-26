// Charge uniquement les adaptateurs de qualification avant le bootstrap Electron.
// L’adaptateur E2E est strictement inerte hors environnement de qualification R3/R4.
require('./src/e2e-native-dialog-adapter.cjs');
require('./main-bootstrap.cjs');
