import {
  normalizeFacetToken,
  validateExpectedFacets,
} from "../facets/facetAssertionHelpers";
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
} from "../core/resultEvaluationHelpers";
import type { ApiSearchResult } from "../core/searchResultTypes";

const LANGUAGE = process.env.LANGUAGE;

function buildFacetCandidateTokens(rawValue: string): string[] {
  const normalizedRaw = normalizeFacetToken(rawValue || "");
  const candidates = new Set<string>();
  if (normalizedRaw) {
    candidates.add(normalizedRaw);
  }

  if (rawValue?.includes("_")) {
    const lastToken = rawValue.split("_").pop() || rawValue;
    const normalizedLastToken = normalizeFacetToken(lastToken);
    if (normalizedLastToken) {
      candidates.add(normalizedLastToken);
    }
  }

  return Array.from(candidates);
}

export async function processAndLogApiResult({
  query,
  results,
  testDescribe,
  testTitle,
  expectedStatusCode,
}: {
  query: any;
  results: ApiSearchResult;
  testDescribe: string;
  testTitle: string;
  expectedStatusCode?: number;
}): Promise<any> {
  const lang = (process.env.LANGUAGE || LANGUAGE)?.toLocaleLowerCase() || "en";
  const actualInput = query?.value ?? query;
  const actualFacets = query?.shouldFilter;

  if (results.error) {
    console.error(
      `API call failed with error for '${actualInput}': ${results.error}`,
    );
    return {
      testMode: "api",
      testDescribe,
      testTitle,
      query: {
        [`${lang}`]: actualInput,
      },
      openaiEvaluation: `API call failed with error: ${results.error}`,
      responseResult: "FAIL",
      facetsResult: "FAIL",
      hasError: true,
    };
  }

  const testFacets = process.env.TEST_FACETS === "true";
  const aiEvaluationHints = query?.aiEvaluationHints;
  const skipOpenAiEvaluation = query?.skipOpenAiEvaluation === true;
  const smartSearchMessage = results.results?.resultText || "";
  const apiResponse = results.results?.responseData;
  const resultsFacets = extractSmartSearchParameters(
    results.results.responseData,
  );
  let openaiEvaluation = "No results to evaluate";
  let resultCount = 0;
  let hasError = false;
  let responseCheckPassed = true;
  let facetsCheckPassed = true;
  const beFacetDiagnosticLines: string[] = [];
  const failureReasons: string[] = [];
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
  const addApiFailureReason = (reason: string) => {
    addFailureReason(failureState, reason);
  };

  if (expectedStatusCode && results.statusCode !== expectedStatusCode) {
    responseCheckPassed = false;
    addApiFailureReason(
      `Status Code Mismatch: Expected ${expectedStatusCode}, got ${results.statusCode}`,
    );
  } else if (expectedStatusCode && results.statusCode === expectedStatusCode) {
    openaiEvaluation = `Expected status code ${expectedStatusCode} received as expected`;
    hasError = false;

    if (results.results) {
      const smartSearchResponse = results.results.resultText;
      resultCount = getSmartSearchResultCount(apiResponse);

      if (resultCount === 0) {
        responseCheckPassed = false;
        addApiFailureReason("Payload is zero");
      }

      openaiEvaluation = await evaluateSmartSearchMessage({
        smartSearchMessage: smartSearchResponse,
        aiEvaluationHints,
        actualInput,
        skipOpenAiEvaluation,
        emptyMessageEvaluation: "No results to evaluate",
      });
      if (
        !isPassEvaluation(openaiEvaluation, {
          allowExpectedStatus: true,
        })
      ) {
        responseCheckPassed = false;
      }
    }
  } else if (
    (results.error || results.results?.errors) &&
    results.statusCode !== 400
  ) {
    responseCheckPassed = false;
    addApiFailureReason(
      `API Error: ${results.results?.errors
        ?.map((err: any) => err.message)
        .join("; ")}`,
    );
  } else if (results.results) {
    resultCount = getSmartSearchResultCount(apiResponse);

    if (resultCount === 0 && !actualFacets) {
      responseCheckPassed = false;
      addApiFailureReason("Payload is zero");
    } else if (resultCount === 0 && actualFacets) {
      // Skip "Payload is zero" when facets are being validated.
    }

    const smartSearchResponse = results.results.resultText;
    openaiEvaluation = await evaluateSmartSearchMessage({
      smartSearchMessage: smartSearchResponse,
      aiEvaluationHints,
      actualInput,
      skipOpenAiEvaluation,
      emptyMessageEvaluation: "No results to evaluate",
    });
    if (
      !isPassEvaluation(openaiEvaluation, {
        allowExpectedStatus: true,
      })
    ) {
      responseCheckPassed = false;
    }
  }

  const countValidation = await validateResponseVehicleCount(
    smartSearchMessage,
    resultCount,
  );
  const responseVehicleTotalCount = countValidation.responseVehicleTotalCount;
  let countCheckPassed = countValidation.countCheckPassed;
  if (!countValidation.countCheckPassed) {
    responseCheckPassed = false;
    addApiFailureReason(countValidation.failureReason || "");
  }

  if (actualFacets === false) {
    beFacetDiagnosticLines.push(
      `Expected Facets: ${JSON.stringify(actualFacets)}`,
    );
    beFacetDiagnosticLines.push(
      `Actual Facets:   ${JSON.stringify(resultsFacets)}`,
    );
    if (Object.keys(resultsFacets).length > 0) {
      facetsCheckPassed = false;
      addApiFailureReason(
        `Expected no filters, but got ${JSON.stringify(resultsFacets)}`,
      );
    }
  } else if (actualFacets === true) {
    beFacetDiagnosticLines.push(
      `Expected Facets: ${JSON.stringify(actualFacets)}`,
    );
    beFacetDiagnosticLines.push(
      `Actual Facets:   ${JSON.stringify(resultsFacets)}`,
    );
    if (Object.keys(resultsFacets).length === 0) {
      facetsCheckPassed = false;
      addApiFailureReason(
        `Expected at least one filter to be applied, but got none`,
      );
    }
  } else if (testFacets && actualFacets && typeof actualFacets === "object") {
    const facetValidation = await validateExpectedFacets({
      actualFacets,
      resultsFacets,
      responseData: apiResponse?.data || {},
      buildFacetCandidateTokens,
      enforceOnlyExpectedIncludedValues: true,
    });
    beFacetDiagnosticLines.push(
      `Expected Facets: ${JSON.stringify(facetValidation.expectedBeFacets)}`,
    );
    beFacetDiagnosticLines.push(
      `Actual Facets:   ${JSON.stringify(resultsFacets)}`,
    );
    if (!facetValidation.passed) {
      facetsCheckPassed = false;
      failureReasons.push(...facetValidation.failureReasons);
      addApiFailureReason(
        `Facets check failed: ${facetValidation.failureReasons.join("; ")}`,
      );
    }
  }

  const languageFailureReason = await validateLanguageConsistency(
    actualInput,
    smartSearchMessage,
  );
  if (languageFailureReason) {
    responseCheckPassed = false;
    addApiFailureReason(languageFailureReason);
  }

  const normalizedEvaluation = (openaiEvaluation || "").trim();
  const evaluationPassed = isPassEvaluation(normalizedEvaluation, {
    allowExpectedStatus: true,
  });
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
  });

  return {
    timestamp: new Date().toISOString(),
    timestampSG: new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    }),
    testMode: "api",
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
    responseVehicleTotalCount,
    responseTime: results.responseTime,
    statusCode: results.statusCode,
    hasError: displayHasError,
    error: results.error,
    // apiResponse,
    openaiEvaluation: openaiEvaluation,
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
    },
    facets: {
      expected: actualFacets,
      actual: resultsFacets,
      failureReasons: !facetsCheckPassed ? failureReasons : undefined,
    },
  };
}
