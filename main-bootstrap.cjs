const { app, dialog } = require('electron');

// Respect des Lieux PRO does not need GPU acceleration. Disabling it avoids
// blank Chromium surfaces caused by some Windows graphics/driver stacks while
// keeping the application fully functional for this 2D administrative UI.
app.disableHardwareAcceleration();

const smokeMode = process.env.RDL_PACKAGED_SMOKE === '1';
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

function responsiveSurfaceOk(dom) {
  const widthDelta = Math.abs(Number(dom.visualWidth || 0) - Number(dom.viewportWidth || 0));
  const heightDelta = Math.abs(Number(dom.visualHeight || 0) - Number(dom.viewportHeight || 0));
  return Number(dom.viewportWidth || 0) >= 800
    && Number(dom.viewportHeight || 0) >= 600
    && widthDelta <= 2
    && heightDelta <= 2;
}

async function probeNavigationContinuity(win) {
  const clickResult = await win.webContents.executeJavaScript(`(() => {
    const target = document.querySelector('#vf-dashboard .vf-nav-item[data-view="signalements"]');
    if (!target) return { clicked: false, reason: 'signalements-button-missing' };
    target.click();
    return { clicked: true };
  })()`);

  await delay(180);

  const state = await win.webContents.executeJavaScript(`(() => {
    const visualDashboard = document.querySelector('#vf-dashboard');
    const visualSidebar = visualDashboard?.querySelector('.vf-sidebar');
    const legacyShell = document.querySelector('body > .shell');
    const legacySidebar = legacyShell?.querySelector(':scope > .sidebar');
    const signalements = document.querySelector('#view-signalements');
    const nav = visualDashboard?.querySelector('.vf-nav-item[data-view="signalements"]');
    const visualRect = visualDashboard?.getBoundingClientRect();
    const sidebarRect = visualSidebar?.getBoundingClientRect();
    const shellRect = legacyShell?.getBoundingClientRect();
    return {
      dashboardMode: document.body.classList.contains('dashboard-mode'),
      visualDashboardDisplay: visualDashboard ? getComputedStyle(visualDashboard).display : 'missing',
      visualSidebarDisplay: visualSidebar ? getComputedStyle(visualSidebar).display : 'missing',
      legacyShellDisplay: legacyShell ? getComputedStyle(legacyShell).display : 'missing',
      legacySidebarDisplay: legacySidebar ? getComputedStyle(legacySidebar).display : 'missing',
      signalementsDisplay: signalements ? getComputedStyle(signalements).display : 'missing',
      signalementsActive: Boolean(signalements?.classList.contains('active')),
      signalementsNavActive: Boolean(nav?.classList.contains('active')),
      visualWidth: visualRect?.width || 0,
      viewportWidth: window.innerWidth || 0,
      sidebarRight: sidebarRect?.right || 0,
      shellLeft: shellRect?.left || 0
    };
  })()`);

  const geometryAligned = Math.abs(Number(state.shellLeft || 0) - Number(state.sidebarRight || 0)) <= 2;
  const ok = Boolean(clickResult?.clicked)
    && state.dashboardMode === false
    && state.visualDashboardDisplay !== 'none'
    && state.visualSidebarDisplay !== 'none'
    && state.legacyShellDisplay !== 'none'
    && state.legacySidebarDisplay === 'none'
    && state.signalementsDisplay !== 'none'
    && state.signalementsActive
    && state.signalementsNavActive
    && geometryAligned;

  // Revenir sur l'accueil afin que la capture peinture vérifie également que
  // la navigation aller-retour ne casse pas le dashboard responsive.
  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('#vf-dashboard .vf-nav-item[data-view="dashboard"]')?.click();
  })()`);
  await delay(120);

  return { ok, clickResult, state, geometryAligned };
}

async function probeRenderer(win) {
  await delay(1800);
  const dom = await win.webContents.executeJavaScript(`(() => {
    const shell = document.querySelector('.shell');
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    const title = document.querySelector('#page-title');
    const visualDashboard = document.querySelector('#vf-dashboard');
    const visualSidebar = visualDashboard?.querySelector('.vf-sidebar');
    const visualMain = visualDashboard?.querySelector('.vf-main');
    const visualHero = visualDashboard?.querySelector('.vf-hero');
    const shellRect = shell?.getBoundingClientRect();
    const sidebarRect = sidebar?.getBoundingClientRect();
    const visualRect = visualDashboard?.getBoundingClientRect();
    const parity = window.RDL_PARITY?.snapshot?.() || null;
    return {
      readyState: document.readyState,
      shell: Boolean(shell),
      sidebar: Boolean(sidebar),
      main: Boolean(main),
      visualDashboard: Boolean(visualDashboard),
      visualSidebar: Boolean(visualSidebar),
      visualMain: Boolean(visualMain),
      visualHero: Boolean(visualHero),
      visualReady: visualDashboard?.dataset?.vfReady || '',
      visualWidth: visualRect?.width || 0,
      visualHeight: visualRect?.height || 0,
      viewportWidth: window.innerWidth || 0,
      viewportHeight: window.innerHeight || 0,
      signalDetailDialog: Boolean(document.querySelector('#signal-detail-dialog')),
      detailScript: Boolean(document.querySelector('script[data-rdl-detail-layer]')),
      detailStyle: Boolean(document.querySelector('link[data-rdl-detail-layer]')),
      themeScript: Boolean(document.querySelector('script[data-rdl-theme-layer]')),
      themeStyle: Boolean(document.querySelector('#rdl-theme-v521')),
      themeSignature: Boolean(document.querySelector('[data-rdl-theme-signature="watteau-v5.2.1"]')),
      themeVersion: document.documentElement?.dataset?.rdlTheme || '',
      parityScript: Boolean(document.querySelector('script[data-rdl-parity-layer]')),
      parityToolbar: Boolean(document.querySelector('[data-rdl-parity="v5.2.1"]')),
      parityVersion: parity?.version || '',
      parityPageSize: parity?.pageSize || 0,
      shellWidth: shellRect?.width || 0,
      shellHeight: shellRect?.height || 0,
      sidebarWidth: sidebarRect?.width || 0,
      bodyTextLength: (document.body?.innerText || '').trim().length,
      title: title?.textContent || '',
      hasBrandText: (document.body?.innerText || '').includes('Respect des Lieux')
    };
  })()`);

  const navigation = await probeNavigationContinuity(win);

  win.show();
  await delay(900);
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

  win.webContents.once('did-finish-load', async () => {
    try {
      // Phase C sépare deux responsabilités : le Fidelity Gate conserve le
      // master immuable 1448×1086 en mode RDL_VISUAL_TEST, tandis que ce smoke
      // test qualifie le produit réel et exige désormais que son canvas épouse
      // exactement le viewport disponible sur la machine Windows.
      const dom = await win.webContents.executeJavaScript(`(() => {
        const visualDashboard = document.querySelector('#vf-dashboard');
        const visualRect = visualDashboard?.getBoundingClientRect();
        return {
          visualDashboard: Boolean(visualDashboard),
          visualSidebar: Boolean(visualDashboard?.querySelector('.vf-sidebar')),
          visualMain: Boolean(visualDashboard?.querySelector('.vf-main')),
          visualHero: Boolean(visualDashboard?.querySelector('.vf-hero')),
          visualWidth: visualRect?.width || 0,
          visualHeight: visualRect?.height || 0,
          viewportWidth: window.innerWidth || 0,
          viewportHeight: window.innerHeight || 0,
          bodyTextLength: (document.body?.innerText || '').trim().length
        };
      })()`);

      const phaseCReady = dom.visualDashboard
        && dom.visualSidebar
        && dom.visualMain
        && dom.visualHero
        && responsiveSurfaceOk(dom);

      if (!phaseCReady || dom.bodyTextLength < 100) {
        reportFatal('interface incomplète', JSON.stringify(dom));
        failSmoke('dom-incomplete', dom);
        return;
      }

      if (!smokeMode) return;

      const result = await probeRenderer(win);
      const domOk = result.dom.readyState === 'complete'
        && result.dom.visualDashboard
        && result.dom.visualSidebar
        && result.dom.visualMain
        && result.dom.visualHero
        && responsiveSurfaceOk(result.dom)
        && result.dom.bodyTextLength > 100;

      if (!domOk || !result.navigation.ok || !result.paint.ok) {
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
