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

  win.show();
  await delay(900);
  const image = await win.webContents.capturePage();
  const paint = paintProbe(image);
  return { dom, paint, imageSize: image.getSize() };
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
      // Phase B no longer renders the brand as legacy body text: the validated
      // master owns the static illustrated regions. The startup probe therefore
      // checks the reconstructed dashboard itself instead of obsolete V5.2.1
      // textual/theme signatures. This also prevents a native error dialog from
      // blocking the real packaged visual gate when the new dashboard is valid.
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
          bodyTextLength: (document.body?.innerText || '').trim().length
        };
      })()`);

      const phaseBReady = dom.visualDashboard
        && dom.visualSidebar
        && dom.visualMain
        && dom.visualHero
        && dom.visualWidth === 1448
        && dom.visualHeight === 1086;

      if (!phaseBReady || dom.bodyTextLength < 100) {
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
        && result.dom.visualWidth === 1448
        && result.dom.visualHeight === 1086
        && result.dom.bodyTextLength > 100;

      if (!domOk || !result.paint.ok) {
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