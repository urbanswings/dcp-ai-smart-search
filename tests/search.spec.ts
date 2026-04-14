import "dotenv/config";
import { test, Page } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import {
  generateUniqueQueries,
} from "./utils/aiHelpers";
import {
  testDataVehiclesNonMB,
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
  resolveFixedQueriesFilePath,
  cleanOldScreenshots,
} from "./utils/shared";

// Load fixed queries from JSON file based on LANGUAGE
const language = LANGUAGE?.toLowerCase() || "en";
const aiQueryPromptsPath = path.join(__dirname, "data/ai-query-prompts.json");
const aiEvaluationRulesPath = path.join(__dirname, "data/ai-evaluation-rules.json");
let fixedQueriesData: any = {};
let aiPromptData: any = {};
let aiEvaluationRulesData: any = {};
let emhApiResponse: any = null;
let dcpApiResponse: any = null;

test.beforeAll(async () => {
  const { fixedQueriesFile, fixedQueriesPath, usedFallback } =
    await resolveFixedQueriesFilePath(path.join(__dirname, "data"));

  if (usedFallback) {
    console.warn(
      `Fixed queries file not found for current country/language/product. Falling back to ${fixedQueriesFile}`
    );
  }

  const fixedQueriesContent = await fs.readFile(fixedQueriesPath, "utf-8");
  fixedQueriesData = JSON.parse(fixedQueriesContent);

  const aiPromptDataContent = await fs.readFile(aiQueryPromptsPath, "utf-8");
  aiPromptData = JSON.parse(aiPromptDataContent);

  const aiEvaluationRulesDataContent = await fs.readFile(aiEvaluationRulesPath, "utf-8");
  aiEvaluationRulesData = JSON.parse(aiEvaluationRulesDataContent);

  // Clean up old screenshots (keep last 2 weeks)
  await cleanOldScreenshots(14);

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
  const describeName = "Sanity Test";
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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.byFixedQuery || {};
    const aiEvaluationRules = aiEvaluationRulesData.byFixedQuery || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.recommendationModel || {};
      const aiEvaluationRules = aiEvaluationRulesData.recommendationModel || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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

  test("By Brand/Model - Test MB-specific brand and model queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.byBrandModel;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.byBrandModel || {};
      const aiEvaluationRules = aiEvaluationRulesData.byBrandModel || {};
      const queries = isFixedQueriesOnly() ? [] : await (async () => {
        const file = await fs.readFile(testDataVehiclesNonMB, "utf-8");
        const vehicleBrandsAndModels: { mb: string[]; "non-mb": string[] } = JSON.parse(file);
        const generatedQueries = [];
        const total = vehicleBrandsAndModels.mb.length;
        const indices = Array.from({ length: total }, (_, i) => i)
          .sort(() => 0.5 - Math.random())
          .slice(0, 10);
        for (const idx of indices) {
          const keyword = vehicleBrandsAndModels.mb[idx];
          const queryValues = await generateUniqueQueries(
            count,
            systemPrompt,
            userPromptTemplate.replace('{keyword}', keyword),
            maxTokens,
            fallback
          );
          generatedQueries.push(queryValues);
        }
        return generatedQueries.flat();
      })();
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.bySpecs || {};
      const aiEvaluationRules = aiEvaluationRulesData.bySpecs || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const { count, systemPrompt, userPromptTemplate, maxTokens, filterOptions, fallback } = aiPromptData.byFilterFacetsRandom || {};
      const aiEvaluationRules = aiEvaluationRulesData.byFilterFacetsRandom || {};
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
          const queryValues = await generateUniqueQueries(
            count,
            systemPrompt,
            userPromptTemplate.replace('{comboText}', comboText),
            maxTokens,
            fallback.replace('{comboText}', comboText)
          );
          generatedQueries.push(queryValues);
        }
        return generatedQueries.flat();
      })();
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const queries = isFixedQueriesOnly() ? [] : await generateQueriesFromFacets(facets, aiPromptData.byFilterFacetsComplete);
      const aiEvaluationRules = aiEvaluationRulesData.byFilterFacetsComplete || {};
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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

  test("By Filter Facets ('Equipment')", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      // Fetch facets dynamically from API based on environment settings
      const project = getProject();
      const fixedQueries: string[] = [];
      const facets = await fetchAndConvertFacets(
        emhApiResponse,
        dcpApiResponse,
        project
      );
      const equipmentFacet = facets.find(f => f.code === "equipment");
      const queriesOnlyEquipment = equipmentFacet?.values?.map(v => ({
        ...equipmentFacet,
        values: [v],
      })) ?? [];
      const queries = isFixedQueriesOnly() ? [] : await generateQueriesFromFacets(queriesOnlyEquipment, aiPromptData.byFilterFacetsComplete);
      const aiEvaluationRules = aiEvaluationRulesData.byFilterFacetsComplete || {};
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "by-filter-equipment",
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Filter Facets (AND/OR)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      // Fetch facets dynamically from API based on environment settings
      const project = getProject();
      const fixedQueries = fixedQueriesData.byFilterFacetsAndOr;
      const facets = await fetchAndConvertFacets(
        emhApiResponse,
        dcpApiResponse,
        project
      );
      const queries = isFixedQueriesOnly() ? [] : await generateQueriesFromFacets(facets, aiPromptData.byFilterFacetsAndOr);
      const aiEvaluationRules = aiEvaluationRulesData.byFilterFacetsAndOr || {};
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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

  test("No Brand/Model", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.noBrandModel;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.noBrandModel || {};
    const aiEvaluationRules = aiEvaluationRulesData.noBrandModel || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count || 10,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.sentenceSingle || {};
      const aiEvaluationRules = aiEvaluationRulesData.sentenceSingle || {};
      const queries = isFixedQueriesOnly() ? [] : await (async () => {
        const file = await fs.readFile(testDataVehiclesNonMB, "utf-8");
        const vehicleBrandsAndModels: { mb: string[]; "non-mb": string[] } = JSON.parse(file);
        const generatedQueries = [];
        const total = vehicleBrandsAndModels["non-mb"].length;
        const indices = Array.from({ length: total }, (_, i) => i)
          .sort(() => 0.5 - Math.random())
          .slice(0, 10);
        for (const idx of indices) {
          const keyword = vehicleBrandsAndModels["non-mb"][idx];
          const queryValues = await generateUniqueQueries(
            count,
            systemPrompt,
            userPromptTemplate.replace('{keyword}', keyword),
            maxTokens,
            fallback
          );
          generatedQueries.push(queryValues);
        }
        return generatedQueries.flat();
      })();
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }

        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const aiEvaluationRules = aiEvaluationRulesData.keywordMix || {};
      const queries = isFixedQueriesOnly() ? [] : await getRandomVehicleCombinations(10, 2, 5);
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const aiEvaluationRules = aiEvaluationRulesData.keywordSingle || {};
      const queries = isFixedQueriesOnly() ? [] : await getRandomVehicleCombinations(10, 2, 5);
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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

  test("By Non-MB Features", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.nonMbFeatures;
      const aiEvaluationRules = aiEvaluationRulesData.nonMbFeatures || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "non-mb-features",
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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.randomTopics || {};
    const aiEvaluationRules = aiEvaluationRulesData.randomTopics || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
          page,
        });
        uiResults.push(entry);
      }
      await page.close();
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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.negativeContradictory || {};
      const aiEvaluationRules = aiEvaluationRulesData.negativeContradictory || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count || 8,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.localization || {};
      const aiEvaluationRules = aiEvaluationRulesData.localization || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count || 7,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.misspelledFuzzy || {};
      const aiEvaluationRules = aiEvaluationRulesData.misspelledFuzzy || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count || 7,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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

  test("Date Range/Numeric Filters)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.dateNumeric;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.dateNumeric || {};
      const aiEvaluationRules = aiEvaluationRulesData.dateNumeric || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count || 8,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.noResults || {};
    const aiEvaluationRules = aiEvaluationRulesData.noResults || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
    const fixedQueries = fixedQueriesData.forRegression;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.responseConsistency || {};
    const aiEvaluationRules = aiEvaluationRulesData.responseConsistency || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.personalData || {};
    const aiEvaluationRules = aiEvaluationRulesData.personalData || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.nsfw || {};
    const aiEvaluationRules = aiEvaluationRulesData.nsfw || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.codeAndScripts || {};
    const aiEvaluationRules = aiEvaluationRulesData.codeAndScripts || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.biasAndManipulation || {};
      const aiEvaluationRules = aiEvaluationRulesData.biasAndManipulation || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count || 8,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        testType: "bias-and-manipulation",
        browser,
       
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Conflicting Filter Facets", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.conflictingFilterFacets || [];
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.conflictingFilterFacets || {};
      const aiEvaluationRules = aiEvaluationRulesData.conflictingFilterFacets || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count || 8,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData.conflictingBrands || {};
    const aiEvaluationRules = aiEvaluationRulesData.conflictingBrands || {};
    const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
      count || 8,
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    const allQueries = mergeQueries(fixedQueries, queries).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
    const aiEvaluationRules = aiEvaluationRulesData.randomNumbers || {};
    const allQueries = mergeQueries(fixedQueries, []).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
      const aiEvaluationRules = aiEvaluationRulesData.multiIntent || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const aiEvaluationRules = aiEvaluationRulesData.clarification || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const aiEvaluationRules = aiEvaluationRulesData.priceNegotiation || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const aiEvaluationRules = aiEvaluationRulesData.unusualUnits || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
    const aiEvaluationRules = aiEvaluationRulesData.jokeHumor || {};
    const allQueries = mergeQueries(fixedQueries, []).map((query) => {
      if (Object.keys(aiEvaluationRules).length === 0) {
        return query;
      }
      return typeof query === "string"
        ? {
            value: query,
            aiEvaluationHints: aiEvaluationRules,
          }
        : {
            ...query,
            aiEvaluationHints: aiEvaluationRules,
          };
    });

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
      const aiEvaluationRules = aiEvaluationRulesData.repeatLooping || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const aiEvaluationRules = aiEvaluationRulesData.brandLoyaltySwitching || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const aiEvaluationRules = aiEvaluationRulesData.accessibilityNeeds || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
      const aiEvaluationRules = aiEvaluationRulesData.environmentalConcerns || {};
      const allQueries = mergeQueries(fixedQueries, []).map((query) => {
        if (Object.keys(aiEvaluationRules).length === 0) {
          return query;
        }
        return typeof query === "string"
          ? {
              value: query,
              aiEvaluationHints: aiEvaluationRules,
            }
          : {
              ...query,
              aiEvaluationHints: aiEvaluationRules,
            };
      });

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
