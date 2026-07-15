import "dotenv/config";
import { test } from "@playwright/test";
import {
  runTestsAndSaveResults,
  runTestsRepeatedAndSaveResults,
} from "./utils/core/shared";
import {
  performUISmartSearchAndGetResults,
  processAndLogUiResult,
  setupContextAndPage,
} from "./utils/ui/uiHelpers";
import {
  performApiSmartSearchAndGetResults,
  processAndLogApiResult,
} from "./utils/api/apiHelpers";
import { fetchAndSaveEmhApiResponse } from "./utils/core/sharedSpecHelpers";
import { loadFacetCompleteSuite } from "./utils/query/queryHelpers";
import {
  loadRegressionQueriesFromDescription,
  summarizeRegressionRunWithAI,
  loadIntermittencyQueries,
  loadMCETestData,
} from "./utils/regression/regressionHelpers";
import {
  getLanguageForCountry,
  restoreCountryAndLanguage,
  setCountryAndLanguage,
  SUPPORTED_COUNTRIES,
} from "./utils/regression/regressionSpecHelpers";
import path from "path";

test.describe("[SmartSearch] Regression", () => {
  const describeName = "Regression";
  const emhApiResponsePath = path.join(__dirname, "data/emh-api-response.json");

  test.beforeAll(async () => {
    console.log("Setting up regression tests...");
    await fetchAndSaveEmhApiResponse(emhApiResponsePath);
  });

  // Test: Smart Regression Evaluation (SRE)
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

  // Test: Intermittent Issues Check (IIC)
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

  // Test group: Multi Country Evaluation (MCE)
  for (const country of SUPPORTED_COUNTRIES) {
    // Test: Multi Country Evaluation (MCE) - {country}
    test(`Multi Country Evaluation (MCE) - ${country}`, { tag: ["@regression", "@multi-country"] }, async ({ browser }) => {
      const mceTestData = await loadMCETestData();

      if (mceTestData.length === 0) {
        console.warn("⚠️  No MCE test data loaded, skipping test.");
        return;
      }

      const originalCountry = process.env.COUNTRY;
      const originalLanguage = process.env.LANGUAGE;

      console.log(`\n${"=".repeat(60)}`);
      console.log(`🌍 Running MCE test for country: ${country}`);
      console.log(`${"=".repeat(60)}\n`);

      setCountryAndLanguage(country);

      try {
        await runTestsAndSaveResults({
          queries: mceTestData,
          testDescribe: describeName,
          testTitle: test.info().title,
          testType: "multi-country-evaluation",
          browser,
          setupContextAndPage,
          performUISmartSearchAndGetResults,
          processAndLogUiResult,
          performApiSmartSearchAndGetResults,
          processAndLogApiResult,
          postRunAnalysis: summarizeRegressionRunWithAI,
        });
      } finally {
        restoreCountryAndLanguage(originalCountry, originalLanguage);
      }
    });
  }

  // Test group: Multi Country Facet Evaluation (MCFE)
  for (const country of SUPPORTED_COUNTRIES) {
    // Test: Multi Country Facet Evaluation (MCFE) - {country}
    test(`Multi Country Facet Evaluation (MCFE) - ${country}`, { tag: ["@regression", "@multi-country", "@facet"] }, async ({ browser }) => {
      const targetFacet = process.env.MCFE_TARGET_FACET || "motorization";

      const originalCountry = process.env.COUNTRY;
      const originalLanguage = process.env.LANGUAGE;

      console.log(`\n${"=".repeat(60)}`);
      console.log(`🌍 Running MCFE test for country: ${country}`);
      console.log(`🎯 Target facet: ${targetFacet}`);
      console.log(`🗣️  Language: ${getLanguageForCountry(country)}`);
      console.log(`${"=".repeat(60)}\n`);

      setCountryAndLanguage(country);

      try {
        const refreshed =
          await fetchAndSaveEmhApiResponse(emhApiResponsePath);
        if (!refreshed) {
          console.warn(
            `⚠️  Skipping MCFE for ${country}; unable to refresh EMH facets.`,
          );
          return;
        }

        const queries = await loadFacetCompleteSuite(undefined, [
          targetFacet,
        ]);

        if (queries.length === 0) {
          console.warn(
            `⚠️  No MCFE queries generated for ${country}/${targetFacet}, skipping country.`,
          );
          return;
        }

        await runTestsAndSaveResults({
          queries,
          testDescribe: describeName,
          testTitle: `${test.info().title} - ${targetFacet}`,
          testType: "multi-country-facet-evaluation",
          browser,
          setupContextAndPage,
          performUISmartSearchAndGetResults,
          processAndLogUiResult,
          performApiSmartSearchAndGetResults,
          processAndLogApiResult,
          postRunAnalysis: summarizeRegressionRunWithAI,
        });
      } finally {
        restoreCountryAndLanguage(originalCountry, originalLanguage);
      }
    });
  }
});
