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
  const dom = await win.webContents.executeJavaScript(`(() => {
    const shell = document.querySelector('.shell');
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    const title = document.querySelector('#page-title');
    const shellRect = shell?.getBoundingClientRect();
    const sidebarRect = sidebar?.getBoundingClientRect();
    return {
      readyState: document.readyState,
      shell: Boolean(shell),
      sidebar: Boolean(sidebar),
      main: Boolean(main),
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
      const dom = await win.webContents.executeJavaScript(`(() => ({
        shell: Boolean(document.querySelector('.shell')),
        sidebar: Boolean(document.querySelector('.sidebar')),
        bodyTextLength: (document.body?.innerText || '').trim().length,
        hasBrandText: (document.body?.innerText || '').includes('Respect des Lieux')
      }))()`);

      if (!dom.shell || !dom.sidebar || !dom.hasBrandText || dom.bodyTextLength < 100) {
        reportFatal('interface incomplète', JSON.stringify(dom));
        failSmoke('dom-incomplete', dom);
        return;
      }

      if (!smokeMode) return;

      const result = await probeRenderer(win);
      const domOk = result.dom.readyState === 'complete'
        && result.dom.shell
        && result.dom.sidebar
        && result.dom.main
        && result.dom.shellWidth > 500
        && result.dom.shellHeight > 400
        && result.dom.sidebarWidth > 100
        && result.dom.bodyTextLength > 100
        && result.dom.hasBrandText;

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
      if (!smokeFinished) failSmoke('startup-timeout', { timeoutMs: 18000 });
    }, 18000).unref?.();
  });
}

require('./main.cjs');
