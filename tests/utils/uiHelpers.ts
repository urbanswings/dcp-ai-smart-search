import { Browser, Page } from "@playwright/test";
import fs from "fs/promises";
import { chromium } from "playwright";
import {
  addFailureReason,
  evaluateSmartSearchMessage,
  extractSmartSearchParameters,
  getCountStatus,
  getSmartSearchResultCount,
  isPassEvaluation,
  logResultSummary,
  translateResultText,
  validateLanguageConsistency,
  validateResponseVehicleCount,
} from "./resultEvaluationHelpers";
import { validateExpectedFacets } from "./facetAssertionHelpers";
import {
  buildFacetCandidateTokens,
  compareUiSelectedFiltersWithFacets,
  compareUiSelectedFiltersWithFacetsByExpectedValue,
  extractUiSelectedFilters,
  updateRuntimeFacetAliasesFromApiResponse,
} from "./uiFacetFilterHelpers";
import {
  assertSubmitDisabled,
  clickSearchAndWaitForResult,
  createSmartSearchResponseCapture,
  fillSmartSearchInput,
  getSmartSearchEndpoint,
  getSmartSearchLocators,
  waitForCapturedSmartSearchResponse,
  waitForSmartSearchControls,
} from "./uiSearchFlowHelpers";
import type { UiSearchResult } from "./uiTypes";

export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const LANGUAGE = process.env.LANGUAGE;
export const PRODUCT = process.env.PRODUCT;

export type { UiSearchResult } from "./uiTypes";

export async function processAndLogUiResult({
  query,
  results,
  testDescribe,
  testTitle,
  page,
}: {
  query: any;
  results: UiSearchResult;
  testDescribe: string;
  testTitle: string;
  page: Page;
}): Promise<any> {
  const isPassEvaluation = (value: string): boolean => {
    const normalized = (value || "").trim();
    return normalized.toUpperCase() === "PASS";
  };

  const lang = (process.env.LANGUAGE || LANGUAGE)?.toLocaleLowerCase() || "en";
  const actualInput = query?.value ?? query;
  const actualFacets = query?.shouldFilter;

  if (results.error) {
    console.error(`UI call failed with error: ${results.error}`);
    return {
      testMode: "ui",
      testDescribe,
      testTitle,
      query: {
        [`${lang}`]: actualInput,
      },
      openaiEvaluation: `UI call failed with error: ${results.error}`,
      results: {
        responseResult: "FAIL",
        facetsResult: "FAIL",
      },
      hasError: true,
    };
  }

  const testFacets = process.env.TEST_FACETS === "true";
  const aiEvaluationHints = query?.aiEvaluationHints;
  const skipOpenAiEvaluation = query?.skipOpenAiEvaluation === true;
  const smartSearchMessage = results.results.resultText;
  const apiResponse = results.results.responseData;
  updateRuntimeFacetAliasesFromApiResponse(apiResponse);
  const uiSelectedFiltersKV: Record<string, string[]> =
    results.results?.uiSelectedFiltersKV || {};
  const resultsFacets = extractSmartSearchParameters(
    results.results.responseData,
  );
  let openaiEvaluation = await evaluateSmartSearchMessage({
    smartSearchMessage,
    aiEvaluationHints,
    actualInput,
    skipOpenAiEvaluation,
    emptyMessageEvaluation: "Empty UI response message",
  });
  let resultCount = getSmartSearchResultCount(apiResponse);
  let hasError = false;
  let responseCheckPassed = true;
  let facetsCheckPassed = true;
  let countCheckPassed = true;
  let uiFacetComparison: {
    matches: boolean;
    missingFacetValues: string[];
  } | null = null;
  const failureState = {
    get openaiEvaluation() {
      return openaiEvaluation;
    },
    set openaiEvaluation(value: string) {
      openaiEvaluation = value;
    },
    get hasError() {
      return hasError;
    },
    set hasError(value: boolean) {
      hasError = value;
    },
  };
  const addUiFailureReason = (reason: string) => {
    addFailureReason(failureState, reason);
  };

  if (!smartSearchMessage?.trim()) {
    responseCheckPassed = false;
    addUiFailureReason("UI response bubble text is empty");
  }

  if (!isPassEvaluation(openaiEvaluation)) {
    responseCheckPassed = false;
  }

  // Extract UI vehicle count if page is provided
  let uiVehicleCount: number | null = null;
  try {
    const uiCountElement = page.locator(
      '[data-test-id="srp__header-results__result-amount__number"]',
    );
    const uiCountText = await uiCountElement.innerText();
    uiVehicleCount = parseInt(uiCountText.replace(/[^0-9]/g, ""), 10);
    if (isNaN(uiVehicleCount)) {
      uiVehicleCount = null;
    }
  } catch (e) {
    console.debug("[DEBUG] Could not extract UI vehicle count:", e);
  }
  if (uiVehicleCount === 0 && resultCount > 0) {
    responseCheckPassed = false;
    addUiFailureReason("UI is zero");
  }

  // Basic check to see if payload is empty (could be due to errors or unexpected response structure)
  // But skip this check if facets are being validated (empty results can be valid for faceted queries)
  if (resultCount === 0 && !actualFacets) {
    responseCheckPassed = false;
    addUiFailureReason("Payload is zero");
  } else if (resultCount === 0 && actualFacets) {
    // Skip "Payload is zero" when facets are being validated
  }

  const countValidation = await validateResponseVehicleCount(
    smartSearchMessage,
    resultCount,
  );
  const responseVehicleTotalCount = countValidation.responseVehicleTotalCount;
  countCheckPassed = countValidation.countCheckPassed;
  if (!countValidation.countCheckPassed) {
    responseCheckPassed = false;
    addUiFailureReason(countValidation.failureReason || "");
  }

  // Facets check (test-data vs BE)
  if (actualFacets === false) {
    // shouldFilter: false — assert no filters were applied
    if (Object.keys(resultsFacets).length > 0) {
      facetsCheckPassed = false;
      addUiFailureReason(
        `Expected no filters, but got ${JSON.stringify(resultsFacets)}`,
      );
    }
  } else if (actualFacets === true) {
    // shouldFilter: true — assert at least one filter was applied
    if (Object.keys(resultsFacets).length === 0) {
      facetsCheckPassed = false;
      addUiFailureReason(
        `Expected at least one filter to be applied, but got none`,
      );
    }
  } else if (testFacets && actualFacets && typeof actualFacets === "object") {
    const facetValidation = await validateExpectedFacets({
      actualFacets,
      resultsFacets,
      responseData: results.results.responseData?.data || {},
      buildFacetCandidateTokens,
      matchIncludedValuesWithCandidates: true,
    });

    if (!facetValidation.passed) {
      facetsCheckPassed = false;
      addUiFailureReason(
        `BE Facets check failed: ${facetValidation.failureReasons.join("; ")}`,
      );
    }
  }

  // Facets check (Query vs UI vs BE)
  const facetMismatches: string[] = [];
  if (
    resultsFacets.equipment ||
    resultsFacets.lines ||
    resultsFacets.packages
  ) {
    const mappableFacets: Array<"equipment" | "lines" | "packages"> = [
      "equipment",
      "lines",
      "packages",
    ];

    for (const facetKey of mappableFacets) {
      if (!Array.isArray(resultsFacets[facetKey])) continue;

      const apiFacetValues: Array<{ formattedValue: string; value: string }> =
        apiResponse?.data?.smartSearch?.facets?.[facetKey]?.values ?? [];
      const codeToName = new Map<string, string>(
        apiFacetValues.map((f) => [f.value, f.formattedValue]),
      );

      resultsFacets[facetKey] = (resultsFacets[facetKey] as string[]).map(
        (code: string) => codeToName.get(code) ?? code,
      );
    }
  }
  uiFacetComparison = compareUiSelectedFiltersWithFacets(
    resultsFacets,
    uiSelectedFiltersKV,
  );
  if (
    query?.facet === "equipment" ||
    query?.facet === "lines" ||
    query?.facet === "packages"
  ) {
    uiFacetComparison = compareUiSelectedFiltersWithFacetsByExpectedValue(
      query.filterValue,
      resultsFacets,
      uiSelectedFiltersKV,
      query.facet,
    );
  }
  if (!uiFacetComparison.matches) {
    facetMismatches.push(
      `UI Filters Mismatch: missing ${JSON.stringify(
        uiFacetComparison.missingFacetValues,
      )}, uiSelectedFiltersKV ${JSON.stringify(uiSelectedFiltersKV)}, beFacets ${JSON.stringify(resultsFacets)}`,
    );
  }
  if (testFacets && facetMismatches.length > 0) {
    facetsCheckPassed = false;
    addUiFailureReason(facetMismatches.join(" | "));
  }

  const languageFailureReason = await validateLanguageConsistency(
    actualInput,
    smartSearchMessage,
  );
  if (languageFailureReason) {
    responseCheckPassed = false;
    addUiFailureReason(languageFailureReason);
  }

  const normalizedEvaluation = (openaiEvaluation || "").trim();
  const evaluationPassed = isPassEvaluation(normalizedEvaluation);
  const displayHasError = hasError || !evaluationPassed;
  const messageStatus = evaluationPassed ? "PASS" : "FAIL";
  const countStatus = getCountStatus(
    responseVehicleTotalCount,
    countCheckPassed,
  );
  const filterStatus = facetsCheckPassed ? "PASS" : "FAIL";
  const { queryEn, smartSearchMessageEn } = await translateResultText(
    lang,
    actualInput,
    smartSearchMessage,
  );

  logResultSummary({
    displayHasError,
    openaiEvaluation,
    testTitle,
    messageStatus,
    countStatus,
    filterStatus,
    actualInput,
    smartSearchMessage,
    translatedText: { queryEn, smartSearchMessageEn },
    responseVehicleTotalCount,
    resultCount,
    actualFacets,
    resultsFacets,
    uiVehicleCount,
    uiSelectedFiltersKV,
  });
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
      en: queryEn,
    },
    response: {
      [`${lang}`]: smartSearchMessage,
      en: smartSearchMessageEn,
    },
    resultCount,
    uiVehicleCount,
    responseVehicleTotalCount,
    responseTime: results.responseTime,
    statusCode: null,
    hasError: displayHasError,
    error: results.error,
    // apiResponse,
    openaiEvaluation,
    results: {
      responseResult: responseCheckPassed ? "PASS" : "FAIL",
      facetsResult: facetsCheckPassed ? "PASS" : "FAIL",
      countResult:
        responseVehicleTotalCount === null
          ? "SKIP"
          : countCheckPassed
            ? "PASS"
            : "FAIL",
      responseVehicleTotalCount,
      backendResultCount: resultCount,
      uiVehicleCount,
    },
    facets: {
      expected: actualFacets,
      actual: resultsFacets,
      ui: uiSelectedFiltersKV,
    },
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

  // Intercept and override the response payload only if OVERRIDE_CONFIG_FILE is set to 'true'
  if (process.env.OVERRIDE_CONFIG_FILE === "true") {
    await page.route(
      (urlObj: URL) => {
        const url = urlObj.toString();
        // Use the value from the 'country' variable for the config file match
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

        // Modify the payload
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

        // Fulfill the route with the modified payload
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(modifiedPayload),
        });
      },
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
  const language = (process.env.LANGUAGE || LANGUAGE || "EN").toUpperCase();
  const marketUrls = urls[country];
  let url =
    marketUrls?.[env] ||
    marketUrls?.[language]?.[env] ||
    marketUrls?.EN?.[env] ||
    marketUrls?.JP?.[env];
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

export async function performUISmartSearchAndGetResults(
  page: Page,
  query: any = "",
  submitDisabled: boolean = false,
): Promise<UiSearchResult> {
  const env = process.env.ENVIRONMENT || "INT";
  const locators = getSmartSearchLocators(page);
  const waitError = await waitForSmartSearchControls(page, locators);
  if (waitError) {
    return {
      query,
      results: "[Script] FAILED: Search UI not visible",
      responseTime: 0,
      error: waitError,
    };
  }

  const actualInput = query?.value ?? query;
  const inputError = await fillSmartSearchInput(locators.input, actualInput);
  if (inputError) {
    return {
      query,
      results: "[Script] FAILED: Search input not usable",
      responseTime: 0,
      error: inputError,
    };
  }

  if (submitDisabled) {
    return assertSubmitDisabled(query, locators.searchButton);
  }

  const endpoint = getSmartSearchEndpoint(env);
  const responseCapture = createSmartSearchResponseCapture(page, endpoint);
  const startTime = Date.now();
  const searchResult = await clickSearchAndWaitForResult(
    page,
    locators.searchButton,
  );

  const responseTime = Date.now() - startTime;
  const uiSelectedFiltersKV = await extractUiSelectedFilters(page);
  // Wait for responseListener to capture a response (max 30s)
  if (!responseCapture.isCaptured()) {
    try {
      await waitForCapturedSmartSearchResponse(responseCapture);
    } catch (e) {
      responseCapture.dispose();
      const errMsg = searchResult.pageClosed
        ? "Page was closed during search"
        : "Failed to capture API response within timeout";
      return {
        query,
        results: {
          resultText: searchResult.resultText,
          responseData: null,
          uiSelectedFiltersKV,
        },
        responseTime,
        error: errMsg,
      };
    }
  }
  responseCapture.dispose();

  let errorMsg: string | undefined;
  if (searchResult.pageClosed) {
    errorMsg = "Page was closed during search";
  } else if (searchResult.retries === 3) {
    errorMsg = "Failed to retrieve results after 3 attempts";
  }

  return {
    query,
    results: {
      resultText: searchResult.resultText,
      responseData: responseCapture.getPayload(),
      uiSelectedFiltersKV,
    },
    responseTime,
    error: errorMsg,
  };
}
