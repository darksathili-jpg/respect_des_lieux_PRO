import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const port = Number(arg('--port', '9444'));
const outDir = path.resolve(arg('--out', 'artifacts/r3-packaged-e2e'));
const fixturePath = path.resolve(arg('--fixture', path.join(outDir, 'fixture.json')));
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = { format: 1, startedAt: new Date().toISOString(), fixture, steps: [] };

function record(name, detail = {}) {
  evidence.steps.push({ name, at: new Date().toISOString(), ...detail });
  console.log(`R3_E2E_STEP ${name} ${JSON.stringify(detail)}`);
}

async function discoverTarget() {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  let lastError = null;
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`Renderer CDP introuvable: ${lastError?.message || 'timeout'}`);
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connexion CDP expirée')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Connexion CDP impossible')); }, { once: true });
    });
    this.socket.addEventListener('message', async (event) => {
      let text;
      if (typeof event.data === 'string') text = event.data;
      else if (event.data instanceof ArrayBuffer) text = Buffer.from(event.data).toString('utf8');
      else if (typeof event.data?.arrayBuffer === 'function') text = Buffer.from(await event.data.arrayBuffer()).toString('utf8');
      else text = String(event.data || '');
      let payload;
      try { payload = JSON.parse(text); } catch { return; }
      if (!payload.id || !this.pending.has(payload.id)) return;
      const item = this.pending.get(payload.id);
      clearTimeout(item.timer);
      this.pending.delete(payload.id);
      if (payload.error) item.reject(new Error(`${payload.error.message || 'Erreur CDP'} (${payload.error.code || '?'})`));
      else item.resolve(payload.result || {});
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Commande CDP expirée: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.socket?.close(); } catch {} }
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(`Exception renderer: ${response.exceptionDetails.text || 'inconnue'}`);
  return response.result?.value;
}

async function waitFor(cdp, expression, label, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(cdp, expression);
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await wait(120);
  }
  throw new Error(`Attente expirée: ${label}; dernière valeur=${JSON.stringify(last)}`);
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`Contrôle introuvable: ${selector}`);
}

async function fill(cdp, selector, value) {
  const ok = await evaluate(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Champ introuvable: ${selector}`);
}

async function screenshot(cdp, name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(shot.data || '', 'base64');
  const file = path.join(outDir, name);
  fs.writeFileSync(file, bytes);
  if (bytes.length < 5000) throw new Error(`Capture trop petite: ${name}`);
  return { file: name, bytes: bytes.length };
}

function startNativeFilePicker(photoPath) {
  const ps = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$root = [System.Windows.Automation.AutomationElement]::RootElement
$titleCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Ajouter une photo JPEG')
$deadline = (Get-Date).AddSeconds(20)
$window = $null
while ((Get-Date) -lt $deadline -and -not $window) {
  $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $titleCondition)
  if (-not $window) { Start-Sleep -Milliseconds 120 }
}
if (-not $window) { Write-Error 'Boîte de dialogue Ajouter une photo JPEG introuvable'; exit 17 }
Write-Output ('DIALOG ' + $window.Current.Name + ' class=' + $window.Current.ClassName)
function Find-ByAutomationId($parent, $id) {
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id)
  return $parent.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Find-EnabledValueControl($parent) {
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
  $items = $parent.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  for ($i = $items.Count - 1; $i -ge 0; $i--) {
    $candidate = $items.Item($i)
    if (-not $candidate.Current.IsEnabled) { continue }
    try { $null = $candidate.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); return $candidate } catch {}
  }
  return $null
}
$fileControl = Find-ByAutomationId $window '1148'
if ($fileControl -and $fileControl.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit) {
  $editCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
  $nested = $fileControl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
  if ($nested) { $fileControl = $nested }
}
if (-not $fileControl) { $fileControl = Find-EnabledValueControl $window }
if (-not $fileControl) {
  $all = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($item in $all) {
    if ($item.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -or $item.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button) {
      Write-Output ('CONTROL type=' + $item.Current.ControlType.ProgrammaticName + ' name=' + $item.Current.Name + ' id=' + $item.Current.AutomationId)
    }
  }
  Write-Error 'Champ nom de fichier introuvable'; exit 18
}
try {
  $valuePattern = $fileControl.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  $valuePattern.SetValue($env:RDL_E2E_PHOTO_PATH)
} catch {
  $fileControl.SetFocus()
  Set-Clipboard -Value $env:RDL_E2E_PHOTO_PATH
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait('^v')
}
Write-Output ('FILE_CONTROL name=' + $fileControl.Current.Name + ' id=' + $fileControl.Current.AutomationId)
Start-Sleep -Milliseconds 250
$openButton = Find-ByAutomationId $window '1'
if (-not $openButton -or $openButton.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button) {
  $buttonCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
  $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
  foreach ($button in $buttons) {
    Write-Output ('BUTTON name=' + $button.Current.Name + ' id=' + $button.Current.AutomationId)
    if ($button.Current.Name -match '^(Open|Ouvrir)$') { $openButton = $button; break }
  }
}
if (-not $openButton) { Write-Error 'Bouton Open/Ouvrir introuvable'; exit 19 }
$invoke = $openButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
$invoke.Invoke()
Write-Output ('OPEN_BUTTON name=' + $openButton.Current.Name + ' id=' + $openButton.Current.AutomationId)
Start-Sleep -Milliseconds 500
exit 0
`;
  return spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RDL_E2E_PHOTO_PATH: photoPath }
  });
}

async function waitChild(child, label) {
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { child.kill(); } catch {} reject(new Error(`${label}: timeout`)); }, 25000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (value) => { clearTimeout(timer); resolve(value); });
  });
  fs.writeFileSync(path.join(outDir, 'native-file-picker.log'), `exit=${code}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`, 'utf8');
  if (code !== 0) throw new Error(`${label}: code ${code}; stdout=${stdout}; stderr=${stderr}`);
}

async function queryTotal(cdp, query = '') {
  return evaluate(cdp, `window.rdl.querySignalements({ query: ${JSON.stringify(query)}, limit: 1, offset: 0, includeIdentities: false }).then(r => r.total)`);
}

const target = await discoverTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.connect();
try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900, positionX: 0, positionY: 0, dontSetVisibleSize: false });
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.shellReady === 'true'`, 'shell prête');
  const baselineTotal = await queryTotal(cdp);
  if (baselineTotal !== fixture.seededSignalements) throw new Error(`Fixture inattendue: ${baselineTotal} dossiers au lieu de ${fixture.seededSignalements}`);
  record('fixture-loaded', { total: baselineTotal });
  await click(cdp, '#app-shell .nav[data-view="signalements"]');
  await waitFor(cdp, `document.querySelector('#app-shell')?.dataset.activeView === 'signalements'`, 'vue Signalements');
  await click(cdp, '#new-signalement');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open === true`, 'dialog création ouvert');
  await click(cdp, '#signal-dialog [data-signal-cancel]');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open === false`, 'dialog fermé par contrôle visible');
  const afterCancel = await queryTotal(cdp);
  const focusAfterCancel = await evaluate(cdp, `document.activeElement?.id || ''`);
  if (afterCancel !== baselineTotal) throw new Error('Annulation a écrit dans la base.');
  if (focusAfterCancel !== 'new-signalement') throw new Error(`Focus non restitué après annulation: ${focusAfterCancel}`);
  record('cancel-create-without-write', { total: afterCancel, focus: focusAfterCancel });
  await click(cdp, '#new-signalement');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open === true`, 'dialog création réouvert');
  await fill(cdp, '#signal-form [name="date"]', '2026-09-25');
  await fill(cdp, '#signal-form [name="heure"]', '14:30');
  await fill(cdp, '#signal-form [name="lieu"]', fixture.createLieu);
  await fill(cdp, '#signal-form [name="type"]', 'Dégradation test E2E');
  await fill(cdp, '#signal-form [name="gravite"]', 'Mineure');
  await fill(cdp, '#signal-form [name="description"]', 'Création contrôlée depuis le véritable renderer empaqueté.');
  await click(cdp, '#save-signalement');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open === false`, 'création terminée');
  const createdRows = await evaluate(cdp, `window.rdl.querySignalements({ query: ${JSON.stringify(fixture.createLieu)}, limit: 20, offset: 0, includeIdentities: false }).then(r => r.rows)`);
  if (!Array.isArray(createdRows) || createdRows.length !== 1) throw new Error(`Création non retrouvée: ${JSON.stringify(createdRows)}`);
  const created = createdRows[0];
  record('create', { id: created.id, num: created.num, lieu: created.lieu });
  await fill(cdp, '#signal-search', fixture.createLieu);
  await waitFor(cdp, `document.querySelector('#signalements-body')?.innerText.includes(${JSON.stringify(fixture.createLieu)})`, 'résultat créé visible');
  await click(cdp, `#signalements-body button[data-fiche-id="${created.id}"]`);
  await waitFor(cdp, `document.querySelector('#signal-detail-dialog')?.open === true`, 'fiche détaillée ouverte');
  const detailTitle = await evaluate(cdp, `document.querySelector('#signal-detail-title')?.textContent || ''`);
  if (!detailTitle.includes(created.num)) throw new Error(`Titre fiche incohérent: ${detailTitle}`);
  record('consult-detail', { title: detailTitle });
  await click(cdp, '#signal-detail-dialog [data-edit-signalement]');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open === true && document.querySelector('#signal-dialog')?.dataset.mode === 'edit'`, 'éditeur Signalement ouvert');
  await fill(cdp, '#signal-form [name="lieu"]', fixture.editedLieu);
  await fill(cdp, '#signal-form [name="description"]', 'Description modifiée par le gate R3 E2E.');
  await click(cdp, '#save-signalement');
  await waitFor(cdp, `document.querySelector('#signal-dialog')?.open === false`, 'édition terminée');
  const editedDetail = await evaluate(cdp, `window.rdl.getSignalementDetail(${created.id})`);
  if (editedDetail?.signalement?.lieu !== fixture.editedLieu) throw new Error('Modification non persistée.');
  record('edit', { lieu: editedDetail.signalement.lieu });
  await fill(cdp, '#signal-search', fixture.editedLieu);
  await waitFor(cdp, `document.querySelector('#signalements-body')?.innerText.includes(${JSON.stringify(fixture.editedLieu)})`, 'ligne modifiée visible');
  const picker = startNativeFilePicker(fixture.fixturePhoto);
  await click(cdp, `#signalements-body button[data-photo="${created.id}"]`);
  await waitChild(picker, 'sélection native de photo');
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d => d.photos.length === 1)`, 'photo ajoutée', 15000);
  const withPhoto = await evaluate(cdp, `window.rdl.getSignalementDetail(${created.id})`);
  const photoId = withPhoto.photos[0]?.id;
  if (!photoId) throw new Error('Photo ajoutée sans identifiant exploitable.');
  record('attach-photo-native-dialog', { photoId, photoCount: withPhoto.photos.length });
  await click(cdp, `#signalements-body button[data-fiche-id="${created.id}"]`);
  await waitFor(cdp, `document.querySelector('#signal-detail-dialog')?.open === true`, 'fiche ouverte pour retrait photo');
  await evaluate(cdp, `(() => { window.__r3OriginalConfirm = window.confirm; window.__r3ConfirmCount = 0; window.confirm = () => { window.__r3ConfirmCount += 1; return true; }; return true; })()`);
  await click(cdp, `#signal-detail-dialog [data-detail-remove-photo="${photoId}"]`);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d => d.photos.length === 0)`, 'photo retirée');
  const confirmCount = await evaluate(cdp, `window.__r3ConfirmCount || 0`);
  await evaluate(cdp, `(() => { if (window.__r3OriginalConfirm) window.confirm = window.__r3OriginalConfirm; delete window.__r3OriginalConfirm; return true; })()`);
  if (confirmCount !== 1) throw new Error(`Confirmation retrait photo non invoquée exactement une fois: ${confirmCount}`);
  record('remove-photo', { confirmCount });
  await click(cdp, '#signal-detail-dialog [data-detail-close]');
  await waitFor(cdp, `document.querySelector('#signal-detail-dialog')?.open === false`, 'fiche refermée');
  await fill(cdp, '#signal-search', fixture.editedLieu);
  await waitFor(cdp, `document.querySelector('#signalements-body [data-set-status="${created.id}"]') != null`, 'contrôle de statut visible');
  await click(cdp, `#signalements-body [data-set-status="${created.id}"]`);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d => d.signalement.statut === 'Clos')`, 'dossier clos');
  const closedDetail = await evaluate(cdp, `window.rdl.getSignalementDetail(${created.id})`);
  if (!closedDetail.signalement.closed_at) throw new Error('Clôture sans closed_at.');
  await waitFor(cdp, `document.querySelector('#signalements-body [data-edit-signalement="${created.id}"]')?.disabled === true`, 'édition verrouillée sur dossier clos');
  record('close', { closedAt: closedDetail.signalement.closed_at });
  await click(cdp, `#signalements-body [data-set-status="${created.id}"]`);
  await waitFor(cdp, `window.rdl.getSignalementDetail(${created.id}).then(d => d.signalement.statut === 'Ouvert')`, 'dossier rouvert');
  await waitFor(cdp, `document.querySelector('#signalements-body [data-edit-signalement="${created.id}"]')?.disabled === false`, 'édition réactivée après réouverture');
  record('reopen');
  await fill(cdp, '#signal-search', fixture.deepSearchTerm);
  await waitFor(cdp, `document.querySelector('#signalements-body')?.innerText.includes(${JSON.stringify(fixture.deepSearchTerm)})`, 'recherche au-delà du 500e dossier');
  const deepUi = await evaluate(cdp, `(() => ({ text: document.querySelector('#signalements-body')?.innerText || '', page: document.querySelector('#signal-page')?.textContent || '' }))()`);
  if (!deepUi.text.includes('2025-0001')) throw new Error(`La ligne profonde attendue n'est pas celle de la fixture: ${deepUi.text}`);
  record('search-beyond-500', { page: deepUi.page, num: '2025-0001' });
  const shot = await screenshot(cdp, 'r3-signalements-final.png');
  record('screenshot', shot);
  evidence.finishedAt = new Date().toISOString();
  evidence.ok = true;
  fs.writeFileSync(path.join(outDir, 'r3-e2e-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`R3_PACKAGED_E2E_PASS ${JSON.stringify({ createdId: created.id, createdNum: created.num, steps: evidence.steps.length, screenshot: shot })}`);
} catch (error) {
  evidence.finishedAt = new Date().toISOString();
  evidence.ok = false;
  evidence.error = error?.stack || error?.message || String(error);
  try { await screenshot(cdp, 'r3-signalements-failure.png'); } catch {}
  fs.writeFileSync(path.join(outDir, 'r3-e2e-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
  throw error;
} finally {
  try { await cdp.send('Emulation.clearDeviceMetricsOverride'); } catch {}
  cdp.close();
}
