import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'dashboard.spec.mjs',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'artifacts',
  snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
  use: {
    viewport: { width: 1448, height: 1086 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'off'
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: 0.15,
      maxDiffPixelRatio: 0.08
    }
  }
});
