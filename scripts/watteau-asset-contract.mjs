import fs from 'node:fs';
import crypto from 'node:crypto';

const manifestPath = 'renderer/assets/watteau-assets-manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

if (manifest.contract !== 'R3-WATTEAU-VISUAL-RECOVERY-1') {
  failures.push(`Contrat visuel inattendu: ${manifest.contract}`);
}

for (const asset of manifest.assets || []) {
  if (!fs.existsSync(asset.path)) {
    failures.push(`Asset Watteau absent: ${asset.path}`);
    continue;
  }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(asset.path)).digest('hex');
  if (digest !== asset.sha256) {
    failures.push(`Asset Watteau modifié sans qualification: ${asset.path}\n  attendu ${asset.sha256}\n  obtenu  ${digest}`);
  }
}

const homeCss = fs.readFileSync('renderer/home.css', 'utf8');
const layoutCss = fs.readFileSync('renderer/layout.css', 'utf8');
if (!homeCss.includes("url('./assets/watteau-home-hero.webp')")) {
  failures.push('Le hero canonique Watteau n’est pas branché dans renderer/home.css.');
}
if (!layoutCss.includes("url('./assets/watteau-sidebar-mark.webp')")) {
  failures.push('La marque sidebar canonique Watteau n’est pas branchée dans renderer/layout.css.');
}

const expectedPalette = ['#0A3B63', '#B6292E', '#F6E7D8', '#FFFFFF', '#8CA3B8'];
const paletteValues = Object.values(manifest.palette || {}).map((value) => String(value).toUpperCase());
for (const color of expectedPalette) {
  if (!paletteValues.includes(color)) failures.push(`Couleur de référence absente du manifest: ${color}`);
}

if (failures.length) {
  console.error('\nWATTEAU VISUAL CONTRACT — ECHEC\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`WATTEAU_VISUAL_CONTRACT_PASS ${manifest.assets.length} assets canoniques vérifiés`);
