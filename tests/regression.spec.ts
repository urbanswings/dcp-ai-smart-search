import "dotenv/config";
import { test } from "@playwright/test";
import { runTestsAndSaveResults } from "./utils/shared";
import { performUISmartSearchAndGetResults, processAndLogUiResult, setupContextAndPage } from "./utils/uiHelpers";
import { performApiSmartSearchAndGetResults, processAndLogApiResult } from "./utils/apiHelpers";

const informativeHints = [
  'Respond with "PASS" when the response directly helps the user query by presenting relevant Mercedes-Benz options and does not refuse the request. For queries like "white family cars", recommendation-style answers such as "I found vehicles matching your request" are valid PASS outcomes.',
  'Treat as "PASS" if the response aligns with the requested intent and the applied filters/facets reflect key constraints (for example white color and family-suitable body types such as SUV/Offroader or Limousine). Exact wording is not required if intent match is clear.',
  'Respond with "FAIL" if the response includes any statement implying inability, limitation, or mismatch for the request (for example: no match/no exact match, unable/cannot find, limitation with the request, request cannot be fulfilled, or similar disclaimer wording), even if options are shown afterward. These regression queries are expected to be matchable and should not include inability/limitation disclaimers.',
  'Respond with "FAIL" when the answer is off-topic, refuses/declines without a valid safety reason, or clearly contradicts the request. Do not fail merely because tone is generic or because model counts/body-type combinations vary while still matching intent.',
];

const regressionQueryValues = [
  "white cars for families",
  "white family cars",
  "cars that are white and good for families",
  "cars that are white and suitable for families",
  "cars that are white and ideal for families",
  "white cars that are good for families",
  "white cars that are suitable for families",
  "white cars that are ideal for families",
  "family cars that are white",
  "family cars that are white in color",
  "family cars that are white in color and good for families",
  "family cars that are white in color and suitable for families",
  "family cars that are white in color and ideal for families",
  "family cars that are white and good for families",
  "family cars that are white and suitable for families",
  "family cars that are white and ideal for families",
  "white cars for families with children",
  "white cars for families with kids",
  "white cars for families with offspring",
  "white cars for families with young ones",
];

test.describe("Regression Tests", () => {
  const describeName = "Regression Tests";
  test.beforeEach(() => {
    test.skip(!process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required for evaluator regression checks.");
  });

  test("Evaluate Bug Fixes", { tag: ["@regression"] }, async ({ browser }) => {
    const queries = regressionQueryValues.map((value) => ({
      value,
      shouldRecommend: true,
      shouldFilter: {},
      aiEvaluationHints: {
        value: informativeHints,
        overwrite: true,
      },
    }));
    await runTestsAndSaveResults({
      queries: queries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "from-regression-list",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });
});
