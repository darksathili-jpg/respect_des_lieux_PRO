// Charge les extensions métier persistantes avant le bootstrap Electron.
// Ce point d'entrée permet d'ajouter des capacités sans coupler davantage main.cjs.
require('./src/reparation-edit-extension.cjs');
require('./main-bootstrap.cjs');
