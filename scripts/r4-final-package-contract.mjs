import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const EXPECTED = Object.freeze({
  hero: { file: 'watteau-home-hero.webp', sha256: '94b4c5b7b2d6709c9e76fba990416c977828473c86dbc80ffcb09eb72014a8fe' },
  sidebar: { file: 'watteau-sidebar-mark.webp', sha256: '28fd7a88f4918331c550ba06ebe1164cda9ac1fd0b7c422c7668477ff7b327e5' },
  primaryLogo: { file: 'watteau-logo-primary.webp', sha256: '55c952af9ac0e60afc7a6511520dfcf47eda54d4d84a88aed0f39d89c0ecb2e2' },
  appIcon: { file: 'watteau-app-icon-256.png', sha256: '9cc1a92aea0c7cd192ec5995e44c68831eb5f0c48a31709c1b56dac7d600fba7' }
});

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readExtracted(root, relativePath) {
  const filePath = path.join(root, ...relativePath.split('/'));
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`Fichier ASAR illisible ${relativePath}: ${error.message}`);
  }
}

export function verifyFinalPackage({ archivePath = path.resolve('dist/win-unpacked/resources/app.asar') } = {}) {
  const archive = path.resolve(archivePath);
  if (!fs.existsSync(archive)) throw new Error(`ASAR final absent: ${archive}`);

  const files = asar.listPackage(archive).map((entry) => entry.replace(/^[/\\]+/, '').replace(/\\/g, '/'));
  const required = [
    'renderer/styles.css',
    'renderer/admin.css',
    'renderer/assets/manifest.json',
    ...Object.values(EXPECTED).map(({ file }) => `renderer/assets/${file}`)
  ];
  const forbidden = [
    'renderer/dashboard-vf.css',
    'renderer/assets/dashboard-hero-master.webp',
    'renderer/assets/sidebar-logo-master.webp',
    'design/reference/dashboard-master.png',
    'src/reparation-edit-extension.cjs'
  ];
  const missing = required.filter((file) => !files.includes(file));
  const leaked = forbidden.filter((file) => files.includes(file));
  if (missing.length) throw new Error(`ASAR final incomplet: ${JSON.stringify(missing)}`);
  if (leaked.length) throw new Error(`ASAR final contient des éléments interdits: ${JSON.stringify(leaked)}`);

  const extractedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rdl-r4-final-asar-'));
  try {
    asar.extractAll(archive, extractedRoot);

    const manifest = JSON.parse(readExtracted(extractedRoot, 'renderer/assets/manifest.json').toString('utf8'));
    if (Number(manifest.schemaVersion) !== 3) throw new Error(`Manifest assets inattendu: schemaVersion=${manifest.schemaVersion}`);

    const integrityKeys = {
      hero: 'heroSha256',
      sidebar: 'sidebarSha256',
      primaryLogo: 'primaryLogoSha256',
      appIcon: 'appIconSha256'
    };
    const verifiedAssets = {};
    for (const [role, expected] of Object.entries(EXPECTED)) {
      if (manifest.roles?.[role] !== expected.file) {
        throw new Error(`Rôle asset ${role} divergent: ${manifest.roles?.[role]} != ${expected.file}`);
      }
      if (manifest.integrity?.[integrityKeys[role]] !== expected.sha256) {
        throw new Error(`Hash déclaré divergent pour ${role}.`);
      }
      const actual = hash(readExtracted(extractedRoot, `renderer/assets/${expected.file}`));
      if (actual !== expected.sha256) throw new Error(`Hash binaire ASAR divergent pour ${role}: ${actual}`);
      verifiedAssets[role] = actual;
    }

    const styles = readExtracted(extractedRoot, 'renderer/styles.css').toString('utf8');
    if (!styles.includes("@import url('./admin.css')")) {
      throw new Error('La couche R4 admin.css n’est pas importée par renderer/styles.css dans le package.');
    }
    const adminCss = readExtracted(extractedRoot, 'renderer/admin.css');
    if (adminCss.length < 500) throw new Error(`renderer/admin.css anormalement petit dans l’ASAR (${adminCss.length} octets).`);

    const result = {
      archive,
      requiredFiles: required.length,
      adminCssBytes: adminCss.length,
      assets: verifiedAssets,
      forbiddenLeaks: leaked.length
    };
    console.log(`R4_FINAL_PACKAGE_CONTRACT_PASS ${JSON.stringify(result)}`);
    return result;
  } finally {
    fs.rmSync(extractedRoot, { recursive: true, force: true });
  }
}
