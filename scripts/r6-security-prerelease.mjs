import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

function fail(message, details = {}) {
  console.error(`R6_SECURITY_FAIL ${message} ${JSON.stringify(details)}`);
  process.exit(1);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assert(condition, message, details = {}) {
  if (!condition) fail(message, details);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function exactVersion(value) {
  return /^\d+\.\d+\.\d+$/.test(String(value || ''));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function sourceContract() {
  const pkg = JSON.parse(read('package.json'));
  const main = read('main.cjs');
  const preload = read('preload.cjs');
  const adapter = read('src/e2e-native-dialog-adapter.cjs');

  assert(pkg.private === true, 'package-not-private');
  assert(pkg.license === 'UNLICENSED', 'unexpected-license', { license: pkg.license });
  assert(pkg.main === 'main-entry.cjs', 'unexpected-main-entry', { main: pkg.main });
  assert(exactVersion(pkg.devDependencies?.electron), 'electron-not-pinned', { value: pkg.devDependencies?.electron });
  assert(exactVersion(pkg.devDependencies?.['electron-builder']), 'electron-builder-not-pinned', { value: pkg.devDependencies?.['electron-builder'] });

  const build = pkg.build || {};
  const fuses = build.electronFuses || {};
  const expectedFuses = {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true
  };
  assert(build.asar === true, 'asar-not-enabled');
  for (const [key, value] of Object.entries(expectedFuses)) {
    assert(fuses[key] === value, 'electron-fuse-drift', { key, expected: value, actual: fuses[key] });
  }
  assert(Array.isArray(build.win?.target) && build.win.target.includes('nsis'), 'nsis-target-missing');
  assert(build.nsis?.oneClick === false, 'nsis-oneclick-must-be-false');

  const mainRequirements = [
    'contextIsolation: true',
    'nodeIntegration: false',
    'sandbox: true',
    'webSecurity: true',
    "setWindowOpenHandler(() => ({ action: 'deny' }))",
    "will-attach-webview",
    "will-navigate",
    "session.defaultSession",
    "setPermissionRequestHandler",
    "setPermissionCheckHandler",
    "urls: ['http://*/*', 'https://*/*']",
    'assertTrustedIpc(event)',
    'event.senderFrame !== mainWindow.webContents.mainFrame',
    "url.startsWith('file://')"
  ];
  for (const needle of mainRequirements) {
    assert(main.includes(needle), 'electron-security-contract-missing', { needle });
  }

  const preloadForbidden = [
    'ipcRenderer.send(',
    'ipcRenderer.sendSync(',
    'ipcRenderer.sendTo(',
    'ipcRenderer.postMessage(',
    'ipcRenderer.on(',
    'ipcRenderer.once('
  ];
  for (const needle of preloadForbidden) {
    assert(!preload.includes(needle), 'preload-dangerous-primitive-exposed', { needle });
  }
  assert(preload.includes("contextBridge.exposeInMainWorld('rdl'"), 'preload-rdl-bridge-missing');
  assert(!preload.includes('openPath('), 'preload-arbitrary-open-path-forbidden');

  const preloadChannels = uniqueSorted([
    ...preload.matchAll(/ipcRenderer\.invoke\(\s*['\"]([^'\"]+)['\"]/g),
    ...preload.matchAll(/invokeExclusive\([^,]+,\s*['\"]([^'\"]+)['\"]/g)
  ].map((match) => match[1]));
  const mainChannels = uniqueSorted([...main.matchAll(/secureHandle\(\s*['\"]([^'\"]+)['\"]/g)].map((match) => match[1]));
  assert(preloadChannels.length > 0, 'preload-channel-list-empty');
  assert(JSON.stringify(preloadChannels) === JSON.stringify(mainChannels), 'ipc-surface-mismatch', { preloadChannels, mainChannels });

  assert(adapter.includes('process.env.LOCALAPPDATA'), 'e2e-adapter-not-confined');
  assert(adapter.includes('insideIsolatedProfile'), 'e2e-adapter-confinement-check-missing');
  assert(adapter.includes('RDL_R3_E2E_PHOTO_PATH'), 'e2e-r3-env-missing');
  assert(adapter.includes('RDL_R4_E2E_BACKUP_PATH'), 'e2e-r4-backup-env-missing');
  assert(adapter.includes('RDL_R4_E2E_REVIEW_PATH'), 'e2e-r4-review-env-missing');

  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const forbiddenNames = tracked.filter((name) => /(^|\/)(\.env($|\.)|.*\.(pem|p12|pfx|key))$/i.test(name));
  assert(forbiddenNames.length === 0, 'tracked-secret-file-forbidden', { forbiddenNames });

  const secretHits = [];
  const secretPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /AKIA[0-9A-Z]{16}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /ghp_[A-Za-z0-9]{30,}/
  ];
  for (const name of tracked) {
    if (name === 'scripts/r6-security-prerelease.mjs') continue;
    if (!/\.(?:js|cjs|mjs|json|ya?ml|html|css|md|txt)$/i.test(name)) continue;
    let text = '';
    try { text = read(name); } catch { continue; }
    if (secretPatterns.some((pattern) => pattern.test(text))) secretHits.push(name);
  }
  assert(secretHits.length === 0, 'tracked-secret-pattern-detected', { secretHits });

  const evidence = {
    version: pkg.version,
    electron: pkg.devDependencies.electron,
    electronBuilder: pkg.devDependencies['electron-builder'],
    ipcChannels: preloadChannels,
    ipcChannelCount: preloadChannels.length,
    fuses: expectedFuses,
    trackedFiles: tracked.length,
    secretHits: 0
  };
  fs.mkdirSync('artifacts/r6', { recursive: true });
  fs.writeFileSync('artifacts/r6/source-security.json', JSON.stringify(evidence, null, 2));
  console.log(`R6_SOURCE_SECURITY_PASS ${JSON.stringify(evidence)}`);
}

async function packageContract(asarPath) {
  assert(asarPath && fs.existsSync(asarPath), 'asar-missing', { asarPath });
  const asar = await import('@electron/asar');
  const entries = asar.listPackage(asarPath).map((entry) => String(entry).replace(/^[/\\]+/, '').replace(/\\/g, '/'));
  const forbiddenPrefixes = ['tests/', 'docs/', '.github/', 'design/', 'quality/', 'scripts/'];
  const forbiddenExact = ['README.md'];
  const forbiddenExtensions = /\.(?:pem|p12|pfx|key)$/i;
  const leaks = entries.filter((entry) => forbiddenPrefixes.some((prefix) => entry.startsWith(prefix)) || forbiddenExact.includes(entry) || forbiddenExtensions.test(entry) || /(^|\/)\.env($|\.)/i.test(entry));
  assert(leaks.length === 0, 'asar-forbidden-content', { leaks: leaks.slice(0, 30) });

  const required = ['package.json', 'main-entry.cjs', 'main-bootstrap.cjs', 'main.cjs', 'preload.cjs', 'renderer/index.html', 'renderer/styles.css', 'renderer/app.js', 'src/database.cjs'];
  const missing = required.filter((entry) => !entries.includes(entry));
  assert(missing.length === 0, 'asar-required-content-missing', { missing });

  const evidence = {
    asarPath: path.resolve(asarPath),
    asarSha256: sha256File(asarPath),
    entries: entries.length,
    forbiddenLeaks: leaks.length,
    requiredCount: required.length
  };
  fs.mkdirSync('artifacts/r6', { recursive: true });
  fs.writeFileSync('artifacts/r6/package-security.json', JSON.stringify(evidence, null, 2));
  console.log(`R6_PACKAGE_SECURITY_PASS ${JSON.stringify(evidence)}`);
}

function installerContract(installerPath) {
  assert(installerPath && fs.existsSync(installerPath), 'installer-missing', { installerPath });
  const bytes = fs.readFileSync(installerPath);
  assert(bytes.length >= 10 * 1024 * 1024, 'installer-unexpectedly-small', { bytes: bytes.length });
  assert(bytes[0] === 0x4d && bytes[1] === 0x5a, 'installer-not-pe-executable');
  const pkg = JSON.parse(read('package.json'));
  const expectedName = `Respect-des-Lieux-PRO-${pkg.version}-x64.exe`;
  assert(path.basename(installerPath) === expectedName, 'installer-name-drift', { expectedName, actual: path.basename(installerPath) });
  const evidence = {
    file: path.basename(installerPath),
    bytes: bytes.length,
    sha256: sha256File(installerPath),
    version: pkg.version,
    unsignedQualificationOnly: true
  };
  fs.mkdirSync('artifacts/r6', { recursive: true });
  fs.writeFileSync('artifacts/r6/installer.json', JSON.stringify(evidence, null, 2));
  console.log(`R6_INSTALLER_PASS ${JSON.stringify(evidence)}`);
}

const mode = process.argv[2] || 'source';
if (mode === 'source') sourceContract();
else if (mode === 'package') await packageContract(process.argv[3]);
else if (mode === 'installer') installerContract(process.argv[3]);
else fail('unknown-mode', { mode });
