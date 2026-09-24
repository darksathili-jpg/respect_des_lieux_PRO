import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'electron-dashboard.spec.mjs',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'electron-artifacts',
  snapshotPathTemplate: '{testDir}/electron-snapshots/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: 0.15,
      maxDiffPixelRatio: 0.04
    }
  }
});
