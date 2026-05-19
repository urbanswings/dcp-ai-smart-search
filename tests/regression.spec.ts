import "dotenv/config";
import { test } from "@playwright/test";
import { runTestsAndSaveResults, runTestsRepeatedAndSaveResults } from "./utils/shared";
import { performUISmartSearchAndGetResults, processAndLogUiResult, setupContextAndPage } from "./utils/uiHelpers";
import { fetchEmhApiResponse, performApiSmartSearchAndGetResults, processAndLogApiResult } from "./utils/apiHelpers";
import {
  loadRegressionQueriesFromDescription,
  summarizeRegressionRunWithAI,
  loadIntermittencyQueries,
} from "./utils/regressionHelpers";
import path from "path";
import fs from "fs/promises";

test.describe("Regression Tests", () => {
  const describeName = "Regression Tests";

  test.beforeAll(async () => {
    console.log("Setting up regression tests...");
    
    // Fetch EMH GraphQL API response and save to file
    try {
      const emhApiResponse = await fetchEmhApiResponse();
      const outputPath = path.join(__dirname, "data/emh-api-response.json");
      await fs.writeFile(
        outputPath,
        JSON.stringify(emhApiResponse, null, 2),
        "utf-8"
      );
      console.log(`Saved EMH API response to: ${outputPath}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to fetch and save EMH API response:", errorMessage);
    }
  });

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

  test("Intermittent Issues Check (IIC)", { tag: ["@regression", "@intermittent"] }, async ({ browser }) => {
    const queries = await loadIntermittencyQueries();

    await runTestsRepeatedAndSaveResults({
      queries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "intermittency-check",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });
});
