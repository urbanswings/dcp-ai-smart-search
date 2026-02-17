import { defineConfig, devices } from '@playwright/test';
import { chromium } from 'playwright';

const cdpUrl = process.env.PLAYWRIGHT_CDP_URL || process.env.CDP_URL;

export default defineConfig({
  testDir: './tests',
  timeout: 100 * 60000,
  retries: 0,
  use: {
    headless: cdpUrl ? false : true,
    viewport: null, // Use full available screen size
    launchOptions: {
      args: ['--start-maximized'],
    },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: null, // Ensure full screen for this project too
        launchOptions: {
          args: ['--start-maximized'],
        },
      },
    },
  ],
  // If CDP_URL is set, create a custom browser fixture that connects over CDP
  ...(cdpUrl && {
    webServer: undefined,
    fullyParallel: false, // Ensure tests run sequentially when using shared CDP browser
  }),
});
