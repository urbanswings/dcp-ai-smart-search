import "dotenv/config";
import { test, Page } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import {
  generateOpenAIQuery,
  evaluateSearchResult,
  generateUniqueQueries,
  generateMultipleQueries,
} from "./utils/aiHelpers";
import {
  queriesPath,
  getRandomVehicleCombinations,
  logTestContext
} from "./utils/testHelpers";
import {
  processAndLogUiResult,
  setupContextAndPage,
  handleCookieBanner,
  performUISmartSearchAndGetResults,
} from "./utils/uiHelpers";
import {
  performApiSmartSearchAndGetResults,
  processAndLogApiResult,
  fetchEmhApiResponse,
} from "./utils/apiHelpers";
import {
  fetchAndConvertFacets,
  generateQueriesFromFacets,
} from "./utils/facetHelpers";
import {
  shouldRunUiTests,
  shouldRunApiTests,
  getOutputFileName,
  combineResults,
  ensureDirectoryExists,
  isFixedQueriesOnly,
  getProject,
  getLanguageLocale,
  ENVIRONMENT,
  COUNTRY,
  PRODUCT,
  LANGUAGE,
  runTestsAndSaveResults,
  mergeQueries,
  runTestsRepeatedAndSaveResults,
} from "./utils/shared";

// Load fixed queries from JSON file based on LANGUAGE
const language = LANGUAGE?.toLowerCase() || "en";
const product = PRODUCT?.toLowerCase() || "ncos";
const fixedQueriesFile =
  language !== "en"
    ? `fixed-queries-${language}-${product}.json`
    : `fixed-queries-en-ncos.json`;
const fixedQueriesPath = path.join(__dirname, `data/${fixedQueriesFile}`);
let fixedQueriesData: any = {};
let emhApiResponse: any = null;
let dcpApiResponse: any = null;

test.beforeAll(async () => {
  const data = await fs.readFile(fixedQueriesPath, "utf-8");
  fixedQueriesData = JSON.parse(data);

  // Fetch EMH GraphQL API response and save to file
  try {
    emhApiResponse = await fetchEmhApiResponse();
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

test.describe("AI Smart Search - Sanity Test", () => {
  const describeName = "Vehicles MB";
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const project = getProject();
    const browserType = "chromium";
    const timestamp = new Date().toISOString();
    await logTestContext({
      describeName,
      testInfo,
      browserType,
      env,
      country,
      product,
      project,
      timestamp,
      language,
    });
    testInfo.annotations.push({
      type: "context",
      description: JSON.stringify({
        env,
        country,
        product,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
      if (testInfo.error) {
        console.error(testInfo.error);
      }
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  test("By Fixed Query", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.byFixedQuery;
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.byFixedQuery || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "by-fixed-query",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("Recommendation Model", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.recommendationModel;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.recommendationModel || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "recommendation-model",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );
});

test.describe("AI Smart Search - Vehicles MB", () => {
  const describeName = "Vehicles MB";
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const project = getProject();
    const browserType = "chromium";
    const timestamp = new Date().toISOString();
    await logTestContext({
      describeName,
      testInfo,
      browserType,
      env,
      country,
      product,
      project,
      timestamp,
    });
    testInfo.annotations.push({
      type: "context",
      description: JSON.stringify({
        env,
        country,
        product,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
      if (testInfo.error) {
        console.error(testInfo.error);
      }
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  test("By Brand/Model - Test MB-specific brand and model queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {const fixedQueries = fixedQueriesData.byBrandModel;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.byBrandModel || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "sentence-by-brand-model",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Specs - Test specification-based queries without brand/model", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.bySpecs;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.bySpecs || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "buyer-sentence-by-specs",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Filter Facets (random)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.byFilterFacetsRandom;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { systemPrompt, userPromptTemplate, maxTokens, filterOptions, fallback } = aiPromptData.byFilterFacetsRandom || {};
      // Generate queries: pick random 1-4 filter options for each query
      function getRandomFilterCombo() {
        type FilterKey = keyof typeof filterOptions;
        const keys = Object.keys(filterOptions) as FilterKey[];
        const numFilters = Math.floor(Math.random() * 4) + 1; // 1 to 4
        const selectedKeys = keys
          .sort(() => 0.5 - Math.random())
          .slice(0, numFilters);
        const combo = selectedKeys.map((key) => {
          const values = filterOptions[key];
          const value = values[Math.floor(Math.random() * values.length)];
          return { facet: key, value };
        });
        return combo;
      }
      const queries = isFixedQueriesOnly() ? [] : await (async () => {
        const generatedQueries = [];
        for (let i = 0; i < 8; i++) {
          const combo = getRandomFilterCombo();
          const comboText = combo
            .map(({ facet, value }) => `${String(facet)}: ${value}`)
            .join(", ");
          const query = await generateOpenAIQuery(
            systemPrompt,
            userPromptTemplate.replace('{comboText}', comboText),
            maxTokens,
            fallback.replace('{comboText}', comboText)
          );
          generatedQueries.push(query);
        }
        return generatedQueries;
      })();
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "sentence-by-filter-options",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Filter Facets (complete)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      // Fetch facets dynamically from API based on environment settings
      const project = getProject();
      const fixedQueries = fixedQueriesData.byFilterFacetsComplete;
      const facets = await fetchAndConvertFacets(
        emhApiResponse,
        dcpApiResponse,
        project
      );
      const queries = isFixedQueriesOnly() ? [] : await generateQueriesFromFacets(facets, generateOpenAIQuery);
      const allQueries = mergeQueries(fixedQueries, queries);

      const uiResults = [];
      const apiResults = [];      

      // Run UI tests if enabled
      if (shouldRunUiTests()) {
        const page = await setupContextAndPage(browser);
        for (const { query, facet, filterText, filterValue } of allQueries) {
          // Set up network listener to capture the API response
          let smartSearchPassed = false;
          page.on("response", async (response) => {
            if (response.url().includes("/getSmartSearchQuery")) {
              try {
                const responseText = await response.text();

                // The response might be a JSON string wrapped in quotes, parse it
                let responseBody;
                try {
                  // First, try to parse as-is
                  responseBody = JSON.parse(responseText);

                  // If the result is still a string (double-encoded JSON), parse again
                  if (typeof responseBody === "string") {
                    console.log(
                      `• Response is a JSON string, parsing again...`
                    );
                    responseBody = JSON.parse(responseBody);
                  }
                } catch (parseError) {
                  console.log(`• Failed to parse JSON response: ${parseError}`);
                  responseBody = null;
                }

                if (responseBody) {
                  console.log(
                    `• Parsed response - passed: ${
                      responseBody.passed
                    }, http_status_code: ${
                      responseBody.http_status_code
                    }, reason: ${responseBody.reason || "none"}`
                  );

                  if (responseBody.passed === true) {
                    smartSearchPassed = true;
                    console.log(`• ✓ API response: passed = true`);
                  } else {
                    console.log(
                      `• ✗ API response: passed = ${responseBody.passed}, reason: ${responseBody.reason}`
                    );
                  }
                }
              } catch (error) {
                console.log(`• Error reading/parsing API response: ${error}`);
              }
            }
          });

          const results = await performUISmartSearchAndGetResults(page, query);

          // Only check filter widgets if the API returned passed: true
          let filterWidgetFound = false;
          let filterWidgetText = "";

          if (smartSearchPassed) {
            // Only validate filter widgets for specific facets
            const includeFacets = ["bodyType", "color_text", "model"];
            let icon = "✅";
            if (!includeFacets.includes(facet)) {
              console.log(
                `• ⊘ Skipping filter widget validation for facet: ${facet}`
              );
              filterWidgetFound = true; // Mark as found to avoid false negative
            } else {
              try {
                const filterWidgets = page.locator(
                  '[data-test-id="dcp-selected-filters-widget-tag"]'
                );
                const count = await filterWidgets.count();
                console.log(`• Found ${count} filter widget(s)`);

                // Helper function to format number with commas
                const formatNumberWithCommas = (
                  value: string | number
                ): string => {
                  const numStr = value.toString().replace(/,/g, "");
                  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                };

                for (let i = 0; i < count; i++) {
                  const widgetText = await filterWidgets.nth(i).innerText();
                  // Remove the close button "x" from the text and trim
                  const cleanedWidgetText = widgetText
                    .replace(/\s*x\s*$/i, "")
                    .trim();

                  filterWidgetText += (i > 0 ? ", " : "") + cleanedWidgetText;

                  // Format the filter value with commas for comparison
                  const filterValueStr = filterValue.toString();
                  const formattedFilterValue =
                    formatNumberWithCommas(filterValueStr);

                  // Check if the filter value (with or without commas) appears in the cleaned widget text
                  if (
                    cleanedWidgetText
                      .toLowerCase()
                      .includes(filterValueStr.toLowerCase()) ||
                    cleanedWidgetText
                      .toLowerCase()
                      .includes(formattedFilterValue.toLowerCase())
                  ) {
                    filterWidgetFound = true;
                    console.log(
                      `• ✓ Filter widget matched: "${cleanedWidgetText}" contains "${filterValueStr}" (formatted: "${formattedFilterValue}")`
                    );
                  }
                }

                if (!filterWidgetFound && count > 0) {
                  console.log(
                    `• ✗ Filter value "${filterValue}" not found in widgets: ${filterWidgetText}`
                  );
                  icon = "❌";
                } else if (count === 0) {
                  console.log(
                    `• ✗ No filter widgets found for query: "${query}"`
                  );
                }

                console.log(`\n----- Filter Widget (${icon}) -----`);
                console.log(`Facet: "${facet}"`);
                console.log(`Text:  "${filterText}"`);
                console.log(`Value: "${filterValue}"`);
                console.log(`Widgets: [${filterWidgetText}]`);
                console.log(`----------------------------\n`);
              } catch (error) {
                console.log(`• ✗ Error checking filter widgets: ${error}`);
              }
            }
          } else {
            console.log(
              `• ⊘ Skipping filter widget check - API did not return passed: true`
            );
          }

          const entry = await processAndLogUiResult({
            query,
            results,
            testDescribe: describeName,
            testTitle: test.info().title,
          });

          // Add filter widget validation to the entry
          // entry.filterValidation = {
          //   filterText,
          //   filterValue,
          //   smartSearchPassed,
          //   filterWidgetFound,
          //   filterWidgetText,
          // };

          uiResults.push(entry);

          // Remove the response listener to avoid memory leaks
          page.removeAllListeners("response");
        }
      }

      // Run API tests if enabled
      if (shouldRunApiTests()) {
        for (const { query } of allQueries) {
          const results = await performApiSmartSearchAndGetResults(query);
          const entry = await processAndLogApiResult({
            query,
            results,
            testDescribe: describeName,
            testTitle: test.info().title,
          });
          apiResults.push(entry);
        }
      }

      // Combine and save results
      const allResults = await combineResults(uiResults, apiResults);
      const outputFileName = getOutputFileName("by-filter-facets-complete");
      await ensureDirectoryExists(outputFileName);
      await fs.writeFile(
        outputFileName,
        JSON.stringify(allResults, null, 2),
        "utf-8"
      );
    }
  );

  test("No Brand/Model", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.noBrandModel;
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.noBrandModel || {};
    const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
      count || 10,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "sentence-generic",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });
});

test.describe("AI Smart Search - Vehicles Non-MB", () => {
  const describeName = "Vehicles Non-MB";
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const project = getProject();
    const browserType = "chromium";
    const timestamp = new Date().toISOString();
    await logTestContext({
      describeName,
      testInfo,
      browserType,
      env,
      country,
      product,
      project,
      timestamp,
    });
    testInfo.annotations.push({
      type: "context",
      description: JSON.stringify({
        env,
        country,
        product,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
      if (testInfo.error) {
        console.error(testInfo.error);
      }
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  test("By Brand/Model (Sentence|Single)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.sentenceSingle;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.sentenceSingle || {};
      const queries = isFixedQueriesOnly() ? [] : await (async () => {
        const file = await fs.readFile(queriesPath, "utf-8");
        const vehicleBrandsAndModels: string[] = JSON.parse(file);
        const generatedQueries = [];
        const total = vehicleBrandsAndModels.length;
        const indices = Array.from({ length: total }, (_, i) => i)
          .sort(() => 0.5 - Math.random())
          .slice(0, 10);
        for (const idx of indices) {
          const keyword = vehicleBrandsAndModels[idx];
          const query = await generateOpenAIQuery(
            systemPrompt,
            userPromptTemplate.replace('{keyword}', keyword),
            maxTokens,
            fallback
          );
          generatedQueries.push(query);
        }
        return generatedQueries;
      })();
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "sentence-single",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Brand/Model (Keyword|Mix)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.keywordMix;
      const queries = isFixedQueriesOnly() ? [] : await getRandomVehicleCombinations(10, 2, 5);
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "keyword-mix",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Brand/Model (Keyword|Single)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.keywordSingle;
      const queries = isFixedQueriesOnly() ? [] : await (async () => {
        const file = await fs.readFile(queriesPath, "utf-8");
        const vehicleBrandsAndModels: string[] = JSON.parse(file);
        return vehicleBrandsAndModels.slice(0, 10);
      })();
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "keyword-single",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );
});

test.describe("AI Smart Search - Other Scenarios", () => {
  const describeName = "Other Scenarios";
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const project = getProject();
    const browserType = "chromium";
    const timestamp = new Date().toISOString();
    await logTestContext({
      describeName,
      testInfo,
      browserType,
      env,
      country,
      product,
      project,
      timestamp,
    });
    testInfo.annotations.push({
      type: "context",
      description: JSON.stringify({
        env,
        country,
        product,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
      if (testInfo.error) {
        console.error(testInfo.error);
      }
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  test("Random Topics", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.randomTopics;
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.randomTopics || {};
    const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "sentence-nonrelated",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("Edge Case Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const edgeQueries: Array<[string, boolean, number]> = [
      // [query, submitDisabled, expectedStatusCode]
      ["     ", true, 200], // whitespace only
      ["  hi   ", false, 200], // surrounded whitespaces
      ["A".repeat(501), true, 200], // very long input (exceeds limit)
      ["A".repeat(500), false, 200], // very long input (within limit)
      ["!@#$%^&*()_+-=[]{}|;':\",.<>/?", false, 200], // special characters
      ["' OR 1=1 --", false, 200], // SQL injection attempt
      ["<script>alert('test')</script>", false, 403], // HTML/JS injection
      ["🚗🛒💰", false, 200], // Unicode/emoji
      ["車を探しています", false, 200], // Non-latin (Japanese)
      ["abc123XYZ", false, 200], // Mixed alphanumeric
      ["null", false, 200], // Null string
      ["undefined", false, 200], // Undefined string
      ["\t\n", true, 200], // Tab/newline characters
      ["x", false, 200], // Extremely short input
      ["carcarcarcarcar", false, 200], // Repeating patterns
      ["\x00\x01\x02", true, 200], // Random binary data
      ["\\n\\t\\r", false, 200], // Escape sequences
    ];

    const uiResults = [];
    const apiResults = [];

    // Run UI tests if enabled
    if (shouldRunUiTests()) {
      const page = await setupContextAndPage(browser);
      for (const [query, submitDisabled, expectedStatusCode] of edgeQueries) {
        const results = await performUISmartSearchAndGetResults(
          page,
          query,
          submitDisabled
        );
        const entry = await processAndLogUiResult({
          query,
          results,
          testDescribe: describeName,
          testTitle: test.info().title,
        });
        uiResults.push(entry);
      }
    }

    // Run API tests if enabled
    if (shouldRunApiTests()) {
      for (const [query, submitDisabled, expectedStatusCode] of edgeQueries) {
        if (!submitDisabled) {
          // Only test valid queries for API
          const results = await performApiSmartSearchAndGetResults(query);
          const entry = await processAndLogApiResult({
            query,
            results,
            testDescribe: describeName,
            testTitle: test.info().title,
            expectedStatusCode,
          });
          apiResults.push(entry);
        }
      }
    }

    // Combine and save results
    const allResults = await combineResults(uiResults, apiResults);
    const outputFileName = getOutputFileName("edge-cases");
    await ensureDirectoryExists(outputFileName);
    await fs.writeFile(
      outputFileName,
      JSON.stringify(allResults, null, 2),
      "utf-8"
    );
  });

  test("Negative/Contradictory Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.negativeContradictory;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.negativeContradictory || {};
      const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
        count || 8,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "negative-contradictory",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Language/Localization", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.localization;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.localization || {};
      const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
        count || 7,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "localization",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Misspelled/Fuzzy Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.misspelledFuzzy;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.misspelledFuzzy || {};
      const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
        count || 7,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "misspelled-fuzzy",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Filter Facets (Date Range/Numeric Filters)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.dateNumeric;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.dateNumeric || {};
      const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
        count || 8,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "date-numeric",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("No Results Scenario", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.noResults;
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.noResults || {};
    const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "no-results",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("Response Consistency", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    // This test runs the same set of queries multiple times to check for consistency in results and API responses using values from "By Fixed Query" test
    const fixedQueries = fixedQueriesData.byFixedQuery;
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.responseConsistency || {};
    const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsRepeatedAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "response-consistency",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
    }
  );

  test("Personal Data", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.personalData;
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.personalData || {};
    const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "personal-data",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("NSFW", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.nsfw;
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.nsfw || {};
    const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "nsfw",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("Code and Scripts", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.codeAndScripts;
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.codeAndScripts || {};
    const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "code-and-scripts",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("Bias and Manipulation", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.biasAndManipulation;
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.biasAndManipulation || {};
      const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
        count || 8,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "bias-and-manipulation",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Conflicting Filter Facets", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.conflictingFilterFacets || [];
      const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.conflictingFilterFacets || {};
      const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
        count || 8,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "conflicting-filter-facets",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Conflicting Brands", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.conflictingBrands || [];
    const aiPromptData = JSON.parse(await fs.readFile(path.join(__dirname, 'data/ai-query-prompts.json'), 'utf-8'));
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.conflictingBrands || {};
    const queries = isFixedQueriesOnly() ? [] : await generateMultipleQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "conflicting-brands",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("Random Numbers", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.randomNumbers;
    const allQueries = mergeQueries(fixedQueries, []);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "random-numbers",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });
});

test.describe("AI Smart Search - Special Scenarios", () => {
  const describeName = "Special Scenarios";
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const project = getProject();
    const browserType = "chromium";
    const timestamp = new Date().toISOString();
    await logTestContext({
      describeName,
      testInfo,
      browserType,
      env,
      country,
      product,
      project,
      timestamp,
    });
    testInfo.annotations.push({
      type: "context",
      description: JSON.stringify({
        env,
        country,
        product,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
      if (testInfo.error) {
        console.error(testInfo.error);
      }
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  test("Multi-Intent Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.multiIntent;
      const allQueries = mergeQueries(fixedQueries, []);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "multi-intent",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Clarification Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.clarification;
      const allQueries = mergeQueries(fixedQueries, []);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "clarification",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Price Negotiation Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.priceNegotiation;
      const allQueries = mergeQueries(fixedQueries, []);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "price-negotiation",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Unusual Units Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.unusualUnits;
      const allQueries = mergeQueries(fixedQueries, []);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "unusual-units",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Joke/Humor Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.jokeHumor;
    const allQueries = mergeQueries(fixedQueries, []);

    await runTestsAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "joke-humor",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });

  test("Repeat/Looping Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.repeatLooping;
      const allQueries = mergeQueries(fixedQueries, []);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "repeat-looping",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Brand Loyalty/Switching Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.brandLoyaltySwitching;
      const allQueries = mergeQueries(fixedQueries, []);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "brand-loyalty-switching",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Accessibility Needs Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.accessibilityNeeds;
      const allQueries = mergeQueries(fixedQueries, []);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "accessibility-needs",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Environmental Concerns Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.environmentalConcerns;
      const allQueries = mergeQueries(fixedQueries, []);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "environmental-concerns",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );
});
