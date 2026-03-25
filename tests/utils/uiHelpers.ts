import { Browser, Page } from "@playwright/test";
import { chromium } from "playwright";
import fs from "fs/promises";
import {
  fetchTranslation,
  openaiChatCompletion,
} from "./aiHelpers";
import { deepEqual } from "./shared";

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

function normalizeFacetToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/^paint[_-]?color[_-]?/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function collectPrimitiveFacetValues(value: any): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPrimitiveFacetValues(item));
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => collectPrimitiveFacetValues(item));
  }
  return [String(value)];
}

function isOpaqueFacetValue(facetKey: string, rawValue: string): boolean {
  return (
    ["upholstery", "color"].includes(facetKey) &&
    /^[0-9a-f]{8,}$/i.test(rawValue)
  );
}

const facetValueAliasMap: Record<string, string[]> = {
  "limousine": ["sedan"],
  "sedan": ["limousine"],
  "suv": ["suvoffroader"],
  "suvoffroader": ["suv"],
  "cabrioroadster": ["cabrioletroadster"],
  "cabrioletroadster": ["cabrioroadster"],
  "amggt": ["mercedesamggt"],
  "mercedesamggt": ["amggt"],
  "a": ["aclass"],
  "aclass": ["a"],
  "b": ["bclass"],
  "bclass": ["b"],
  "c": ["cclass"],
  "cclass": ["c"],
  "e": ["eclass"],
  "eclass": ["e"],
  "g": ["gclass"],
  "gclass": ["g"],
  "s": ["sclass"],
  "sclass": ["s"],
  "hatchback": ["hatches"],
  "hatches": ["hatchback"],
  "peoplecarrier": ["peoplemovers"],
  "peoplemovers": ["peoplecarrier"],
  "pluginhybridpetrol": ["petrolelectricpluginhybrid"],
  "petrolelectricpluginhybrid": ["pluginhybridpetrol"],
};

function buildFacetCandidateTokens(rawValue: string): string[] {
  const candidates = new Set<string>();
  const normalizedRaw = normalizeFacetToken(rawValue);
  if (normalizedRaw) {
    candidates.add(normalizedRaw);
    for (const alias of facetValueAliasMap[normalizedRaw] || []) {
      candidates.add(alias);
    }
  }

  if (rawValue.includes("_")) {
    const lastToken = rawValue.split("_").pop() || rawValue;
    const normalizedLastToken = normalizeFacetToken(lastToken);
    if (normalizedLastToken) {
      candidates.add(normalizedLastToken);
      for (const alias of facetValueAliasMap[normalizedLastToken] || []) {
        candidates.add(alias);
      }
    }
  }

  return Array.from(candidates);
}

function mapUiLabelToFacetKey(label: string): string | null {
  const normalizedLabel = label.toLowerCase().replace(/\s+/g, " ").trim();
  const labelMap: Record<string, string> = {
    "brand": "brand",
    "body": "bodyType",
    "body style": "bodyType",
    "model": "modelIdentifier",
    "model variant": "motorization",
    "variant": "motorization",
    "model identifier": "modelIdentifier",
    "motorization": "motorization",
    "fuel type": "fuelType",
    "body type": "bodyType",
    "color": "color",
    "colour": "color",
    "upholstery": "upholstery",
    "upholstery color": "upholstery",
    "upholstery colour": "upholstery",
    "model year": "modelYear",
    "price": "price",
    "total price": "price",
    "totalprice": "price",
    "marka": "brand",
    "model adi": "modelIdentifier",
    "motor": "motorization",
    "yakit tipi": "fuelType",
    "gövde tipi": "bodyType",
    "govde tipi": "bodyType",
    "renk": "color",
    "model yili": "modelYear",
    "fiyat": "price",
  };

  return labelMap[normalizedLabel] || null;
}

function parseUiSelectedFiltersToKeyValue(
  uiSelectedFilters: string[]
): Record<string, string[]> {
  const keyValueFilters: Record<string, string[]> = {};

  for (const text of uiSelectedFilters) {
    const cleanText = text.replace(/\s+/g, " ").trim();
    const colonIndex = cleanText.indexOf(":");
    if (colonIndex < 0) {
      continue;
    }

    const label = cleanText.slice(0, colonIndex).trim();
    const value = cleanText.slice(colonIndex + 1).trim();
    const facetKey = mapUiLabelToFacetKey(label);
    if (!facetKey) {
      continue;
    }

    if (!keyValueFilters[facetKey]) {
      keyValueFilters[facetKey] = [];
    }

    if (!value) {
      continue;
    }

    keyValueFilters[facetKey].push(value);
  }

  return keyValueFilters;
}

function parseUiSelectedFilterFacetKeys(uiSelectedFilters: string[]): Set<string> {
  const facetKeys = new Set<string>();

  for (const text of uiSelectedFilters) {
    const cleanText = text.replace(/\s+/g, " ").trim();
    const colonIndex = cleanText.indexOf(":");
    if (colonIndex < 0) {
      continue;
    }

    const label = cleanText.slice(0, colonIndex).trim();
    const facetKey = mapUiLabelToFacetKey(label);
    if (facetKey) {
      facetKeys.add(facetKey);
    }
  }

  return facetKeys;
}

function compareUiSelectedFiltersWithFacets(
  facets: Record<string, any>,
  uiSelectedFiltersKV: Record<string, string[]>
): {
  matches: boolean;
  missingFacetValues: string[];
} {
  const uiSelectedFacetKeys = new Set(Object.keys(uiSelectedFiltersKV));
  const facetKeyUiFallbacks: Record<string, string[]> = {
    upholstery: ["upholstery", "color"],
    fuelType: ["fuelType", "motorization"],
  };

  const missingFacetValues: string[] = [];
  for (const [facetKey, facetValue] of Object.entries(facets)) {
    if (facetKey === "price" && uiSelectedFacetKeys.has("price")) {
      continue;
    }

    const rawFacetValues = collectPrimitiveFacetValues(facetValue);
    const candidateUiKeys = facetKeyUiFallbacks[facetKey] || [facetKey];
    const keySpecificUiValues = candidateUiKeys.flatMap(
      (candidateKey) => uiSelectedFiltersKV[candidateKey] || []
    );
    const hasSelectedFacetKey = candidateUiKeys.some((candidateKey) =>
      uiSelectedFacetKeys.has(candidateKey)
    );

    if (hasSelectedFacetKey && keySpecificUiValues.length === 0) {
      continue;
    }

    const keySpecificUiTokens = new Set(
      keySpecificUiValues
        .map((value) => normalizeFacetToken(value))
        .filter((value) => value.length > 0)
    );

    for (const rawValue of rawFacetValues) {
      if (isOpaqueFacetValue(facetKey, rawValue)) {
        continue;
      }

      const expectedCandidates = buildFacetCandidateTokens(rawValue);
      const matchedByKey =
        keySpecificUiTokens.size > 0 &&
        expectedCandidates.some((candidate) => keySpecificUiTokens.has(candidate));

      if (!matchedByKey) {
        missingFacetValues.push(rawValue);
      }
    }
  }

  return {
    matches: missingFacetValues.length === 0,
    missingFacetValues,
  };
}

async function extractUiSelectedFilters(page: Page): Promise<Record<string, string[]>> {
  try {
    await page
      .locator("#emh-selected-filters-reset-button")
      .waitFor({ state: "visible", timeout: 10000 });
    console.debug(
      "[DEBUG] Selected filters reset button visible, proceeding to extract selected filters..."
    );
  } catch (e) {
    console.debug(
      "[DEBUG] Selected filters reset button not visible before extraction, returning empty key-value object..."
    );
    return {};
  }

  const selectors = [".emh-selected-filters__pill", ".selected-filters__pill"];

  for (const selector of selectors) {
    const pills = page.locator(selector);
    try {
      await pills.first().waitFor({ state: "visible" });
    } catch (e) {
      continue;
    }

    const count = await pills.count();
    if (count === 0) {
      continue;
    }

    const texts = await pills.allInnerTexts();
    const normalizedTexts = texts
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 0);

    if (normalizedTexts.length > 0) {
      return parseUiSelectedFiltersToKeyValue(normalizedTexts);
    }
  }

  return {};
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
  const { evaluateSearchResult } = await import("./aiHelpers");
  const testFacets = process.env.TEST_FACETS === "true";
  const actualInput = query?.value ?? query;
  const actualFacets = query?.shouldFilter;
  const smartSearchMessage = results.results.resultText;
  const apiResponse = results.results.responseData;
  const uiSelectedFiltersKV: Record<string, string[]> =
    results.results?.uiSelectedFiltersKV || {};
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
  let openaiEvaluation = customEval ? await customEval(smartSearchMessage) : await evaluateSearchResult(smartSearchMessage);
  let resultCount = 0;
  let hasError = false;
  let uiFacetComparison: {
    matches: boolean;
    missingFacetValues: string[];
  } | null = null;
  const lang = process.env.LANGUAGE?.toLocaleLowerCase() || "en";

  // Handle the new Smart Search + Actual Search response structure
  const searchResults = process.env.API_ENDPOINT_LOCAL === 'true' ? apiResponse.searchResults : apiResponse.data.smartSearch;
  if (searchResults) {
    resultCount =
      searchResults.results?.length ||
      searchResults.navigation?.totalResults ||
      0;
  } else {
    // If no search results, it means smart search failed or returned no URL
    resultCount = 0;
  }  

  // Facets check (test-data vs BE)  
  if (testFacets && actualFacets && !deepEqual(facets, actualFacets, ["__typename"])) {
    openaiEvaluation = `Facets mismatch: expected ${JSON.stringify(actualFacets)}, got ${JSON.stringify(facets)}`;
    hasError = true;
  }

  // Facets check (UI vs BE)
  const facetMismatches: string[] = [];
  if (testFacets && Object.keys(uiSelectedFiltersKV).length > 0) {
    uiFacetComparison = compareUiSelectedFiltersWithFacets(
      facets,
      uiSelectedFiltersKV
    );
    if (!uiFacetComparison.matches) {
      facetMismatches.push(
        `UI filters mismatch with BE facets: missing ${JSON.stringify(
          uiFacetComparison.missingFacetValues
        )}, uiSelectedFiltersKV ${JSON.stringify(uiSelectedFiltersKV)}, beFacets ${JSON.stringify(facets)}`
      );
    }
  }
  if (facetMismatches.length > 0) {
    openaiEvaluation = facetMismatches.join(" | ");
    hasError = true;
  }

  // Validate language consistency between query and response using OpenAI
  const langCompletion = await openaiChatCompletion([
    { role: "system", content: "You are a linguistic expert. Evaluate if the two texts are of the same language." },
    { role: "user", content: `Text#1: '${actualInput}'\nText#2: '${smartSearchMessage}'\nRespond with 'YES' only if they are the same language, otherwise respond with 2-digit language code of Text#1 and Text#2.` }
  ], {
    max_tokens: 10,
    temperature: 0.2
  });
  const langCheckResult = langCompletion.choices?.[0]?.message?.content?.trim().toUpperCase() || "NO";
  if (langCheckResult !== "YES") {
    console.debug("[DEBUG] Language consistency check: FAIL");
    openaiEvaluation = `Language Inconsistency - '${langCheckResult}'`;
    hasError = true;
  }

  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${hasError ? "❌ FAIL |" : "✅"} ${openaiEvaluation} | ${testTitle}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Query:         '${actualInput}'`);
  console.log(`Response:      '${smartSearchMessage}'`);
  console.log(
    `UI Filters:    '${JSON.stringify(uiSelectedFiltersKV)}'`
  );
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
    // apiResponse,
    openaiEvaluation,
    facets,
    uiSelectedFiltersKV,
    uiFacetComparison,
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
  await handlePostalCodePopUp(page);
  return page;
}

export async function handleCookieBanner(page: Page): Promise<void> {
  try {
    await page
      .locator(".cmm-cookie-banner__content")
      .waitFor({ state: "visible", timeout: 60000 });
    await page.click(".button--accept-all");
  } catch (e) {
    console.debug("[DEBUG] Cookie banner not visible, continuing execution...");
  }
}

export async function handlePostalCodePopUp(page: Page): Promise<void> {
  try {
    const trigger = page.locator(
      '[data-test-id="header-integration-item-emh-region-picker"]'
    );
    const popup = page.locator('[data-test-id="region-picker-module-flyout"]');
    const regionPicker = popup.locator("dh-io-emh-region-picker");

    const country = COUNTRY || "KR";
    const addressesFile = await fs.readFile(
      "./tests/data/emh-addresses.json",
      "utf-8"
    );
    const addresses = JSON.parse(addressesFile);
    const postalCode = addresses[country]?.postalCode;

    if (!postalCode) {
      console.debug(
        `[DEBUG] No postal code configured for country '${country}', skipping region picker submission.`
      );
      return;
    }

    const postalCodeInput = popup
      .getByRole("textbox")
      .or(popup.getByRole("spinbutton"))
      .or(
        popup.locator(
          'input[aria-invalid], input[inputmode], input[type="text"], input[type="number"]'
        )
      )
      .first();
    const submitButton = popup.locator(".region-picker-content__submit-button");

    if (await trigger.isVisible({ timeout: 10000 }).catch(() => false)) {
      const isExpanded = await trigger.getAttribute("aria-expanded");
      if (isExpanded !== "true") {
        await trigger.click();
      }
    }

    await popup.waitFor({ state: "visible", timeout: 10000 });
    await regionPicker.waitFor({ state: "attached", timeout: 10000 });
    await postalCodeInput.waitFor({ state: "visible", timeout: 10000 });
    await postalCodeInput.fill("");
    await postalCodeInput.fill(postalCode);
    await submitButton.waitFor({ state: "visible", timeout: 10000 });
    await submitButton.click();
  } catch (e) {
    console.debug(
      `[DEBUG] Postal code pop-up handling skipped: ${e instanceof Error ? e.message : e}`
    );
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
        // console.info("[DEBUG] API response received from endpoint:", endpoint);
        apiResponsePayload = await response.json();
        responseCaptured = true;
        if (responseCapturedPromiseResolve) responseCapturedPromiseResolve();
      }
    } catch (e) {
      console.warn("[DEBUG] Failed to capture API response payload:", e);
    }
  };
  page.on("response", responseListener);

  if (await searchButton.isVisible()) await searchButton.click();

  let retries = 0;
  let resultText = "";
  const startTime = Date.now();
  const successResultLocator = page.locator(".smart-search__bubble p").first();
  const errorResultLocator = page
    .locator(
      ".smart-search__notification.wbx-notification--error .wbx-notification__content"
    )
    .first();
  while (retries < 3) {
    try {
      console.debug(
        `[DEBUG] Waiting for results to be visible (attempt ${
          retries + 1
        }/3)...`
      );
      await successResultLocator
        .or(errorResultLocator)
        .first()
        .waitFor();

      const errorVisible = await errorResultLocator
        .isVisible()
        .catch(() => false);
      if (errorVisible) {
        resultText = await errorResultLocator.innerText();
        break;
      }

      resultText = await successResultLocator.innerText();

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
      if (await searchButton.isVisible().catch(() => false)) {
        await searchButton.click();
      }
    }
  }

  const responseTime = Date.now() - startTime;
  const uiSelectedFiltersKV = await extractUiSelectedFilters(page);
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
          uiSelectedFiltersKV,
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
      uiSelectedFiltersKV,
    },
    responseTime,
    error: retries === 3 ? "Failed to retrieve results after 3 attempts" : undefined,
  };
}
