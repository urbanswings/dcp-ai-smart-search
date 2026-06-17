import "dotenv/config";
import { test } from "@playwright/test";
import { runTestsAndSaveResults, runTestsRepeatedAndSaveResults } from "./utils/shared";
import { performUISmartSearchAndGetResults, processAndLogUiResult, setupContextAndPage } from "./utils/uiHelpers";
import { fetchEmhApiResponse, performApiSmartSearchAndGetResults, processAndLogApiResult } from "./utils/apiHelpers";
import { loadFacetCompleteSuite } from "./utils/queryHelpers";
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
  const emhApiResponsePath = path.join(__dirname, "data/emh-api-response.json");
  const supportedCountries = ["AU", "IN", "JP", "KR", "SG", "TH", "TR"];
  const languageByCountry: Record<string, string> = {
    JP: "JA",
    KR: "KO",
    TH: "TH",
    TR: "TR",
  };

  async function refreshEmhApiResponse(): Promise<boolean> {
    try {
      const emhApiResponse = await fetchEmhApiResponse();

      if (!emhApiResponse) {
        console.warn("⚠️  No EMH API response returned.");
        return false;
      }

      await fs.writeFile(
        emhApiResponsePath,
        JSON.stringify(emhApiResponse, null, 2),
        "utf-8"
      );
      console.log(`Saved EMH API response to: ${emhApiResponsePath}`);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to fetch and save EMH API response:", errorMessage);
      return false;
    }
  }

  function getLanguageForCountry(country: string): string {
    return languageByCountry[country.toUpperCase()] || "EN";
  }

  function setCountryAndLanguage(country: string): void {
    process.env.COUNTRY = country;
    process.env.LANGUAGE = getLanguageForCountry(country);
  }

  function restoreCountryAndLanguage(
    originalCountry: string | undefined,
    originalLanguage: string | undefined
  ): void {
    if (originalCountry) {
      process.env.COUNTRY = originalCountry;
    } else {
      delete process.env.COUNTRY;
    }

    if (originalLanguage) {
      process.env.LANGUAGE = originalLanguage;
    } else {
      delete process.env.LANGUAGE;
    }
  }

  test.beforeAll(async () => {
    console.log("Setting up regression tests...");
    await refreshEmhApiResponse();
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

    if (supportedCountries.length === 0) {
      console.warn("⚠️  No supported countries discovered, skipping test.");
      return;
    }

    const originalCountry = process.env.COUNTRY;
    const originalLanguage = process.env.LANGUAGE;
    
    // Run MCE test for each supported country
    for (const country of supportedCountries) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🌍 Running MCE test for country: ${country}`);
      console.log(`${"=".repeat(60)}\n`);

      // Temporarily update the country and language for this iteration
      setCountryAndLanguage(country);

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

    restoreCountryAndLanguage(originalCountry, originalLanguage);
    
    console.log(`\n✅ Multi Country Evaluation (MCE) completed for all ${supportedCountries.length} countries.`);
  });

  test("Multi Country Facet Evaluation (MCFE)", { tag: ["@regression", "@multi-country", "@facet"] }, async ({ browser }) => {
    const targetFacet = process.env.MCFE_TARGET_FACET || "modelIdentifier";

    if (supportedCountries.length === 0) {
      console.warn("⚠️  No supported countries discovered, skipping test.");
      return;
    }

    const originalCountry = process.env.COUNTRY;
    const originalLanguage = process.env.LANGUAGE;

    for (const country of supportedCountries) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🌍 Running MCFE test for country: ${country}`);
      console.log(`🎯 Target facet: ${targetFacet}`);
      console.log(`🗣️  Language: ${getLanguageForCountry(country)}`);
      console.log(`${"=".repeat(60)}\n`);

      setCountryAndLanguage(country);

      try {
        const refreshed = await refreshEmhApiResponse();
        if (!refreshed) {
          console.warn(`⚠️  Skipping MCFE for ${country}; unable to refresh EMH facets.`);
          continue;
        }

        const queries = await loadFacetCompleteSuite(undefined, [targetFacet]);

        if (queries.length === 0) {
          console.warn(`⚠️  No MCFE queries generated for ${country}/${targetFacet}, skipping country.`);
          continue;
        }

        await runTestsAndSaveResults({
          queries,
          testDescribe: describeName,
          testTitle: `${test.info().title} - ${country} - ${targetFacet}`,
          testType: "multi-country-facet-evaluation",
          browser,
          setupContextAndPage,
          performUISmartSearchAndGetResults,
          processAndLogUiResult,
          performApiSmartSearchAndGetResults,
          processAndLogApiResult,
          postRunAnalysis: summarizeRegressionRunWithAI,
        });
      } catch (error) {
        console.error(`❌ Error running MCFE test for country ${country}:`, error);
      }
    }

    restoreCountryAndLanguage(originalCountry, originalLanguage);

    console.log(`\n✅ Multi Country Facet Evaluation (MCFE) completed for all ${supportedCountries.length} countries.`);
  });
});
