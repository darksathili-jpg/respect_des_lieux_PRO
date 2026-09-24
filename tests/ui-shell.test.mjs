import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/dashboard-vf.css', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8');

test('UI Phase C : le master reste isolé du responsive de production', () => {
  assert.match(preload, /visual-test-mode/);
  assert.match(css, /body:not\(\.visual-test-mode\)\.dashboard-mode/);
  assert.match(css, /min-width:0/);
  assert.match(css, /width:100vw/);
  assert.match(css, /height:100vh/);
});

test('UI Phase C : les vues métier conservent la nouvelle sidebar', () => {
  assert.match(css, /body:not\(\.visual-test-mode\):not\(\.dashboard-mode\)>#vf-dashboard/);
  assert.match(css, />\.shell>\.sidebar\{display:none!important\}/);
  assert.match(css, />#vf-dashboard \.vf-main\{display:none!important\}/);
  assert.match(css, />\.shell\{[\s\S]*left:var\(--vf-prod-sidebar\)/);
});

test('UI Phase C : le shell de production utilise les assets validés', () => {
  assert.match(css, /sidebar-logo-master\.webp/);
  assert.match(css, /dashboard-hero-master\.webp/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:1180px\)/);
  assert.match(css, /@media \(max-width:820px\)/);
});
