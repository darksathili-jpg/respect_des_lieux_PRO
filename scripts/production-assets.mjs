import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('renderer/assets/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

export function assetName(role) {
  const value = manifest?.roles?.[role];
  if (!value || typeof value !== 'string') throw new Error(`Asset role missing: ${role}`);
  return value;
}

export function assetPath(role) {
  return path.posix.join('renderer/assets', assetName(role));
}

export function assetSha256(role) {
  const key = `${role}Sha256`;
  const value = manifest?.integrity?.[key];
  if (!value || typeof value !== 'string') throw new Error(`Asset integrity missing: ${role}`);
  return value;
}

export { manifest };
