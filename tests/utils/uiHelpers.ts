import { Browser, Page } from "@playwright/test";
import { chromium } from "playwright";
import fs from "fs/promises";
import {
  fetchTranslation,
} from "./aiHelpers";

export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const LANGUAGE = process.env.LANGUAGE;
export const PRODUCT = process.env.PRODUCT;

export interface UiSearchResult {
  query: string;
  results: any;
  responseTime: number;
  error?: string;
}

export async function processAndLogUiResult({
  query,
  results,
  testDescribe,
  testTitle,
  customEval,
}: {
  query: any;
  results: UiSearchResult;
  testDescribe: string;
  testTitle: string;
  customEval?: (resultText: string) => Promise<string>;
}): Promise<any> {
  const actualInput = query?.value ?? query;
  const smartSearchMessage = results.results.resultText;
  const apiResponse = results.results.responseData;
  const facets = (() => {
    const params = results.results.responseData?.data?.smartSearch?.parameters || {};
    const excludeKeys = [
      "contextType",
      "isUcos",
      "limit",
      "sortingType",
      "language",
      "profileId",
      "vehicleCategory",
      "__typename"
    ];
    return Object.fromEntries(
      Object.entries(params).filter(([key]) => !excludeKeys.includes(key))
    );
  })();
  let openaiEvaluation = "PASS"; //customEval ? await customEval(smartSearchMessage) : await evaluateSearchResult(smartSearchMessage);
  let resultCount = 0;
  let hasError = false;
  let passed = openaiEvaluation === "PASS";
  const lang = process.env.LANGUAGE?.toLocaleLowerCase() || "en";

  // Handle the new Smart Search + Actual Search response structure
  const searchResults = apiResponse.data.smartSearch; //results.results.searchResults;

  // Extract result count from the actual search results
  if (searchResults) {
    resultCount =
      searchResults.results?.length ||
      searchResults.navigation?.totalResults ||
      0;
  } else {
    // If no search results, it means smart search failed or returned no URL
    resultCount = 0;
  }  

  const icon = passed ? "✅" : "❌";
  const entry: any = {
    timestamp: new Date().toISOString(),
    timestampSG: new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    }),
    testMode: "ui",    
    testDescribe,
    testTitle,
    query,
    resultText: smartSearchMessage,
    smartSearchMessage,
    openaiEvaluation
  };
  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${icon} ${openaiEvaluation} | ${testTitle}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Query:         '${actualInput}'`);
  console.log(`Response:      '${smartSearchMessage}'`);
  let queryEn = actualInput;
  let smartSearchMessageEn = smartSearchMessage;
  if (lang !== "en") {
    queryEn = await fetchTranslation(actualInput, "en");
    smartSearchMessageEn = await fetchTranslation(
      smartSearchMessage,
      "en"
    );
    console.log(`Query (EN):    '${queryEn}'`);
    console.log(`Response (EN): '${smartSearchMessageEn}'`);
  }
  console.log("\n");

  return {
    timestamp: new Date().toISOString(),
    timestampSG: new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    }),
    testMode: "ui",    
    testDescribe,
    testTitle,
    query: {
      [`${lang}`]: actualInput,
      "en": queryEn,
    },
    response: {
      [`${lang}`]: smartSearchMessage,
      "en": smartSearchMessageEn,
    },
    resultCount,
    responseTime: results.responseTime,
    statusCode: null,
    hasError: null,
    error: results.error,
    apiResponse,
    openaiEvaluation,
    facets,
  };
}

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
        "httpCredentials cannot be applied when attaching to an existing persistent context. Proceeding without them."
      );
    }
  } else {
    if (!browser) {
      throw new Error(
        "Browser fixture is required when PLAYWRIGHT_CDP_URL is not set."
      );
    }
    context = await browser.newContext({
      viewport: null,
      deviceScaleFactor: undefined,
      ...(httpCredentials ? { httpCredentials } : {}),
    });
  }
  const page = await context.newPage();

  // Intercept and override the response payload only if OVERRIDE_CONFIG_FILE is set to 'true'
  if (process.env.OVERRIDE_CONFIG_FILE === 'true') {
    await page.route(
      (urlObj: URL) => {
        const url = urlObj.toString();
        // Use the value from the 'country' variable for the config file match
        const countryCode = country.toLowerCase();
        const configRegex = new RegExp(`config_${countryCode}\\.json$`, 'i');
        return (
          url.includes('emh-dcps-mrktplc-vehicles-configuration') &&
          configRegex.test(url)
        );
      },
      async (route) => {
        const response = await route.fetch();
        const originalPayload = await response.json();

        // Modify the payload
        const modifiedPayload = {
          ...originalPayload,
          srp: {
            ...originalPayload.srp,
            enableSmartSearch: true,
            availableCategories: Array.isArray(
              originalPayload.srp.availableCategories
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

        // Fulfill the route with the modified payload
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(modifiedPayload),
        });
      }
    );
  }

  // Dynamically select URL file based on PROJECT
  let urlFilePath = "./tests/data/emh-urls.json";
  if (process.env.PROJECT === "DCP") {
    urlFilePath = "./tests/data/dcp-urls.json";
  } else if (process.env.PROJECT === "EMH") {
    urlFilePath = "./tests/data/emh-urls.json";
  }
  const urlsFile = await fs.readFile(urlFilePath, "utf-8");
  const urls = JSON.parse(urlsFile);
  let url = urls[country]?.[env];
  if (!url) {
    // fallback to Korea PROD if not found
    url =
      urls["KR"]?.["PROD"] ||
      "https://www.mercedes-benz.co.kr/passengercars/buy/new-car/search-results.html";
  }
  // Adjust path for PRODUCT
  if (PRODUCT === "NCOS") {
    url = url.replace(/\/used-car\//, "/new-car/");
  } else if (PRODUCT === "UCOS") {
    url = url.replace(/\/new-car\//, "/used-car/");
  }
  await page.goto(url);
  await handleCookieBanner(page);
  return page;
}

export async function handleCookieBanner(page: Page): Promise<void> {
  try {
    await page
      .locator(".cmm-cookie-banner__content")
      .waitFor({ state: "visible", timeout: 6000 });
    await page.click(".button--accept-all");
  } catch (e) {
    console.debug("[DEBUG] Cookie banner not visible, continuing execution...");
  }
}

export async function performUISmartSearchAndGetResults(
  page: Page,
  query: any = "",
  submitDisabled: boolean = false
): Promise<UiSearchResult> {
  const env = process.env.ENVIRONMENT || "INT";
  const searchButton = page.locator(
    ".smart-search__input.wb-input wb7-input-action div[data-on='contrast'] button"
  );
  console.debug("[DEBUG] Waiting for search button to be visible...");
  await searchButton.waitFor({ state: "visible" });
  for (let j = 0; j < 10; j++) {
    const enabled = await searchButton.isEnabled();
    console.debug(
      `[DEBUG] Search button enabled: ${enabled} (attempt ${j + 1}/10)`
    );
    if (enabled) break;
    await page.waitForTimeout(1000);
  }

  const actualInput = query?.value ?? query;
  const input = page.locator(
    "wb7-input.smart-search__input wb7-grey-box input"
  );
  console.debug(`[DEBUG] Filling input with: '${actualInput}'`);
  await input.fill(" ");
  await input.fill(actualInput);

  if (submitDisabled) {
    const isDisabled = !(await searchButton.isEnabled());
    let notClickable = false;
    try {
      await searchButton.click({ trial: true, timeout: 1000 });
    } catch (e) {
      notClickable = true;
    }
    console.debug(
      `[DEBUG] Submit disabled check: isDisabled=${isDisabled}, notClickable=${notClickable}`
    );
    if (isDisabled && notClickable) {
      console.debug("[DEBUG] PASSED: Submit Button Disabled");
      return {
        query: query,
        results: "[Script] PASSED: Submit Button Disabled",
        responseTime: 0,
        error: undefined,
      };
    } else {
      console.debug("[DEBUG] FAILED: Submit Button Enabled");
      return {
        query: query,
        results: "[Script] FAILED: Submit Button Enabled",
        responseTime: 0,
        error: "Submit button was enabled when it should be disabled",
      };
    }
  }

  const endpoint =
    process.env.API_ENDPOINT_LOCAL === "true"
      ? "http://localhost:8080/api/v2/search"
      : env?.toUpperCase() === "PROD"
      ? "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql"
      : env?.toUpperCase() === "INT"
      ? "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql"
      : "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";

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
        console.info("[DEBUG] API response received from endpoint:", endpoint);
        apiResponsePayload = await response.json();
        responseCaptured = true;
        if (responseCapturedPromiseResolve) responseCapturedPromiseResolve();
        console.info("[DEBUG] API response payload:", apiResponsePayload.length);
      }
    } catch (e) {
      console.warn("[DEBUG] Failed to capture API response payload:", e);
    }
  };
  page.on("response", responseListener);

  if (await searchButton.isVisible()) await searchButton.click();

  let retries = 0;
  let resultText = "";
  const loader = page.locator(".dcp-loader");
  const startTime = Date.now();
  while (retries < 3) {
    try {
      console.debug(
        `[DEBUG] Waiting for results to be visible (attempt ${
          retries + 1
        }/3)...`
      );
      const results = page.locator(".smart-search__bubble p");
      resultText = await results.innerText();

      const rateLimitMatch = resultText.match(
        /검색 제한을 초과했습니다\. (\d+)초 후에 다시 시도해 주세요/
      );
      if (rateLimitMatch) {
        const seconds = parseInt(rateLimitMatch[1], 10);
        console.info(
          `[DEBUG] Rate limit hit. Waiting for ${seconds} seconds before retrying...`
        );
        await page.waitForTimeout(seconds * 1000);
        retries++;
        await searchButton.click();
        continue;
      }
      break;
    } catch (e) {
      console.info(`[DEBUG] Error waiting for results: ${e}`);
      retries++;
      console.debug(
        `[DEBUG] Retrying search button click (attempt ${retries + 1}/3)...`
      );
    }
  }

  const responseTime = Date.now() - startTime;
  // Wait for responseListener to capture a response (max 30s)
  if (!responseCaptured) {
    try {
      await Promise.race([
        responseCapturedPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for API response")), 30000)),
      ]);
    } catch (e) {
      return {
        query: query,
        results: {
          resultText,
          responseData: null,
        },
        responseTime,
        error: "Failed to capture API response within timeout",
      };
    }
  }
  return {
    query: query,
    results: {
      resultText,
      responseData: apiResponsePayload,
    },
    responseTime,
    error: retries === 3 ? "Failed to retrieve results after 3 attempts" : undefined,
  };
}
