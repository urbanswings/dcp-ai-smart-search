import { Locator, Page } from "@playwright/test";
import type { UiSearchResult } from "../core/searchResultTypes";

type SmartSearchLocators = {
  searchInputArea: Locator;
  searchButton: Locator;
  input: Locator;
};

type SmartSearchResultWait = {
  resultText: string;
  retries: number;
  pageClosed: boolean;
};

type SmartSearchResponseCapture = {
  getPayload: () => any[];
  isCaptured: () => boolean;
  waitForCapture: () => Promise<void>;
  dispose: () => void;
};

export function getSmartSearchLocators(page: Page): SmartSearchLocators {
  return {
    searchInputArea: page
      .locator(".smart-search__input, wb7-input.smart-search__input")
      .first(),
    searchButton: page
      .locator(
        ".smart-search__input.wb-input wb7-input-action div[data-on='contrast'] button",
      )
      .or(page.locator("wb7-input-action button"))
      .or(page.locator(".smart-search__input button"))
      .or(
        page.locator(
          "button[aria-label*='search' i], button[title*='search' i]",
        ),
      )
      .first(),
    input: page
      .locator("wb7-input.smart-search__input wb7-grey-box input")
      .or(page.locator(".smart-search__input input"))
      .or(page.locator("input[placeholder*='search' i]"))
      .first(),
  };
}

export async function waitForSmartSearchControls(
  page: Page,
  locators: SmartSearchLocators,
): Promise<string | null> {
  try {
    await locators.searchInputArea.waitFor({
      state: "visible",
      timeout: 15000,
    });
    console.debug("[DEBUG] Waiting for search button to be visible...");
    await locators.searchButton.waitFor({ state: "visible", timeout: 10000 });
    for (let j = 0; j < 10; j++) {
      const enabled = await locators.searchButton.isEnabled();
      console.debug(
        `[DEBUG] Search button enabled: ${enabled} (attempt ${j + 1}/10)`,
      );
      if (enabled) break;
      await page.waitForTimeout(1000);
    }
    return null;
  } catch (e: any) {
    const details = e?.message || e;

    return `Search UI not visible: ${details}`;
  }
}

export async function fillSmartSearchInput(
  input: Locator,
  actualInput: any,
): Promise<string | null> {
  try {

    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(" ");
    await input.fill(actualInput);
    return null;
  } catch (e: any) {

    return `Search input not usable: ${e?.message || e}`;
  }
}

export async function assertSubmitDisabled(
  query: any,
  searchButton: Locator,
): Promise<UiSearchResult> {
  const isDisabled = !(await searchButton.isEnabled());
  let notClickable = false;
  try {
    await searchButton.click({ trial: true, timeout: 1000 });
  } catch (e) {
    notClickable = true;
  }
  console.debug(
    `[DEBUG] Submit disabled check: isDisabled=${isDisabled}, notClickable=${notClickable}`,
  );
  if (isDisabled && notClickable) {
    console.debug("[DEBUG] PASSED: Submit Button Disabled");
    return {
      query,
      results: "[Script] PASSED: Submit Button Disabled",
      responseTime: 0,
      error: undefined,
    };
  }


  return {
    query,
    results: "[Script] FAILED: Submit Button Enabled",
    responseTime: 0,
    error: "Submit button was enabled when it should be disabled",
  };
}

export function getSmartSearchEndpoint(env: string): string {
  return process.env.API_ENDPOINT_LOCAL === "true"
    ? "http://localhost:8080/api/v2/search"
    : env?.toUpperCase() === "PROD"
      ? "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql"
      : env?.toUpperCase() === "INT"
        ? "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql"
        : "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";
}

export function createSmartSearchResponseCapture(
  page: Page,
  endpoint: string,
): SmartSearchResponseCapture {
  let apiResponsePayload: any[] = [];
  let responseCaptured = false;
  let responseCapturedPromiseResolve: (() => void) | null = null;
  const responseCapturedPromise = new Promise<void>((resolve) => {
    responseCapturedPromiseResolve = resolve;
  });
  const responseListener = async (response: any) => {
    try {
      if (
        response.url().includes(endpoint) &&
        response.request().method() === "POST"
      ) {
        apiResponsePayload = await response.json();
        responseCaptured = true;
        if (responseCapturedPromiseResolve) responseCapturedPromiseResolve();
      }
    } catch (e) {
      console.warn("Failed to capture API response payload:", e);
    }
  };

  page.on("response", responseListener);

  return {
    getPayload: () => apiResponsePayload,
    isCaptured: () => responseCaptured,
    waitForCapture: () => responseCapturedPromise,
    dispose: () => page.off("response", responseListener),
  };
}

async function extractSmartSearchBubbleText(
  successBubbleLocator: Locator,
): Promise<string> {
  let extractedText = await successBubbleLocator
    .locator(
      "p, .smart-search__message, .smart-search__result-message, .wbx-notification__content",
    )
    .first()
    .innerText()
    .catch(() => "");

  if (!extractedText.trim()) {
    extractedText = await successBubbleLocator.innerText().catch(() => "");
  }

  return extractedText
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*(Sonuçları görüntüle|Show results|View results)\s*$/i, "")
    .replace(/\s*(Yapay Zekâ Bilgilendirmesi|AI Disclosure)\s*$/i, "")
    .trim();
}

async function retrySmartSearchClick(
  page: Page,
  searchButton: Locator,
): Promise<boolean> {
  await page.waitForTimeout(500);
  try {
    const isButtonVisible = await searchButton.isVisible({ timeout: 3000 });
    if (isButtonVisible) {
      await searchButton.click();
    }
    return false;
  } catch (e: any) {
    if (e?.message?.includes("closed") || e?.message?.includes("context")) {
      console.warn("Page closed during retry button click");
      return true;
    }
    return false;
  }
}

export async function clickSearchAndWaitForResult(
  page: Page,
  searchButton: Locator,
): Promise<SmartSearchResultWait> {
  if (await searchButton.isVisible().catch(() => false)) {
    await searchButton.click();
  }

  let retries = 0;
  let resultText = "";
  let pageClosed = false;
  const successBubbleLocator = page.locator(".smart-search__bubble").first();
  const errorResultLocator = page.locator(
    ".smart-search__notification.wbx-notification--error .wbx-notification__content",
  );

  while (retries < 3 && !pageClosed) {
    try {
      if (page.isClosed()) {
        console.warn("Page was closed, cannot proceed with retries");
        pageClosed = true;
        break;
      }

      console.debug(
        `[DEBUG] Waiting for results to be visible (attempt ${
          retries + 1
        }/3)...`,
      );
      await successBubbleLocator
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => false);

      let isSuccessVisible = false;
      try {
        isSuccessVisible = await successBubbleLocator.isVisible();
      } catch (e: any) {
        if (e?.message?.includes("closed") || e?.message?.includes("context")) {
          console.warn("Page closed during isVisible check");
          pageClosed = true;
          break;
        }
        isSuccessVisible = false;
      }

      if (isSuccessVisible) {
        resultText = await extractSmartSearchBubbleText(successBubbleLocator);
        if (resultText) {
          break;
        }
      }

      let errorVisible = false;
      try {
        errorVisible = await errorResultLocator.isVisible({ timeout: 3000 });
      } catch (e: any) {
        if (e?.message?.includes("closed") || e?.message?.includes("context")) {
          console.warn("Page closed during error check");
          pageClosed = true;
          break;
        }
        errorVisible = false;
      }

      if (errorVisible) {
        resultText = await errorResultLocator.innerText();
        console.warn(
          `[DEBUG] UI showing internal error message: '${resultText}'`,
        );
        break;
      }

      retries++;
      if (retries < 3) {
        console.debug(
          `[DEBUG] Results not visible, retrying search button click (attempt ${retries + 1}/3)...`,
        );
        pageClosed = await retrySmartSearchClick(page, searchButton);
      }
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      if (
        errMsg.includes("page") ||
        errMsg.includes("closed") ||
        errMsg.includes("context")
      ) {
        console.warn(`Page appears to be closed: ${errMsg}`);
        pageClosed = true;
        break;
      }
      console.info(`[DEBUG] Error waiting for results: ${errMsg}`);
      retries++;
      if (retries < 3) {
        console.debug(
          `[DEBUG] Retrying search button click (attempt ${retries + 1}/3)...`,
        );
        await page.waitForTimeout(500);
        if (await searchButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchButton.click();
        }
      }
    }
  }

  return { resultText, retries, pageClosed };
}

export async function waitForCapturedSmartSearchResponse(
  capture: SmartSearchResponseCapture,
): Promise<void> {
  await Promise.race([
    capture.waitForCapture(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Timed out waiting for API response")),
        30000,
      ),
    ),
  ]);
}
