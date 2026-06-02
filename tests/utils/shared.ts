import { fetchTranslation, generateOpenAIQuery } from "./aiHelpers";
// Shared utilities for both UI and API testing
import fs from "fs/promises";
import path from "path";
import { ENVIRONMENT, COUNTRY, PRODUCT, LANGUAGE, VEHICLE_CATEGORY } from "./testHelpers";

export { ENVIRONMENT, COUNTRY, PRODUCT, LANGUAGE, VEHICLE_CATEGORY };

const REPEAT_COUNT = 5;

export function deepEqual(a: any, b: any, ignoreKeys: string[] = []): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    // Compare arrays deeply, ignoring order, by matching each element in a to one in b
    const bUsed = new Array(b.length).fill(false);
    for (let i = 0; i < a.length; i++) {
      let found = false;
      for (let j = 0; j < b.length; j++) {
        if (!bUsed[j] && deepEqual(a[i], b[j], ignoreKeys)) {
          bUsed[j] = true;
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a).filter(k => !ignoreKeys.includes(k));
    const bKeys = Object.keys(b).filter(k => !ignoreKeys.includes(k));
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!bKeys.includes(key)) return false;
      if (!deepEqual(a[key], b[key], ignoreKeys)) return false;
    }
    return true;
  }
  return false;
}

function getConsistencyResponseText(result: any, lang: string): string | undefined {
  const response = result?.response;

  if (!response) {
    return undefined;
  }

  if (typeof response === "string") {
    return response.trim() || undefined;
  }

  if (typeof response === "object") {
    const preferred = response?.[lang];
    if (typeof preferred === "string" && preferred.trim()) {
      return preferred;
    }

    const english = response?.en;
    if (typeof english === "string" && english.trim()) {
      return english;
    }

    const firstAvailable = Object.values(response).find(
      (value): value is string => typeof value === "string" && value.trim() !== ""
    );
    return firstAvailable;
  }

  return undefined;
}

function getConsistencyFacets(result: any): any {
  const facets = result?.facets;

  if (!facets || typeof facets !== "object") {
    return facets;
  }

  if ("actual" in facets) {
    return facets.actual;
  }

  return facets;
}

export function isLanguageConsistencyAccepted(result: string): boolean {
  const normalized = (result || "").trim().toUpperCase();
  if (!normalized) return false;
  if (normalized === "YES") return true;

  const codes = normalized.match(/[A-Z]{2}/g);
  if (!codes || codes.length < 2) return false;

  return codes[0] === codes[1];
}

export async function areAllResponsesConsistentOneShot(
  responses: string[]
): Promise<{ isConsistent: boolean; reason: string }> {
  const normalizedResponses = responses
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (normalizedResponses.length <= 1) {
    return { isConsistent: true, reason: "" };
  }

  const systemPrompt = [
    "You are a strict QA evaluator for search response consistency.",
    "You will receive multiple responses for the same user query.",
    "Decide whether all responses are semantically consistent with each other.",
    "Ignore minor wording differences and sentence order.",
    "Return exactly two lines:",
    "RESULT: YES or NO",
    "REASON: short reason (only when RESULT is NO; otherwise REASON: N/A).",
  ].join("\n");

  const userPrompt = [
    "Evaluate consistency for the following responses:",
    ...normalizedResponses.map((value, index) => `Response ${index + 1}: ${value}`),
    "",
    "Output format:",
    "RESULT: YES or NO",
    "REASON: <short reason>",
  ].join("\n");

  try {
    const answer = await generateOpenAIQuery(systemPrompt, userPrompt, 80, 0.1, "NO");
    const raw = String(answer || "").trim();
    const normalized = raw.toUpperCase();
    const isConsistent = normalized.includes("YES");

    if (isConsistent) {
      return { isConsistent: true, reason: "" };
    }

    const reasonMatch = raw.match(/REASON\s*:\s*([\s\S]*)/i);
    const parsedReason = reasonMatch?.[1]?.trim();

    return {
      isConsistent: false,
      reason: parsedReason || "AI marked responses inconsistent but did not provide a reason.",
    };
  } catch (error) {
    console.warn("⚠️  One-shot AI consistency check failed:", error);
    return { isConsistent: false, reason: "One-shot AI consistency check failed." };
  }
}

export function getTestMode(): "ui" | "api" | "both" {
  return (process.env.TEST_MODE as "ui" | "api" | "both") || "ui";
}

export function shouldRunUiTests(): boolean {
  const mode = getTestMode();
  return mode === "ui" || mode === "both";
}

export function shouldRunApiTests(): boolean {
  const mode = getTestMode();
  return mode === "api" || mode === "both";
}

export function isFixedQueriesOnly(): boolean {
  return process.env.FIXED_QUERIES_ONLY === "true";
}

export function getProject(): string {
  return process.env.PROJECT || "DCP";
}

export function getLanguageLocale(): string {
  const lang = LANGUAGE?.toLowerCase() || "en";
  const country = COUNTRY?.toUpperCase() || "KR";
  return `${lang}-${country}`;
}

export async function resolveFixedQueriesFilePath(dataDir: string): Promise<{
  fixedQueriesFile: string;
  fixedQueriesPath: string;
  usedFallback: boolean;
}> {
  const country = COUNTRY?.toLowerCase() || "kr";
  const language = LANGUAGE?.toLowerCase() || "en";
  const product = PRODUCT?.toLowerCase() || "ncos";

  const fallbackCandidates = [
    `fixed-queries-${country}-${language}-${product}.json`,
    `fixed-queries-${country}-${language}-ncos.json`,
    `fixed-queries-${country}-en-${product}.json`,
    `fixed-queries-${country}-en-ncos.json`,
    "fixed-queries-en-ncos.json",
  ];

  for (let index = 0; index < fallbackCandidates.length; index += 1) {
    const candidate = fallbackCandidates[index];
    const candidatePath = path.join(dataDir, candidate);

    try {
      await fs.access(candidatePath);
      return {
        fixedQueriesFile: candidate,
        fixedQueriesPath: candidatePath,
        usedFallback: index > 0,
      };
    } catch (error) {
      const isFileNotFound =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT";

      if (!isFileNotFound) {
        throw error;
      }
    }
  }

  return {
    fixedQueriesFile: "fixed-queries-en-ncos.json",
    fixedQueriesPath: path.join(dataDir, "fixed-queries-en-ncos.json"),
    usedFallback: true,
  };
}

export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Clean up old screenshot folders, keeping only the most recent ones
 * @param keepCount Number of most recent date folders to keep (default: 3)
 */
export async function cleanOldScreenshots(keepDays: number = 14): Promise<void> {
  const screenshotsDir = "./results/screenshots";
  
  try {
    await fs.access(screenshotsDir);
    
    const entries = await fs.readdir(screenshotsDir, { withFileTypes: true });
    const dateFolders = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: path.join(screenshotsDir, entry.name)
      }));
    
    if (dateFolders.length === 0) {
      return;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    
    const foldersWithStats = await Promise.all(
      dateFolders.map(async folder => ({
        ...folder,
        mtime: (await fs.stat(folder.path)).mtime
      }))
    );
    
    const foldersToRemove = foldersWithStats.filter(folder => folder.mtime < cutoffDate);
    
    for (const folder of foldersToRemove) {
      await fs.rm(folder.path, { recursive: true, force: true });
      console.log(`🗑️  Removed old screenshot folder: ${folder.name}`);
    }
    
    if (foldersToRemove.length > 0) {
      console.log(`✅ Cleaned up ${foldersToRemove.length} old screenshot folder(s) (older than ${keepDays} days)`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Warning: Failed to clean old screenshots:', error);
    }
  }
}

export function getOutputFileName(testType: string): string {
  const timestamp = new Date().toISOString();
  const dateOnly = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", }).format(new Date(timestamp));
  const env = ENVIRONMENT;
  const country = COUNTRY;
  const product = PRODUCT;
  const mode = getTestMode();
  let filename = `./results/json/${dateOnly}_${env}/${country}_${product}_search-results_${testType}-${mode}_${timestamp}.json`;
  if (mode === "both") {
    return `./results/json/${dateOnly}_${env}/${country}_${product}_search-results_${testType}-both_${timestamp}.json`;
  }
  console.log(`Results File: ${filename}`);
  return filename;
}

export function getScreenshotPath(testType: string, queryIndex: number, query: string, runTimestamp: string): string {
  const dateOnly = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", }).format(new Date(runTimestamp));
  const env = ENVIRONMENT;
  const country = COUNTRY;
  const product = PRODUCT;
  
  // Sanitize query for filename (remove special characters, limit length)
  const sanitizedQuery = query
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 50);
  
  // Use runTimestamp as folder - each test run gets its own folder
  return `./results/screenshots/${dateOnly}_${env}/${runTimestamp}/${country}_${product}_${testType}_query-${queryIndex + 1}_${sanitizedQuery}.png`;
}

export async function combineResults(
  uiResults: any[],
  apiResults: any[]
): Promise<any[]> {
  const combined = [];

  // Add UI results
  for (const result of uiResults) {
    combined.push({ ...result, testMode: "ui" });
  }

  // Add API results
  for (const result of apiResults) {
    combined.push({ ...result, testMode: "api" });
  }

  return combined;
}

/**
 * Runs UI and/or API tests repeatedly for a set of queries and saves results to a file.
 * This function encapsulates the common pattern of:
 * 1. Running UI tests (if enabled)
 * 2. Running API tests (if enabled)
 * 3. Combining results
 * 4. Saving to output file
 */
export async function runTestsRepeatedAndSaveResults(params: {
  queries: any[];
  testDescribe: string;
  testTitle: string;
  testType: string;
  browser?: any;
  performUISmartSearchAndGetResults?: (page: any, query: any) => Promise<any>;
  processAndLogUiResult?: (params: {
    query: any;
    results: any;
    testDescribe: string;
    testTitle: string;
    page: any;
  }) => Promise<any>;
  performApiSmartSearchAndGetResults?: (query: any) => Promise<any>;
  processAndLogApiResult?: (params: {
    query: any;
    results: any;
    testDescribe: string;
    testTitle: string;
  }) => Promise<any>;
  setupContextAndPage?: (browser: any) => Promise<any>;
}): Promise<void> {
  const {
    queries,
    testDescribe,
    testTitle,
    testType,
    browser,
    performUISmartSearchAndGetResults,
    processAndLogUiResult,
    performApiSmartSearchAndGetResults,
    processAndLogApiResult,
    setupContextAndPage,
  } = params;

  const lang = LANGUAGE?.toLowerCase() || "en";
  const normalizeRepeatedQuery = (item: any): any | null => {
    if (typeof item === "string") {
      const trimmed = item.trim();
      return trimmed ? { value: trimmed } : null;
    }

    if (item && typeof item === "object" && "value" in item) {
      const normalizedValue = String((item as any).value ?? "").trim();
      if (!normalizedValue) return null;
      return {
        ...item,
        value: normalizedValue,
      };
    }

    return null;
  };

  const normalizedQueries = (queries || [])
    .map((query) => normalizeRepeatedQuery(query))
    .filter((query): query is any => query !== null);

  if (normalizedQueries.length === 0) {
    console.warn("[runTestsRepeatedAndSaveResults] No valid queries found to execute.");
    return;
  }

  const uiResults: any[][] = [];
  const apiResults: any[][] = [];

  // Run UI tests if enabled
  if (shouldRunUiTests() && setupContextAndPage && performUISmartSearchAndGetResults && processAndLogUiResult) {
    const page = await setupContextAndPage(browser);
    for (const query of normalizedQueries) {
      const resultsForQuery = [];
      for (let i = 0; i < REPEAT_COUNT; i++) {
        const results = await performUISmartSearchAndGetResults(page, query);
        const entry = await processAndLogUiResult({
          query,
          results,
          testDescribe,
          testTitle,
          page,
        });
        resultsForQuery.push(entry);
      }
      // Consistency check for UI results (response[LANGUAGE] and facets)
      const firstString = resultsForQuery
        .map((result) => getConsistencyResponseText(result, lang))
        .find((value): value is string => typeof value === "string" && value.trim() !== "");
      const firstFacets = resultsForQuery
        .map((result) => getConsistencyFacets(result))
        .find((value) => value !== undefined && value !== null);
      const responseValues = resultsForQuery
        .map((result) => getConsistencyResponseText(result, lang))
        .filter((value): value is string => typeof value === "string" && value.trim() !== "");
      const { isConsistent: aiResponseConsistent, reason: aiInconsistencyReason } =
        await areAllResponsesConsistentOneShot(responseValues);
      const line = '────────────────────────────────────────────────────────────';
      let matchCount = 0;
      let facetMatchCount = 0;
      const failedRuns = [];
      for (let i = 1; i < resultsForQuery.length; i++) {
        const compareString = getConsistencyResponseText(resultsForQuery[i], lang);
        const compareFacets = getConsistencyFacets(resultsForQuery[i]);
        const facetsMatch = deepEqual(firstFacets, compareFacets);
        const runMatched = aiResponseConsistent && facetsMatch;
        if (runMatched) matchCount++;
        if (facetsMatch) facetMatchCount++;
        if (!runMatched) {
          failedRuns.push({ runNum: i + 1, compareString, compareFacets, facetsMatch });
        }
      }
      const percent = ((matchCount / (resultsForQuery.length - 1)) * 100).toFixed(0);
      const facetPercent = ((facetMatchCount / (resultsForQuery.length - 1)) * 100).toFixed(0);
      // Add consistencyRating to each result in resultsForQuery
      for (const result of resultsForQuery) {
        result.consistencyRating = Number(percent);
      }
      const icon = percent === '100' ? '✅' : '❌';
      const responseIcon = aiResponseConsistent ? '✅' : '❌';
      const facetIcon = facetPercent === '100' ? '✅' : '❌';
      console.info(`\n${line}`);
      console.info(`🔎 \x1b[1mConsistency Check for Query:\x1b[0m \x1b[36m${query?.value ?? query}\x1b[0m`);
      console.info(`${line}`);
      console.info(`\nResponse Summary:\n  ${firstString}`);
      console.info(`\nFacets Summary:\n  ${JSON.stringify(firstFacets, null, 2)}`);
      if (!aiResponseConsistent && aiInconsistencyReason) {
        console.info(`\nAI Reason:\n  ${aiInconsistencyReason}`);
      }
      if (failedRuns.length > 0) {
        console.info(`\nFailed Runs:`);
        for (const failed of failedRuns) {
          console.info(`\n• Run #${failed.runNum}:`);
          if (!aiResponseConsistent) {
            console.info('  ❌ Response is NOT consistent across all runs (AI one-shot)');
            console.info(`      Response: '${failed.compareString}'`);
            if (lang !== "en" && failed.compareString) {
              const compareStringEn = await fetchTranslation(failed.compareString, "en");
              console.info(`      Response (EN): '${compareStringEn}'`);
            }
          }
          if (!failed.facetsMatch) {
            console.info('  ❌ Facets do NOT match');
            console.info(`      ${JSON.stringify(failed.compareFacets, null, 2)}`);
          }
        }
      }
      console.info(`\n${line}`);
      console.info(`\n• ${icon} \x1b[1mConsistency Rating:\x1b[0m ${percent}% (${matchCount} / ${resultsForQuery.length - 1} runs matched)`);
      console.info(`• ${responseIcon} Response: ${aiResponseConsistent ? 'Consistent' : 'NOT Consistent'}`);
      console.info(`• ${facetIcon} Facets: ${facetPercent}% (${facetMatchCount} / ${resultsForQuery.length - 1} matched)`);
      console.info(`${line}\n`);
      uiResults.push(resultsForQuery);
    }
  }

  // Run API tests if enabled
  if (shouldRunApiTests() && performApiSmartSearchAndGetResults && processAndLogApiResult) {
    for (const query of normalizedQueries) {
      const resultsForQuery = [];
      for (let i = 0; i < REPEAT_COUNT; i++) {
        const results = await performApiSmartSearchAndGetResults(query);
        const entry = await processAndLogApiResult({
          query,
          results,
          testDescribe,
          testTitle,
        });
        resultsForQuery.push(entry);
      }
      // Consistency check for API results (response[LANGUAGE] and facets)
      const firstString = resultsForQuery
        .map((result) => getConsistencyResponseText(result, lang))
        .find((value): value is string => typeof value === "string" && value.trim() !== "");
      const firstFacets = resultsForQuery
        .map((result) => getConsistencyFacets(result))
        .find((value) => value !== undefined && value !== null);
      const responseValues = resultsForQuery
        .map((result) => getConsistencyResponseText(result, lang))
        .filter((value): value is string => typeof value === "string" && value.trim() !== "");
      const { isConsistent: aiResponseConsistent, reason: aiInconsistencyReason } =
        await areAllResponsesConsistentOneShot(responseValues);
      const line = '────────────────────────────────────────────────────────────';
      let matchCount = 0;
      let facetMatchCount = 0;
      const failedRuns = [];
      for (let i = 1; i < resultsForQuery.length; i++) {
        const compareString = getConsistencyResponseText(resultsForQuery[i], lang);
        const compareFacets = getConsistencyFacets(resultsForQuery[i]);
        const facetsMatch = deepEqual(firstFacets, compareFacets);
        const runMatched = aiResponseConsistent && facetsMatch;
        if (runMatched) matchCount++;
        if (facetsMatch) facetMatchCount++;
        if (!runMatched) {
          failedRuns.push({ runNum: i + 1, compareString, compareFacets, facetsMatch });
        }
      }
      const percent = ((matchCount / (resultsForQuery.length - 1)) * 100).toFixed(0);
      const facetPercent = ((facetMatchCount / (resultsForQuery.length - 1)) * 100).toFixed(0);
      // Add consistencyRating to each result in resultsForQuery
      for (const result of resultsForQuery) {
        result.consistencyRating = Number(percent);
      }
      const icon = percent === '100' ? '✅' : '❌';
      const responseIcon = aiResponseConsistent ? '✅' : '❌';
      const facetIcon = facetPercent === '100' ? '✅' : '❌';
      console.info(`\n${line}`);
      console.info(`🔎 \x1b[1mConsistency Check for Query:\x1b[0m \x1b[36m${query?.value ?? query}\x1b[0m`);
      console.info(`${line}`);
      console.info(`\nResponse Summary:\n  ${firstString}`);
      console.info(`\nFacets Summary:\n  ${JSON.stringify(firstFacets, null, 2)}`);
      if (!aiResponseConsistent && aiInconsistencyReason) {
        console.info(`\nAI Reason:\n  ${aiInconsistencyReason}`);
      }
      if (failedRuns.length > 0) {
        console.info(`\nFailed Runs:`);
        for (const failed of failedRuns) {
          console.info(`\n• Run #${failed.runNum}:`);
          if (!aiResponseConsistent) {
            console.info('  ❌ Response is NOT consistent across all runs (AI one-shot)');
            console.info(`      Response: '${failed.compareString}'`);
            if (lang !== "en" && failed.compareString) {
              const compareStringEn = await fetchTranslation(failed.compareString, "en");
              console.info(`      Response (EN): '${compareStringEn}'`);
            }
          }
          if (!failed.facetsMatch) {
            console.info('  ❌ Facets do NOT match');
            console.info(`      ${JSON.stringify(failed.compareFacets, null, 2)}`);
          }
        }
      }
      console.info(`\n${line}`);
      console.info(`\n• ${icon} \x1b[1mConsistency Rating:\x1b[0m ${percent}% (${matchCount} / ${resultsForQuery.length - 1} runs matched)`);
      console.info(`• ${responseIcon} Response: ${aiResponseConsistent ? 'Consistent' : 'NOT Consistent'}`);
      console.info(`• ${facetIcon} Facets: ${facetPercent}% (${facetMatchCount} / ${resultsForQuery.length - 1} matched)`);
      console.info(`${line}\n`);
      apiResults.push(resultsForQuery);
    }
  }

  // Flatten results for saving
  const flatUiResults = uiResults.flat();
  const flatApiResults = apiResults.flat();

  // Combine and save results
  const allResults = await combineResults(flatUiResults, flatApiResults);
  const outputFileName = getOutputFileName(testType);
  await ensureDirectoryExists(outputFileName);
  await fs.writeFile(
    outputFileName,
    JSON.stringify(allResults, null, 2),
    "utf-8"
  );
}

/**
 * Runs UI and/or API tests for a set of queries and saves results to a file.
 * This function encapsulates the common pattern of:
 * 1. Running UI tests (if enabled)
 * 2. Running API tests (if enabled)
 * 3. Combining results
 * 4. Saving to output file
 */
export async function runTestsAndSaveResults(params: {
  queries: any[];
  testDescribe: string;
  testTitle: string;
  testType: string;
  browser?: any;
  performUISmartSearchAndGetResults?: (page: any, query: any) => Promise<any>;
  processAndLogUiResult?: (params: {
    query: any;
    results: any;
    testDescribe: string;
    testTitle: string;
    page: any;
  }) => Promise<any>;
  performApiSmartSearchAndGetResults?: (query: any) => Promise<any>;
  processAndLogApiResult?: (params: {
    query: any;
    results: any;
    testDescribe: string;
    testTitle: string;
  }) => Promise<any>;
  setupContextAndPage?: (browser: any) => Promise<any>;
  postRunAnalysis?: (params: {
    allResults: any[];
    outputFileName: string;
    testDescribe: string;
    testTitle: string;
    testType: string;
  }) => Promise<void>;
}): Promise<void> {
  const {
    queries,
    testDescribe,
    testTitle,
    testType,
    browser,
    performUISmartSearchAndGetResults,
    processAndLogUiResult,
    performApiSmartSearchAndGetResults,
    processAndLogApiResult,
    setupContextAndPage,
    postRunAnalysis,
  } = params;

  const uiResults = [];
  const apiResults = [];
  const runTimestamp = new Date().toISOString();

  // Run UI tests if enabled
  if (shouldRunUiTests() && setupContextAndPage && performUISmartSearchAndGetResults && processAndLogUiResult) {
    const page = await setupContextAndPage(browser);
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const results = await performUISmartSearchAndGetResults(page, query);
      const entry = await processAndLogUiResult({
        query,
        results,
        testDescribe,
        testTitle,
        page,
      });      
      
      // Take screenshot after each query (viewport only)
      const actualQuery = query?.value ?? query;
      const screenshotPath = getScreenshotPath(testType, i, actualQuery, runTimestamp);
      await ensureDirectoryExists(screenshotPath);
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 Screenshot: ${screenshotPath}`);

      entry.screenshotPath = screenshotPath;
      
      // Annotate screenshot immediately with English translations
      try {
        const { annotateSingleScreenshot } = require('../../annotate-screenshot.js');
        await annotateSingleScreenshot(screenshotPath, entry);
        console.log(`✏️  Annotated: ${path.basename(screenshotPath)}`);        
      } catch (error) {
        console.warn(`⚠️  Annotation skipped: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      console.log("\n");
      
      uiResults.push(entry);
    }
  }

  // Run API tests if enabled
  if (shouldRunApiTests() && performApiSmartSearchAndGetResults && processAndLogApiResult) {
    for (const query of queries) {
      const results = await performApiSmartSearchAndGetResults(query);
      const entry = await processAndLogApiResult({
        query,
        results,
        testDescribe,
        testTitle,
      });
      apiResults.push(entry);
    }
  }

  // Combine and save results
  const allResults = await combineResults(uiResults, apiResults);
  const outputFileName = getOutputFileName(testType);
  await ensureDirectoryExists(outputFileName);
  await fs.writeFile(
    outputFileName,
    JSON.stringify(allResults, null, 2),
    "utf-8"
  );

  if (postRunAnalysis) {
    try {
      await postRunAnalysis({
        allResults,
        outputFileName,
        testDescribe,
        testTitle,
        testType,
      });
    } catch (e) {
      console.warn(
        `[WARN] Post-run analysis failed: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  // Fail the test if any result has an error
  const failedResults = allResults.filter((r: any) => r.hasError === true);
  if (failedResults.length > 0) {
    const failSummary = failedResults
      .map((r: any) => {
        const query = r.query ? (Object.values(r.query)[0] ?? "") : "";
        return `  - [${r.testMode?.toUpperCase() ?? "?"}] "${query}": ${r.openaiEvaluation ?? r.error ?? "unknown error"}`;
      })
      .join("\n");
    throw new Error(
      `${failedResults.length} of ${allResults.length} test(s) failed:\n${failSummary}`
    );
  }
}

/**
 * Merges fixed queries with generated queries, respecting the FIXED_QUERIES_ONLY setting.
 * @param fixedQueries - Array of fixed/predefined queries
 * @param generatedQueries - Array of dynamically generated queries
 * @returns Combined array of queries
 */
export function mergeQueries(
  fixedQueries: any[],
  generatedQueries: any[] = []
): any[] {
  const sanitizeQueryText = (text: string): string => {
    return String(text)
      .replace(/\bmercedes[\s-]*benz\b/gi, "")
      .replace(/\bmercedes\b/gi, "")
      .replace(/\bbenz\b/gi, "")
      .replace(/벤츠/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  };

  const sanitizeQueryEntry = (query: any): any => {
    if (typeof query === "string") {
      return sanitizeQueryText(query);
    }

    if (query && typeof query === "object" && "value" in query) {
      return {
        ...query,
        value: sanitizeQueryText(String(query.value ?? "")),
      };
    }

    return query;
  };

  const safeFixedQueries = (fixedQueries || []).map(sanitizeQueryEntry);
  const safeGeneratedQueries = (generatedQueries || []).map(sanitizeQueryEntry);

  if (isFixedQueriesOnly()) {
    return safeFixedQueries;
  }
  return [...safeFixedQueries, ...safeGeneratedQueries];
}

