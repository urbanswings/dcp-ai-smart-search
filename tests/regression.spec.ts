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
  fetchEmhApiResponse,
  performApiSmartSearchAndGetResults,
  processAndLogApiResult,
} from "./utils/api/apiHelpers";
import { loadFacetCompleteSuite } from "./utils/query/queryHelpers";
import {
  loadRegressionQueriesFromDescription,
  summarizeRegressionRunWithAI,
  loadIntermittencyQueries,
  loadMCETestData,
} from "./utils/regression/regressionHelpers";
import path from "path";
import fs from "fs/promises";

test.describe("AI Smart Search - Regression", () => {
  const describeName = "Regression";
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
        "utf-8",
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
    originalLanguage: string | undefined,
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

  // Test: Smart Regression Evaluation (SRE)
  test(
    "Smart Regression Evaluation (SRE)",
    { tag: ["@regression"] },
    async ({ browser }) => {
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
    },
  );

  // Test: Intermittent Issues Check (IIC)
  test(
    "Intermittent Issues Check (IIC)",
    { tag: ["@regression", "@intermittent"] },
    async ({ browser }) => {
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
    },
  );

  // Test group: Multi Country Evaluation (MCE)
  for (const country of supportedCountries) {
    // Test: Multi Country Evaluation (MCE) - {country}
    test(
      `Multi Country Evaluation (MCE) - ${country}`,
      { tag: ["@regression", "@multi-country"] },
      async ({ browser }) => {
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
      },
    );
  }

  // Test group: Multi Country Facet Evaluation (MCFE)
  for (const country of supportedCountries) {
    // Test: Multi Country Facet Evaluation (MCFE) - {country}
    test(
      `Multi Country Facet Evaluation (MCFE) - ${country}`,
      { tag: ["@regression", "@multi-country", "@facet"] },
      async ({ browser }) => {
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
          const refreshed = await refreshEmhApiResponse();
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
      },
    );
  }
});
