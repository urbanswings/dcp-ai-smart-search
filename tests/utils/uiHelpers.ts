import { Page } from "@playwright/test";
import { extractUiSelectedFilters } from "./uiFacetFilterHelpers";
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
export { processAndLogUiResult } from "./uiResultLoggingHelpers";

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
