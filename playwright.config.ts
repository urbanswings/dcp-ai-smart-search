import { defineConfig, devices } from "@playwright/test";

const cdpUrl = process.env.PLAYWRIGHT_CDP_URL || process.env.CDP_URL;
const isHeadless = cdpUrl ? false : true;
const fixedViewport = { width: 1920, height: 1080 };
process.env.PLAYWRIGHT_EFFECTIVE_HEADLESS = String(isHeadless);

export default defineConfig({
  testDir: "./tests",
  reporter: "html",
  workers: process.env.CI ? 2 : 1,
  fullyParallel: true,
  timeout: 10 * 60000,
  retries: 0,
  use: {
    headless: isHeadless,
    viewport: isHeadless ? fixedViewport : null,
    launchOptions: {
      args: isHeadless ? ["--window-size=1920,1080"] : ["--start-maximized"],
    },
    ignoreHTTPSErrors: true,
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: isHeadless ? fixedViewport : null,
        launchOptions: {
          args: isHeadless
            ? ["--window-size=1920,1080"]
            : ["--start-maximized"],
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
