import { Browser, Page } from "@playwright/test";
import fs from "fs/promises";
import { chromium } from "playwright";

const ENVIRONMENT = process.env.ENVIRONMENT;
const COUNTRY = process.env.COUNTRY;
const LANGUAGE = process.env.LANGUAGE;
const PRODUCT = process.env.PRODUCT;

export async function setupContextAndPage(browser?: Browser): Promise<Page> {
  const country = COUNTRY || "KR";
  const env = ENVIRONMENT || "PROD";
  let httpCredentials;

  if (ENVIRONMENT === "INT") {
    if (
      process.env.PROJECT === "DCP" &&
      process.env.DCP_USER_INT &&
      process.env.DCP_PASS_INT
    ) {
      httpCredentials = {
        username: process.env.DCP_USER_INT,
        password: process.env.DCP_PASS_INT,
      };
    } else if (process.env.AEM_USER_INT && process.env.AEM_PASS_INT) {
      httpCredentials = {
        username: process.env.AEM_USER_INT,
        password: process.env.AEM_PASS_INT,
      };
    }
  } else if (
    ENVIRONMENT === "PREPROD" &&
    process.env.AEM_USER_PREPROD &&
    process.env.AEM_PASS_PREPROD
  ) {
    httpCredentials = {
      username: process.env.AEM_USER_PREPROD,
      password: process.env.AEM_PASS_PREPROD,
    };
  }
  const cdpUrl = process.env.PLAYWRIGHT_CDP_URL || process.env.CDP_URL;
  let context;
  if (cdpUrl) {
    console.log(`Connecting to existing browser via CDP: ${cdpUrl}`);
    const attachedBrowser = await chromium.connectOverCDP(cdpUrl);
    const existingContexts = attachedBrowser.contexts();
    context =
      existingContexts.length > 0
        ? existingContexts[0]
        : await attachedBrowser.newContext({
            viewport: { width: 1920, height: 1080 },
          });
    if (httpCredentials) {
      console.warn(
        "httpCredentials cannot be applied when attaching to an existing persistent context. Proceeding without them.",
      );
    }
  } else {
    if (!browser) {
      throw new Error(
        "Browser fixture is required when PLAYWRIGHT_CDP_URL is not set.",
      );
    }
    const isHeadlessMode = process.env.PLAYWRIGHT_EFFECTIVE_HEADLESS === "true";
    context = await browser.newContext({
      viewport: isHeadlessMode ? { width: 1920, height: 1080 } : null,
      deviceScaleFactor: undefined,
      ...(httpCredentials ? { httpCredentials } : {}),
    });
  }
  const page = await context.newPage();

  if (process.env.OVERRIDE_CONFIG_FILE === "true") {
    await page.route(
      (urlObj: URL) => {
        const url = urlObj.toString();
        const countryCode = country.toLowerCase();
        const configRegex = new RegExp(`config_${countryCode}\\.json$`, "i");
        return (
          url.includes("emh-dcps-mrktplc-vehicles-configuration") &&
          configRegex.test(url)
        );
      },
      async (route) => {
        const response = await route.fetch();
        const originalPayload = await response.json();

        const modifiedPayload = {
          ...originalPayload,
          srp: {
            ...originalPayload.srp,
            enableSmartSearch: true,
            availableCategories: Array.isArray(
              originalPayload.srp.availableCategories,
            )
              ? [
                  {
                    ...originalPayload.srp.availableCategories[0],
                    enableSmartSearch: true,
                  },
                  ...originalPayload.srp.availableCategories.slice(1),
                ]
              : originalPayload.srp.availableCategories,
          },
        };

        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(modifiedPayload),
        });
      },
    );
  }

  let urlFilePath = "./tests/data/emh-urls.json";
  if (process.env.PROJECT === "DCP") {
    urlFilePath = "./tests/data/dcp-urls.json";
  } else if (process.env.PROJECT === "EMH") {
    urlFilePath = "./tests/data/emh-urls.json";
  }
  const urlsFile = await fs.readFile(urlFilePath, "utf-8");
  const urls = JSON.parse(urlsFile);
  const language = (process.env.LANGUAGE || LANGUAGE || "EN").toUpperCase();
  const marketUrls = urls[country];
  let url =
    marketUrls?.[env] ||
    marketUrls?.[language]?.[env] ||
    marketUrls?.EN?.[env] ||
    marketUrls?.JP?.[env];
  if (!url) {
    url =
      urls["KR"]?.["PROD"] ||
      "https://www.mercedes-benz.co.kr/passengercars/buy/new-car/search-results.html";
  }
  if (PRODUCT === "NCOS") {
    url = url.replace(/\/used-car\//, "/new-car/");
  } else if (PRODUCT === "UCOS") {
    url = url.replace(/\/new-car\//, "/used-car/");
  }
  await page.goto(url);
  await Promise.all([handleCookieBanner(page), handlePostalCodePopUp(page)]);
  return page;
}

export async function handleCookieBanner(page: Page): Promise<void> {
  try {
    await page
      .locator(".cmm-cookie-banner__content")
      .waitFor({ state: "visible", timeout: 15000 });
    await page.click(".button--accept-all");
    console.debug("[DEBUG] Cookie banner accepted.");
  } catch (e) {
    console.debug("[DEBUG] Cookie banner not visible, continuing execution...");
  }
}

export async function handlePostalCodePopUp(page: Page): Promise<void> {
  try {
    const trigger = page.locator(
      '[data-test-id="header-integration-item-emh-region-picker"]',
    );
    await trigger
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => false);
    if (!(await trigger.isVisible().catch(() => false))) {
      console.debug(
        "[DEBUG] Region picker trigger not visible, skipping postal code pop-up handling.",
      );
      return;
    }

    const popup = page.locator('[data-test-id="region-picker-module-flyout"]');
    const regionPicker = popup.locator("dh-io-emh-region-picker");

    const country = COUNTRY || "KR";
    const addressesFile = await fs.readFile(
      "./tests/data/emh-addresses.json",
      "utf-8",
    );
    const addresses = JSON.parse(addressesFile);
    const postalCode = addresses[country]?.postalCode;

    if (!postalCode) {
      console.debug(
        `[DEBUG] No postal code configured for country '${country}', skipping region picker submission.`,
      );
      return;
    }

    const postalCodeInput = popup
      .getByRole("textbox")
      .or(popup.getByRole("spinbutton"))
      .or(
        popup.locator(
          'input[aria-invalid], input[inputmode], input[type="text"], input[type="number"]',
        ),
      )
      .first();
    const submitButton = popup.locator(".region-picker-content__submit-button");

    if (await trigger.isVisible({ timeout: 10000 }).catch(() => false)) {
      const isExpanded = await trigger
        .getAttribute("aria-expanded")
        .catch(() => null);
      if (isExpanded !== "true") {
        await trigger.click().catch((e) => {
          console.debug(`[DEBUG] Trigger click failed: ${e?.message || e}`);
        });
      }
    }

    await popup.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await regionPicker
      .waitFor({ state: "attached", timeout: 10000 })
      .catch(() => {});
    await postalCodeInput
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => {});
    await postalCodeInput.fill("").catch(() => {});
    await postalCodeInput.fill(postalCode).catch(() => {});
    await submitButton
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => {});
    await submitButton.click().catch(() => {});
  } catch (e: any) {
    if (
      e?.message?.includes("Target page, context or browser has been closed")
    ) {
      console.debug(
        "[DEBUG] Page closed during postal code pop-up handling, continuing...",
      );
    } else {
      console.debug(
        `[DEBUG] Postal code pop-up handling skipped: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
