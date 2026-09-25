const { app, dialog } = require('electron');

// Interface administrative 2D : la désactivation de l'accélération matérielle
// réduit les surfaces Chromium blanches sur certains postes Windows anciens.
app.disableHardwareAcceleration();

const smokeMode = process.env.RDL_PACKAGED_SMOKE === '1';
const EXPECTED_VIEWS = Object.freeze([
  'dashboard',
  'signalements',
  'reparations',
  'sauvegardes',
  'confidentialite',
  'systeme'
]);
const EXPECTED_NAV_LABELS = Object.freeze([
  'Accueil',
  'Signalements',
  'Réparations',
  'Sauvegardes',
  'Protection des données',
  'Système local'
]);

let smokeFinished = false;
let fatalShown = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportFatal(title, detail) {
  const message = String(detail || 'Erreur inconnue');
  console.error(`[RDL] ${title}: ${message}`);
  if (!smokeMode && !fatalShown) {
    fatalShown = true;
    try {
      dialog.showErrorBox(
        `Respect des Lieux PRO — ${title}`,
        `${message}\n\nL'application n'a pas pu afficher correctement son interface. Cette erreur doit être signalée avant toute utilisation.`
      );
    } catch {}
  }
}

function failSmoke(reason, details = {}) {
  if (!smokeMode || smokeFinished) return;
  smokeFinished = true;
  console.error(`RDL_SMOKE_FAIL ${reason} ${JSON.stringify(details)}`);
  app.exit(86);
}

function paintProbe(nativeImage) {
  const bitmap = nativeImage.toBitmap();
  if (!bitmap || bitmap.length < 16) return { ok: false, range: 0, samples: 0 };

  const targetSamples = 2500;
  const pixelCount = Math.floor(bitmap.length / 4);
  const stepPixels = Math.max(1, Math.floor(pixelCount / targetSamples));
  const step = stepPixels * 4;
  let min = 765;
  let max = 0;
  let samples = 0;

  for (let i = 0; i + 2 < bitmap.length; i += step) {
    const sum = bitmap[i] + bitmap[i + 1] + bitmap[i + 2];
    min = Math.min(min, sum);
    max = Math.max(max, sum);
    samples += 1;
  }

  const range = max - min;
  return { ok: samples >= 20 && range >= 80, range, samples, min, max };
}

async function probeShell(win) {
  await delay(1800);
  return win.webContents.executeJavaScript(`(() => {
    const shells = [...document.querySelectorAll('#app-shell')];
    const shell = shells[0] || null;
    const mainRegions = [...document.querySelectorAll('#main-region')];
    const sidebar = shell?.querySelector(':scope > .sidebar') || null;
    const main = shell?.querySelector(':scope > .main') || null;
    const navButtons = [...(shell?.querySelectorAll('.nav[data-view]') || [])];
    const panels = [...(shell?.querySelectorAll('.view[data-view-panel]') || [])];
    const shellRect = shell?.getBoundingClientRect();
    const sidebarRect = sidebar?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const rootStyles = getComputedStyle(document.documentElement);
    const brandMark = document.querySelector('.brand-mark');
    const hero = document.querySelector('#view-dashboard .hero');
    const heroAfter = hero ? getComputedStyle(hero, '::after') : null;
    return {
      readyState: document.readyState,
      shellCount: shells.length,
      mainRegionCount: mainRegions.length,
      shellReady: shell?.dataset?.shellReady || '',
      shellWidth: shellRect?.width || 0,
      shellHeight: shellRect?.height || 0,
      viewportWidth: window.innerWidth || 0,
      layoutViewportWidth: document.documentElement?.clientWidth || 0,
      viewportHeight: window.innerHeight || 0,
      sidebarRight: sidebarRect?.right || 0,
      mainLeft: mainRect?.left || 0,
      navViews: navButtons.map((node) => node.dataset.view || ''),
      navLabels: navButtons.map((node) => (node.textContent || '').trim()),
      panelViews: panels.map((node) => node.dataset.viewPanel || ''),
      activeNav: navButtons.filter((node) => node.classList.contains('active')).map((node) => node.dataset.view || ''),
      activePanels: panels.filter((node) => node.classList.contains('active') && !node.hidden).map((node) => node.dataset.viewPanel || ''),
      hiddenPanels: panels.filter((node) => node.hidden).map((node) => node.dataset.viewPanel || ''),
      oldVisualShells: document.querySelectorAll('#vf-dashboard').length,
      title: document.querySelector('#page-title')?.textContent?.trim() || '',
      detailDialog: Boolean(document.querySelector('#signal-detail-dialog')),
      bodyTextLength: (document.body?.innerText || '').trim().length,
      documentScrollWidth: document.documentElement?.scrollWidth || 0,
      bodyScrollWidth: document.body?.scrollWidth || 0,
      designSystem: {
        ready: rootStyles.getPropertyValue('--rdl-ds-ready').trim(),
        focusRing: rootStyles.getPropertyValue('--rdl-focus').trim(),
        brandAsset: brandMark ? getComputedStyle(brandMark).backgroundImage : '',
        heroAsset: heroAfter?.backgroundImage || ''
      }
    };
  })()`);
}

function shellContractOk(dom) {
  // innerWidth inclut la gouttière du scrollbar vertical dans Chromium.
  // clientWidth représente la largeur de mise en page réellement disponible.
  const layoutWidth = Number(dom.layoutViewportWidth || dom.viewportWidth || 0);
  const widthAligned = Math.abs(Number(dom.shellWidth || 0) - layoutWidth) <= 2;
  const geometryAligned = Math.abs(Number(dom.sidebarRight || 0) - Number(dom.mainLeft || 0)) <= 2;
  const noGlobalHorizontalOverflow = Math.max(Number(dom.documentScrollWidth || 0), Number(dom.bodyScrollWidth || 0)) <= layoutWidth + 2;
  const designSystemOk = dom.designSystem?.ready === 'r2'
    && Boolean(dom.designSystem?.focusRing)
    && String(dom.designSystem?.brandAsset || '').includes('sidebar-logo-production.svg')
    && String(dom.designSystem?.heroAsset || '').includes('dashboard-hero-production.svg');
  return dom.readyState === 'complete'
    && dom.shellCount === 1
    && dom.mainRegionCount === 1
    && dom.shellReady === 'true'
    && JSON.stringify(dom.navViews || []) === JSON.stringify(EXPECTED_VIEWS)
    && JSON.stringify(dom.navLabels || []) === JSON.stringify(EXPECTED_NAV_LABELS)
    && JSON.stringify(dom.panelViews || []) === JSON.stringify(EXPECTED_VIEWS)
    && JSON.stringify(dom.activeNav || []) === JSON.stringify(['dashboard'])
    && JSON.stringify(dom.activePanels || []) === JSON.stringify(['dashboard'])
    && (dom.hiddenPanels || []).length === EXPECTED_VIEWS.length - 1
    && dom.oldVisualShells === 0
    && dom.detailDialog
    && dom.title === 'Accueil'
    && dom.bodyTextLength > 100
    && widthAligned
    && geometryAligned
    && noGlobalHorizontalOverflow
    && designSystemOk;
}

async function probeNavigationContinuity(win) {
  const steps = [];
  for (const view of EXPECTED_VIEWS) {
    const clicked = await win.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('#app-shell .nav[data-view=${JSON.stringify(view)}]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await delay(90);
    const state = await win.webContents.executeJavaScript(`(() => {
      const shell = document.querySelector('#app-shell');
      const activeNav = [...shell.querySelectorAll('.nav[data-view].active')];
      const activePanels = [...shell.querySelectorAll('.view[data-view-panel].active')].filter((node) => !node.hidden);
      const target = shell.querySelector('.view[data-view-panel=${JSON.stringify(view)}]');
      const nav = shell.querySelector('.nav[data-view=${JSON.stringify(view)}]');
      return {
        activeNav: activeNav.map((node) => node.dataset.view),
        activePanels: activePanels.map((node) => node.dataset.viewPanel),
        targetHidden: target?.hidden ?? true,
        targetDisplay: target ? getComputedStyle(target).display : 'missing',
        ariaCurrent: nav?.getAttribute('aria-current') || '',
        title: document.querySelector('#page-title')?.textContent?.trim() || '',
        shellCount: document.querySelectorAll('#app-shell').length
      };
    })()`);
    const ok = clicked
      && state.shellCount === 1
      && JSON.stringify(state.activeNav) === JSON.stringify([view])
      && JSON.stringify(state.activePanels) === JSON.stringify([view])
      && state.targetHidden === false
      && state.targetDisplay !== 'none'
      && state.ariaCurrent === 'page';
    steps.push({ view, ok, clicked, state });
    if (!ok) break;
  }

  await win.webContents.executeJavaScript(`document.querySelector('#app-shell .nav[data-view="dashboard"]')?.click()`);
  await delay(100);
  return { ok: steps.length === EXPECTED_VIEWS.length && steps.every((step) => step.ok), steps };
}

async function probeRenderer(win) {
  const dom = await probeShell(win);
  const navigation = await probeNavigationContinuity(win);
  win.show();
  await delay(700);
  const image = await win.webContents.capturePage();
  const paint = paintProbe(image);
  return { dom, navigation, paint, imageSize: image.getSize() };
}

app.on('browser-window-created', (_event, win) => {
  win.webContents.on('did-fail-load', (_loadEvent, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame === false) return;
    const detail = `${errorDescription} (${errorCode}) — ${validatedURL || 'URL locale inconnue'}`;
    reportFatal('chargement impossible', detail);
    failSmoke('did-fail-load', { errorCode, errorDescription, validatedURL });
  });

  win.webContents.on('render-process-gone', (_goneEvent, details) => {
    reportFatal('moteur d’affichage arrêté', `${details?.reason || 'raison inconnue'} / code ${details?.exitCode ?? 'inconnu'}`);
    failSmoke('render-process-gone', details || {});
  });

  win.webContents.on('preload-error', (_preloadEvent, preloadPath, error) => {
    reportFatal('préchargement impossible', `${preloadPath}: ${error?.message || error}`);
    failSmoke('preload-error', { preloadPath, message: error?.message || String(error) });
  });

  if (!smokeMode) return;

  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await probeRenderer(win);
      if (!shellContractOk(result.dom) || !result.navigation.ok || !result.paint.ok) {
        failSmoke('ui-not-rendered', result);
        return;
      }
      smokeFinished = true;
      console.log(`RDL_SMOKE_PASS ${JSON.stringify(result)}`);
      app.exit(0);
    } catch (error) {
      reportFatal('contrôle de rendu impossible', error?.stack || error?.message || String(error));
      failSmoke('probe-exception', { message: error?.message || String(error) });
    }
  });
});

if (smokeMode) {
  app.whenReady().then(() => {
    setTimeout(() => {
      if (!smokeFinished) failSmoke('startup-timeout', { timeoutMs: 22000 });
    }, 22000).unref?.();
  });
}

require('./main.cjs');