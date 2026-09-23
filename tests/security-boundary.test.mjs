import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('frontière Electron : renderer isolé de Node', () => {
  const main = read('main.cjs');
  const preload = read('preload.cjs');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.doesNotMatch(preload, /service_role|sb_secret_/i);
});

test('renderer entièrement local : aucun backend cloud', () => {
  const html = read('renderer/index.html');
  const app = read('renderer/app.js');
  const css = read('renderer/styles.css');
  const runtime = `${html}\n${app}\n${css}`;
  assert.doesNotMatch(runtime, /supabase\.co|supabase|https?:\/\//i);
  assert.doesNotMatch(runtime, /\bfetch\s*\(/i);
  assert.doesNotMatch(runtime, /XMLHttpRequest|WebSocket|EventSource/);
  assert.match(html, /default-src 'self'/);
});

test('aucune donnée métier dans localStorage', () => {
  const runtime = `${read('renderer/app.js')}\n${read('preload.cjs')}`;
  assert.doesNotMatch(runtime, /localStorage|sessionStorage|indexedDB/);
});

test('garde-fous SQLite et photos présents', () => {
  const db = read('src/database.cjs');
  const storage = read('src/storage.cjs');
  assert.match(db, /journal_mode\s*=\s*WAL/i);
  assert.match(db, /synchronous\s*=\s*FULL/i);
  assert.match(db, /foreign_keys\s*=\s*ON/i);
  assert.match(db, /BEGIN IMMEDIATE/);
  assert.match(db, /PRAGMA quick_check/);
  assert.match(storage, /3 \* 1024 \* 1024/);
  assert.match(storage, /0xff.*0xd8.*0xff/s);
});
