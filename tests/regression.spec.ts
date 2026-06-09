import "dotenv/config";
import { test } from "@playwright/test";
import { runTestsAndSaveResults, runTestsRepeatedAndSaveResults } from "./utils/shared";
import { performUISmartSearchAndGetResults, processAndLogUiResult, setupContextAndPage } from "./utils/uiHelpers";
import { fetchEmhApiResponse, performApiSmartSearchAndGetResults, processAndLogApiResult } from "./utils/apiHelpers";
import {
  loadRegressionQueriesFromDescription,
  summarizeRegressionRunWithAI,
  loadIntermittencyQueries,
  loadMCETestData,
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
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("Multi Country Evaluation (MCE)", { tag: ["@regression", "@multi-country"] }, async ({ browser }) => {
    const mceTestData = await loadMCETestData();
    
    if (mceTestData.length === 0) {
      console.warn("⚠️  No MCE test data loaded, skipping test.");
      return;
    }

    const supportedCountries = ["AU", "EN", "IN", "JP", "KR", "SG", "TH", "TR",];
    
    if (supportedCountries.length === 0) {
      console.warn("⚠️  No supported countries discovered, skipping test.");
      return;
    }

    const originalCountry = process.env.COUNTRY;
    
    // Run MCE test for each supported country
    for (const country of supportedCountries) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🌍 Running MCE test for country: ${country}`);
      console.log(`${"=".repeat(60)}\n`);

      // Temporarily update the country for this iteration
      process.env.COUNTRY = country;

      try {
        await runTestsAndSaveResults({
          queries: mceTestData,
          testDescribe: describeName,
          testTitle: `${test.info().title} - ${country}`,
          testType: "multi-country-evaluation",
          browser,
          setupContextAndPage,
          performUISmartSearchAndGetResults,
          processAndLogUiResult,
          performApiSmartSearchAndGetResults,
          processAndLogApiResult,
          postRunAnalysis: summarizeRegressionRunWithAI,
        });
      } catch (error) {
        console.error(`❌ Error running MCE test for country ${country}:`, error);
      }
    }

    // Restore the original country
    if (originalCountry) {
      process.env.COUNTRY = originalCountry;
    } else {
      delete process.env.COUNTRY;
    }
    
    console.log(`\n✅ Multi Country Evaluation (MCE) completed for all ${supportedCountries.length} countries.`);
  });
});
