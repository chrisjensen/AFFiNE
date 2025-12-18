import { testResultDir } from '@affine-test/kit/playwright';
import type {
  PlaywrightTestConfig,
  PlaywrightWorkerOptions,
} from '@playwright/test';

// Config for running tests with existing dev servers (no webServer startup)
const config: PlaywrightTestConfig = {
  testDir: './e2e',
  fullyParallel: false,
  timeout: 120_000,
  outputDir: testResultDir,
  use: {
    baseURL: 'http://localhost:8080/',
    browserName:
      (process.env.BROWSER as PlaywrightWorkerOptions['browserName']) ??
      'chromium',
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 800 },
    actionTimeout: 10 * 1000,
    locale: 'en-US',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  workers: 1,
  retries: 0,
  reporter: 'list',
  // No webServer - assumes servers are already running on ports 8080 and 3010
};

export default config;
