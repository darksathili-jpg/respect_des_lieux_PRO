import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const EVIDENCE_DIR = 'artifacts/r6';
const ALLOWED_PACKAGE = 'http-cache-semantics';
const ALLOWED_ADVISORY = 'GHSA-ch52-4w7c-c8xp';
const ALLOWED_CVE = 'CVE-2026-93748';
const ALLOWED_MAX_VERSION = '4.2.0';

function fail(message, details = {}) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(`${EVIDENCE_DIR}/dependency-audit-policy.json`, JSON.stringify({ pass: false, message, ...details }, null, 2));
  console.error(`R6_DEPENDENCY_AUDIT_FAIL ${message} ${JSON.stringify(details)}`);
  process.exit(1);
}

function versionTuple(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  const left = versionTuple(a);
  const right = versionTuple(b);
  if (!left || !right) return NaN;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function advisoryText(vulnerability) {
  return JSON.stringify(vulnerability?.via || []);
}

const auditRun = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024
});

let audit;
try {
  audit = JSON.parse(auditRun.stdout || '{}');
} catch (error) {
  fail('npm-audit-json-invalid', { status: auditRun.status, stderr: auditRun.stderr, parseError: String(error) });
}

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(`${EVIDENCE_DIR}/npm-audit.json`, JSON.stringify(audit, null, 2));

const vulnerabilities = Object.values(audit.vulnerabilities || {});
const severe = vulnerabilities.filter((item) => ['high', 'critical'].includes(String(item?.severity || '').toLowerCase()));
const unexpected = severe.filter((item) => item?.name !== ALLOWED_PACKAGE);
if (unexpected.length > 0) {
  fail('unexpected-high-or-critical-vulnerability', {
    vulnerabilities: unexpected.map((item) => ({ name: item.name, severity: item.severity, range: item.range }))
  });
}

const allowed = severe.filter((item) => item?.name === ALLOWED_PACKAGE);
if (allowed.length > 1) fail('duplicate-known-advisory', { count: allowed.length });

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const lockEntry = lock.packages?.['node_modules/http-cache-semantics'];
if (!lockEntry) fail('known-advisory-lock-entry-missing');
if (lockEntry.dev !== true) fail('known-advisory-not-dev-only', { lockEntry });
if (!versionTuple(lockEntry.version) || compareVersions(lockEntry.version, ALLOWED_MAX_VERSION) > 0) {
  fail('known-advisory-version-policy-drift', { version: lockEntry.version, allowedMaxVersion: ALLOWED_MAX_VERSION });
}

const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (rootPackage.dependencies?.[ALLOWED_PACKAGE] || rootPackage.optionalDependencies?.[ALLOWED_PACKAGE]) {
  fail('known-advisory-declared-as-runtime-dependency');
}

let exception = null;
if (allowed.length === 1) {
  const item = allowed[0];
  const text = advisoryText(item);
  if (!text.includes(ALLOWED_ADVISORY) && !text.includes(ALLOWED_CVE)) {
    fail('known-package-advisory-identity-drift', { via: item.via });
  }
  exception = {
    package: ALLOWED_PACKAGE,
    severity: item.severity,
    installedVersion: lockEntry.version,
    advisory: ALLOWED_ADVISORY,
    cve: ALLOWED_CVE,
    scope: 'dev-only',
    patchedVersionAvailable: false,
    runtimeAcceptance: false,
    qualification: 'temporary-upstream-unpatched-exception'
  };
}

const evidence = {
  pass: true,
  auditExitCode: auditRun.status,
  highOrCriticalCount: severe.length,
  unexpectedHighOrCriticalCount: 0,
  exception,
  invariant: 'Any high/critical vulnerability other than the exact dev-only upstream-unpatched advisory fails R6; the advisory is separately forbidden from packaged ASAR.'
};
fs.writeFileSync(`${EVIDENCE_DIR}/dependency-audit-policy.json`, JSON.stringify(evidence, null, 2));
console.log(`R6_DEPENDENCY_AUDIT_PASS ${JSON.stringify(evidence)}`);
