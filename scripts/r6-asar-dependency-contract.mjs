import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function fail(message, details = {}) {
  fs.mkdirSync('artifacts/r6', { recursive: true });
  fs.writeFileSync('artifacts/r6/asar-dependency-contract.json', JSON.stringify({ pass: false, message, ...details }, null, 2));
  console.error(`R6_ASAR_DEPENDENCY_FAIL ${message} ${JSON.stringify(details)}`);
  process.exit(1);
}

const asarPath = process.argv[2];
if (!asarPath || !fs.existsSync(asarPath)) fail('asar-missing', { asarPath });

const asar = await import('@electron/asar');
const entries = asar.listPackage(asarPath)
  .map((entry) => String(entry).replace(/^[/\\]+/, '').replace(/\\/g, '/'));

const nodeModuleEntries = entries.filter((entry) => entry === 'node_modules' || entry.startsWith('node_modules/'));
const vulnerableEntries = nodeModuleEntries.filter((entry) => entry === 'node_modules/http-cache-semantics' || entry.startsWith('node_modules/http-cache-semantics/'));

if (vulnerableEntries.length > 0) {
  fail('http-cache-semantics-present-in-runtime', { entries: vulnerableEntries.slice(0, 30) });
}

/* Respect des Lieux PRO has no runtime npm dependencies. Any node_modules entry in
   app.asar is therefore an unexpected production-surface expansion and fails closed. */
if (nodeModuleEntries.length > 0) {
  fail('unexpected-node-modules-in-runtime', { entries: nodeModuleEntries.slice(0, 30), count: nodeModuleEntries.length });
}

const evidence = {
  pass: true,
  asarPath: path.resolve(asarPath),
  totalEntries: entries.length,
  nodeModuleEntries: 0,
  httpCacheSemanticsEntries: 0,
  invariant: 'No npm node_modules are accepted in the packaged runtime ASAR.'
};
fs.mkdirSync('artifacts/r6', { recursive: true });
fs.writeFileSync('artifacts/r6/asar-dependency-contract.json', JSON.stringify(evidence, null, 2));
console.log(`R6_ASAR_DEPENDENCY_PASS ${JSON.stringify(evidence)}`);
