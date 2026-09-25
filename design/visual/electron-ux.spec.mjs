import { chromium, test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXECUTABLE = path.resolve(HERE, '../../dist/win-unpacked/Respect des Lieux PRO.exe');
const DEBUG_PORT = 9223;
const ENDPOINT = `http://127.0.0.1:${DEBUG_PORT}`;

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcess(child) {
  if (child?.pid && child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
}

async function waitForRendererTarget(processLog) {
  let lastError = null;
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try {
      const response = await fetch(`${ENDPOINT}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page' && String(item.url || '').includes('/renderer/index.html'));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Cible renderer Electron introuvable: ${lastError?.message || 'aucune page publiée'}\n${processLog()}`);
}

async function waitForPage(browser) {
  const context = browser.contexts()[0];
  if (!context) throw new Error('Contexte Chromium du binaire Electron introuvable');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const page = context.pages().find((candidate) => candidate.url().includes('/renderer/index.html'));
    if (page) return page;
    await delay(100);
  }
  throw new Error('Page renderer Electron absente après connexion CDP');
}

test('packaged production UX — dialog exits, repair edit and unclipped summary', async ({}, testInfo) => {
  test.setTimeout(90_000);
  expect(fs.existsSync(EXECUTABLE), `Exécutable empaqueté absent: ${EXECUTABLE}`).toBe(true);

  let output = '';
  const child = spawn(EXECUTABLE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--remote-allow-origins=*',
    '--force-device-scale-factor=1'
  ], {
    env: { ...process.env, RDL_VISUAL_TEST: '0', RDL_PACKAGED_SMOKE: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { output += chunk.toString(); });

  let browser = null;
  try {
    await waitForRendererTarget(() => output);
    browser = await chromium.connectOverCDP(ENDPOINT, { timeout: 10_000 });
    const page = await waitForPage(browser);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => Boolean(window.rdl) && document.readyState === 'complete');

    const stamp = Date.now();
    const lieu = `UX Gate ${stamp}`;
    const initialMeasure = `Mesure UX ${stamp}`;
    const updatedMeasure = `Mesure UX modifiée ${stamp}`;

    const seeded = await page.evaluate(async ({ lieu, initialMeasure }) => {
      const signalement = await window.rdl.createSignalement({
        date: '2026-09-25',
        heure: '08:30',
        lieu,
        type: 'Test UX',
        gravite: 'Mineure',
        description: 'Dossier artificiel du gate CI uniquement.'
      });
      const repair = await window.rdl.createReparation({
        signalement_id: signalement.id,
        mesure: initialMeasure,
        referent: 'Gate CI',
        debut: '2026-09-25',
        duree: '1 heure',
        notes: 'Créée par le gate UX',
        statut: 'En cours'
      });
      return { signalementId: signalement.id, signalementNum: signalement.num, repairId: repair.id };
    }, { lieu, initialMeasure });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.rdl) && document.readyState === 'complete');
    await delay(500);

    // 1) La fiche doit pouvoir être quittée au clic, sans dépendre d'Échap.
    await page.locator('#vf-dashboard .vf-nav-item[data-view="signalements"]').click();
    await expect(page.locator('#view-signalements')).toHaveClass(/active/);
    const signalRow = page.locator('#signalements-body tr').filter({ hasText: lieu }).first();
    await expect(signalRow).toBeVisible();
    await expect(signalRow.locator('[data-fiche]')).toBeVisible({ timeout: 5000 });
    await signalRow.locator('[data-fiche]').click();

    const detail = page.locator('#signal-detail-dialog');
    await expect(detail).toHaveJSProperty('open', true);
    const closeTop = detail.locator('.detail-header [data-detail-close]');
    await expect(closeTop).toBeVisible();

    // 2) Le bandeau sombre ne doit masquer ni lieu ni date.
    const summaryGeometry = await page.evaluate(() => {
      const summary = document.querySelector('#signal-detail-dialog .detail-summary');
      const title = summary?.querySelector('h3');
      const date = summary?.querySelector('p');
      if (!summary || !title || !date) return null;
      const s = summary.getBoundingClientRect();
      const t = title.getBoundingClientRect();
      const d = date.getBoundingClientRect();
      return {
        summaryHeight: s.height,
        titleText: title.textContent.trim(),
        dateText: date.textContent.trim(),
        titleInside: t.top >= s.top && t.bottom <= s.bottom,
        dateInside: d.top >= s.top && d.bottom <= s.bottom,
        titleVisible: getComputedStyle(title).visibility !== 'hidden' && getComputedStyle(title).opacity !== '0'
      };
    });
    expect(summaryGeometry).not.toBeNull();
    expect(summaryGeometry.summaryHeight).toBeGreaterThanOrEqual(100);
    expect(summaryGeometry.titleText).toBe(lieu);
    expect(summaryGeometry.titleInside).toBe(true);
    expect(summaryGeometry.dateInside).toBe(true);
    expect(summaryGeometry.titleVisible).toBe(true);

    const detailShot = testInfo.outputPath('production-detail-open.png');
    await page.screenshot({ path: detailShot, fullPage: false });
    await testInfo.attach('production-detail-open', { path: detailShot, contentType: 'image/png' });

    await closeTop.click();
    await expect(detail).toHaveJSProperty('open', false);

    // Deuxième sortie indépendante : bouton Fermer du footer.
    await signalRow.locator('[data-fiche]').click();
    await expect(detail).toHaveJSProperty('open', true);
    await detail.locator('.detail-footer [data-detail-close]').click();
    await expect(detail).toHaveJSProperty('open', false);

    // 3) Une réparation existante doit être éditable depuis la vraie vue Réparations.
    await page.locator('#vf-dashboard .vf-nav-item[data-view="reparations"]').click();
    await expect(page.locator('#view-reparations')).toHaveClass(/active/);
    const repairRow = page.locator('#reparations-body tr').filter({ hasText: initialMeasure }).first();
    await expect(repairRow).toBeVisible();
    const editButton = repairRow.locator('[data-edit-repair]');
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    const repairDialog = page.locator('#repair-dialog');
    await expect(repairDialog).toHaveJSProperty('open', true);
    await expect(repairDialog.locator('h2')).toHaveText('Modifier la réparation');
    await repairDialog.locator('[name="mesure"]').fill(updatedMeasure);
    await repairDialog.locator('[name="statut"]').selectOption({ label: 'Terminée' });
    await repairDialog.locator('footer .btn.primary').click();
    await expect(repairDialog).toHaveJSProperty('open', false);

    await expect.poll(async () => page.evaluate(async (id) => {
      const rows = await window.rdl.listReparations(1000);
      const row = rows.find((item) => Number(item.id) === Number(id));
      return row ? { mesure: row.mesure, statut: row.statut } : null;
    }, seeded.repairId), { timeout: 7000 }).toEqual({ mesure: updatedMeasure, statut: 'Terminée' });

    const repairShot = testInfo.outputPath('production-repair-edited.png');
    await page.screenshot({ path: repairShot, fullPage: false });
    await testInfo.attach('production-repair-edited', { path: repairShot, contentType: 'image/png' });

    console.log(`RDL_UX_GATE_PASS ${JSON.stringify({ ...seeded, summaryGeometry })}`);
  } finally {
    await testInfo.attach('production-ux-process-log', {
      body: Buffer.from(output || '(aucune sortie processus)', 'utf8'),
      contentType: 'text/plain'
    });
    try { await browser?.close(); } catch {}
    stopProcess(child);
  }
});
