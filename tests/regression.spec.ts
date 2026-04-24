import "dotenv/config";
import { test } from "@playwright/test";
import { runTestsAndSaveResults } from "./utils/shared";
import { performUISmartSearchAndGetResults, processAndLogUiResult, setupContextAndPage } from "./utils/uiHelpers";
import { performApiSmartSearchAndGetResults, processAndLogApiResult } from "./utils/apiHelpers";
import {
  loadRegressionQueriesFromDescription,
  summarizeRegressionRunWithAI,
} from "./utils/regressionHelpers";

test.describe("Regression Tests", () => {
  const describeName = "Regression Tests";

  test("Smart Regression Evaluation (SRE)", { tag: ["@regression"] }, async ({ browser }) => {
    const queries = await loadRegressionQueriesFromDescription();

    await runTestsAndSaveResults({
      queries: queries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "smart-regression-evaluation",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
      postRunAnalysis: summarizeRegressionRunWithAI,
    });
  });
});
