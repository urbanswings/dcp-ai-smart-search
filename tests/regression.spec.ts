import "dotenv/config";
import { test, expect } from "@playwright/test";
import { runTestsAndSaveResults } from "./utils/shared";
import { performUISmartSearchAndGetResults, processAndLogUiResult, setupContextAndPage } from "./utils/uiHelpers";
import { performApiSmartSearchAndGetResults, processAndLogApiResult } from "./utils/apiHelpers";

test.describe("Regression Tests", () => {
  const describeName = "Regression Tests";
  test.beforeEach(() => {
    test.skip(!process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required for evaluator regression checks.");
  });

  test("Evaluate Bug Fixes", { tag: ["@regression"] }, async ({ browser }) => {
    const queries = [
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
