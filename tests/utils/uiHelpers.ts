import { Page } from "@playwright/test";
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
export {
  handleCookieBanner,
  handlePostalCodePopUp,
  setupContextAndPage,
} from "./uiPageSetupHelpers";

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
