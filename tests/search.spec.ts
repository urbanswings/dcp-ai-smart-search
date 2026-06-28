import "dotenv/config";
import { test, Page, TestInfo } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import {
  generateUniqueQueries,
} from "./utils/aiHelpers";
import {
  testDataVehicles,
  getRandomVehicleCombinationsNonMB,
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
  generateAndOrFacetMatrixFromFacets,
} from "./utils/facetHelpers";
import {
  shouldRunUiTests,
  shouldRunApiTests,
  buildTestType,
  getOutputFileName,
  combineResults,
  ensureDirectoryExists,
  isFixedQueriesOnly,
  getProject,
  getLanguageLocale,
  ENVIRONMENT,
  COUNTRY,
  PRODUCT,
  VEHICLE_CATEGORY,
  LANGUAGE,
  runTestsAndSaveResults,
  mergeQueries,
  runTestsRepeatedAndSaveResults,
  resolveFixedQueriesFilePath,
  cleanOldScreenshots,
} from "./utils/shared";
import {
  normalizeFixedQueries,
  loadFacetCompleteSuite,
  loadFacetMatrixSuite,
  loadMissingFacetValuesSuite,
  loadNumericUnitVariationSuite,
} from "./utils/queryHelpers";

// Load fixed queries from JSON file based on LANGUAGE
const language = LANGUAGE?.toLowerCase() || "en";
const aiQueryPromptsPath = path.join(__dirname, "data/ai-query-prompts.json");
const aiEvaluationRulesPath = path.join(__dirname, "data/ai-evaluation-rules.json");
let fixedQueriesData: any = {};
let aiPromptData: any = {};
let aiEvaluationRulesData: any = {};
let emhApiResponse: any = null;
let dcpApiResponse: any = null;

const RANGE_FACETS = [
  "price",
  "monthlyRate",
  "mileage",
  "enginePowerHP",
  "enginePowerKW",
  "modelYear",
];

const VEHICLES_MB_FILTER_FACETS = [
  "bodyType",
  "brand",
  "campaigns",
  "color",
  "colorPolish",
  "enginePowerHP",
  "enginePowerKW",
  "firstRegistrationDate",
  "fuelType",
  "lines",
  "mileage",
  "modelIdentifier",
  "modelYear",
  "motorization",
  "packages",
  "price",
  "stockType",
  "upholstery",
  "upholsteryPolish",
].sort();

const DEFAULT_TEST_TIMEOUT_MS = 10 * 60000;
const QUERY_TIMEOUT_BUFFER_MS = 2 * 60000;
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || 45000);
const MAX_QUERY_SCALED_TIMEOUT_MS = Number(process.env.MAX_QUERY_TIMEOUT_MS || 60 * 60000);

function normalizeModelIdentifierMatchValue(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/mercedes[- ]benz/g, "")
    .replace(/mercedes[- ]amg/g, "amg")
    .replace(/mercedes[- ]maybach/g, "maybach")
    .replace(/[^a-z0-9]/g, "");
}

function getModelIdentifierFilterValueIfInStock(keyword: string): string | undefined {
  const modelIdentifierValues = emhApiResponse?.data?.search?.facets?.modelIdentifier?.values;
  if (!Array.isArray(modelIdentifierValues)) {
    return undefined;
  }

  const normalizedKeyword = normalizeModelIdentifierMatchValue(keyword);
  const normalizedKeywordVariants = [
    normalizedKeyword,
    normalizedKeyword.replace(/^amg/, ""),
    normalizedKeyword.replace(/^maybach/, ""),
  ].filter(Boolean);
  const stockedModelCandidates = modelIdentifierValues
    .filter((model) => Number(model?.count || 0) > 0)
    .flatMap((model) => {
      const modelValue = model?.value ? String(model.value) : undefined;
      if (!modelValue) {
        return [];
      }

      return [
        model?.formattedValue,
        model?.value,
      ].map((value) => ({
        value: modelValue,
        candidate: normalizeModelIdentifierMatchValue(value),
      })).filter((entry) => entry.candidate);
    });

  const matchingModel = stockedModelCandidates
    .filter(({ candidate }) =>
      normalizedKeywordVariants.some((variant) => {
        if (variant === candidate) {
          return true;
        }

        if (candidate.length === 1) {
          return variant.startsWith(candidate) && /^\d/.test(variant.slice(candidate.length));
        }

        return variant.startsWith(candidate);
      })
    )
    .sort((a, b) => b.candidate.length - a.candidate.length)[0];

  return matchingModel?.value;
}

function getModelIdentifierLabel(keyword: string): string {
  return keyword
    .replace(/^Mercedes[- ]Benz\s+/i, "")
    .replace(/^Mercedes[- ]AMG\s+/i, "AMG ")
    .replace(/^Mercedes[- ]Maybach\s+/i, "Maybach ")
    .trim();
}

function extendTimeoutForQueryCount(testInfo: TestInfo, queryCount: number): void {
  if (!Number.isFinite(queryCount) || queryCount <= 0) {
    return;
  }

  const scaledTimeout = Math.min(
    Math.max(DEFAULT_TEST_TIMEOUT_MS, QUERY_TIMEOUT_BUFFER_MS + queryCount * QUERY_TIMEOUT_MS),
    MAX_QUERY_SCALED_TIMEOUT_MS
  );

  if (scaledTimeout > testInfo.timeout) {
    testInfo.setTimeout(scaledTimeout);
    console.log(
      `[timeout] Extended "${testInfo.title}" timeout to ${Math.round(scaledTimeout / 1000)}s for ${queryCount} queries.`
    );
  }
}

function registerSmartSearchSuiteHooks(describeName: string): void {
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const vehicleCategory = VEHICLE_CATEGORY;
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
      vehicleCategory,
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
        vehicleCategory,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });
}

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
  // await cleanOldScreenshots(14);

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
    throw error;
  }
});

test.describe("AI Smart Search - Sanity", () => {
  const describeName = "Sanity";
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const vehicleCategory = VEHICLE_CATEGORY;
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
      vehicleCategory,
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
        vehicleCategory,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  test("By Fixed Query", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.byFixedQuery;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("Recommendation Model", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.recommendationModel;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Filter Facets (complete)", { tag: ["@ui", "@api", "@facet"] }, async ({ browser }, testInfo) => {
      const fixedQueries = fixedQueriesData.byFilterFacetsComplete || [];
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const fallbackHints = Object.keys(aiEvaluationRules).length === 0
        ? undefined
        : aiEvaluationRules;
      const queries = isFixedQueriesOnly()
        ? []
        : await loadFacetCompleteSuite(fallbackHints);
      const allQueries = mergeQueries(fixedQueries, queries);
      extendTimeoutForQueryCount(testInfo, allQueries.length);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
    const vehicleCategory = VEHICLE_CATEGORY;
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
      vehicleCategory,
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
        vehicleCategory,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.warn(`Test failed: ${testInfo.title}`);
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  for (const targetFacet of VEHICLES_MB_FILTER_FACETS) {
    test(`By Filter Facets ('${targetFacet}')`, { tag: ["@ui", "@api", "@facet"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.byFilterFacetsComplete || [];
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const fallbackHints = Object.keys(aiEvaluationRules).length === 0
        ? undefined
        : aiEvaluationRules;
      const queries = isFixedQueriesOnly()
        ? []
        : await loadFacetCompleteSuite(fallbackHints, [targetFacet]);
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
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
  }

  test("By Filter Facets (AND/OR)", { tag: ["@ui", "@api"] }, async ({ browser }, testInfo) => {
      // Fetch facets dynamically from API based on environment settings
      const project = getProject();
      const fixedQueries = fixedQueriesData.byFilterFacetsAndOr;
      const facets = await fetchAndConvertFacets(
        emhApiResponse,
        dcpApiResponse,
        project
      );
      const queries = isFixedQueriesOnly() ? [] : generateAndOrFacetMatrixFromFacets(facets);
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });
      extendTimeoutForQueryCount(testInfo, allQueries.length);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Filter Facets (matrix)", { tag: ["@ui", "@api"] }, async ({ browser }, testInfo) => {
      const fixedQueries = fixedQueriesData.byFilterFacetsMatrix || [];
      const matrixQueries = isFixedQueriesOnly()
        ? []
        : await loadFacetMatrixSuite();
      const allQueries = mergeQueries(fixedQueries, matrixQueries);
      extendTimeoutForQueryCount(testInfo, allQueries.length);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Brand/Model", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.byBrandModel;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const modelIdentifierEvaluationRules =
        aiEvaluationRulesData[describeName]?.["By Filter Facets ('modelIdentifier')"] || {};
      const missingModelIdentifierEvaluationRules =
        aiEvaluationRulesData["Vehicles MB - Negative Facets"]?.["By Filter Facets ('modelIdentifier')(-ve)"] || {};
      const queries = isFixedQueriesOnly() ? [] : await (async () => {
        const file = await fs.readFile(testDataVehicles, "utf-8");
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
          const modelIdentifierFilterValue = getModelIdentifierFilterValueIfInStock(keyword);
          const keywordAiEvaluationRules = modelIdentifierFilterValue
            ? modelIdentifierEvaluationRules
            : missingModelIdentifierEvaluationRules;
          const shouldFilter = modelIdentifierFilterValue
            ? {
                include: [{ modelIdentifier: [modelIdentifierFilterValue] }],
                exclude: [],
                strict: false,
              }
            : {
                include: [],
                exclude: [{ modelIdentifier: [getModelIdentifierLabel(keyword)] }],
                strict: false,
              };

          generatedQueries.push(queryValues.map((query) => {
            return {
              value: query,
              shouldFilter,
              ...(Object.keys(keywordAiEvaluationRules).length > 0
                ? { aiEvaluationHints: keywordAiEvaluationRules }
                : {}),
            };
          }));
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("By Specs", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.bySpecs;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("Superlative", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.superlative;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback, temperature } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const queries = isFixedQueriesOnly() ? [] : await generateUniqueQueries(
        count,
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback,
        undefined,
        temperature
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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

test.describe("AI Smart Search - Vehicles MB - Range Facets", () => {
  const describeName = "Vehicles MB - Range Facets";
  registerSmartSearchSuiteHooks(describeName);

  for (const targetFacet of RANGE_FACETS) {
    test(`By Filter Facets ('${targetFacet}')`, { tag: ["@ui", "@api", "@facet", "@range"] }, async ({ browser }) => {
        const fixedQueries = fixedQueriesData.byFilterFacetsRange || [];
        const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
        const fallbackHints = Object.keys(aiEvaluationRules).length === 0
          ? undefined
          : aiEvaluationRules;
        const queries = isFixedQueriesOnly()
          ? []
          : await loadFacetCompleteSuite(fallbackHints, [targetFacet]);
        const allQueries = mergeQueries(fixedQueries, queries);

        await runTestsAndSaveResults({
          queries: allQueries,
          testDescribe: describeName,
          testTitle: test.info().title,
          browser,
          setupContextAndPage,
          performUISmartSearchAndGetResults,
          processAndLogUiResult,
          performApiSmartSearchAndGetResults,
          processAndLogApiResult,
        });
      }
    );
  }
});

test.describe("AI Smart Search - Vehicles MB - Negative Facets", () => {
  const describeName = "Vehicles MB - Negative Facets";
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const vehicleCategory = VEHICLE_CATEGORY;
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
      vehicleCategory,
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
        vehicleCategory,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.warn(`Test failed: ${testInfo.title}`);
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  for (const targetFacet of VEHICLES_MB_FILTER_FACETS) {
    test(`By Filter Facets ('${targetFacet}')(-ve)`, { tag: ["@ui", "@api", "@facet", "@-ve"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.byFilterFacetsComplete || [];
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const fallbackHints = Object.keys(aiEvaluationRules).length === 0
        ? undefined
        : aiEvaluationRules;
      const queries = isFixedQueriesOnly()
        ? []
        : await loadMissingFacetValuesSuite(targetFacet, fallbackHints);
      const allQueries = mergeQueries(fixedQueries, queries);

      await runTestsAndSaveResults({
        queries: allQueries,
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
  }
});

test.describe("AI Smart Search - Vehicles Non-MB", () => {
  const describeName = "Vehicles Non-MB";
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const vehicleCategory = VEHICLE_CATEGORY;
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
      vehicleCategory,
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
        vehicleCategory,
        project,
        browserType,
        timestamp,
      }),
    });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });

  test("By Brand/Model (Sentence|Single)", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.sentenceSingle;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const queries = isFixedQueriesOnly() ? [] : await (async () => {
        const file = await fs.readFile(testDataVehicles, "utf-8");
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const queries = isFixedQueriesOnly() ? [] : await getRandomVehicleCombinationsNonMB(20, 1, 1);
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const queries = isFixedQueriesOnly() ? [] : await getRandomVehicleCombinationsNonMB(10, 2, 5);
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const fallbackHints = Object.keys(aiEvaluationRules).length === 0
        ? undefined
        : aiEvaluationRules;
      const allQueries = mergeQueries(
        normalizeFixedQueries(fixedQueries, {
          shouldRecommend: false,
          shouldFilter: {},
          aiEvaluationHints: fallbackHints,
        }),
        []
      );

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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

test.describe("AI Smart Search - Input Robustness", () => {
  const describeName = "Input Robustness";
  registerSmartSearchSuiteHooks(describeName);

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
    const outputFileName = getOutputFileName(buildTestType(describeName, test.info().title, "edge-cases"));
    await ensureDirectoryExists(outputFileName);
    await fs.writeFile(
      outputFileName,
      JSON.stringify(allResults, null, 2),
      "utf-8"
    );
  });

  test("Random Numbers", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.randomNumbers;
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("Misspelled/Fuzzy Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.misspelledFuzzy;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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

test.describe("AI Smart Search - Constraint Handling", () => {
  const describeName = "Constraint Handling";
  registerSmartSearchSuiteHooks(describeName);

  test("Date Range/Numeric Filters", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.dateNumeric;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Numeric Unit Variations", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
      const fallbackHints = Object.keys(aiEvaluationRules).length === 0
        ? undefined
        : aiEvaluationRules;
      const allQueries = await loadNumericUnitVariationSuite(fallbackHints);

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Negative/Contradictory Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.negativeContradictory;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("No Results Scenario", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.noResults;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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
});

test.describe("AI Smart Search - Conversational Behavior", () => {
  const describeName = "Conversational Behavior";
  registerSmartSearchSuiteHooks(describeName);

  test("Multi-Intent Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.multiIntent;
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Sales", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.sales;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("Joke/Humor Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.jokeHumor;
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("Repeat/Looping Queries", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.repeatLooping;
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
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

test.describe("AI Smart Search - Safety / Policy / Abuse", () => {
  const describeName = "Safety / Policy / Abuse";
  registerSmartSearchSuiteHooks(describeName);

  test("Personal Data", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.personalData;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("NSFW", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.nsfw;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("Code and Scripts", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.codeAndScripts;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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

  test("Bias and Manipulation", { tag: ["@ui", "@api"] }, async ({ browser }) => {
      const fixedQueries = fixedQueriesData.biasAndManipulation;
      const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
      const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
              aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
            };
      });

      await runTestsAndSaveResults({
        queries: allQueries,
        testDescribe: describeName,
        testTitle: test.info().title,
        browser,
        setupContextAndPage,
        performUISmartSearchAndGetResults,
        processAndLogUiResult,
        performApiSmartSearchAndGetResults,
        processAndLogApiResult,
      });
    }
  );

  test("Random Topics", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    const fixedQueries = fixedQueriesData.randomTopics;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsAndSaveResults({
      queries: allQueries,
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
});

test.describe("AI Smart Search - Reliability", () => {
  const describeName = "Reliability";
  registerSmartSearchSuiteHooks(describeName);

  test("Response Consistency", { tag: ["@ui", "@api"] }, async ({ browser }) => {
    // This test runs the same set of queries multiple times to check for consistency in results and API responses using values from "By Fixed Query" test
    const fixedQueries = fixedQueriesData.forRegression;
    const { count, systemPrompt, userPromptTemplate, maxTokens, fallback } = aiPromptData[describeName]?.[test.info().title] || {};
    const aiEvaluationRules = aiEvaluationRulesData[describeName]?.[test.info().title] || {};
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
            aiEvaluationHints: query.aiEvaluationHints || aiEvaluationRules,
          };
    });

    await runTestsRepeatedAndSaveResults({
      queries: allQueries,
      testDescribe: describeName,
      testTitle: test.info().title,
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
