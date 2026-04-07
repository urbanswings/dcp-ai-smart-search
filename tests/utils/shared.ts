import { fetchTranslation, isSemanticallySimilarOpenAI } from "./aiHelpers";
// Shared utilities for both UI and API testing
import fs from "fs/promises";
import path from "path";
import { ENVIRONMENT, COUNTRY, PRODUCT, LANGUAGE } from "./testHelpers";

export { ENVIRONMENT, COUNTRY, PRODUCT, LANGUAGE };

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

export function isLanguageConsistencyAccepted(result: string): boolean {
  const normalized = (result || "").trim().toUpperCase();
  if (!normalized) return false;
  if (normalized === "YES") return true;

  const codes = normalized.match(/[A-Z]{2}/g);
  if (!codes || codes.length < 2) return false;

  return codes[0] === codes[1];
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

  const fixedQueriesFile = `fixed-queries-${country}-${language}-${product}.json`;
  const fixedQueriesPath = path.join(dataDir, fixedQueriesFile);

  try {
    await fs.access(fixedQueriesPath);
    return { fixedQueriesFile, fixedQueriesPath, usedFallback: false };
  } catch (error) {
    const isFileNotFound =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT";

    if (!isFileNotFound) {
      throw error;
    }

    return {
      fixedQueriesFile: "fixed-queries-en-ncos.json",
      fixedQueriesPath: path.join(dataDir, "fixed-queries-en-ncos.json"),
      usedFallback: true,
    };
  }
}

export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Clean up old screenshot folders, keeping only the most recent ones
 * @param keepCount Number of most recent date folders to keep (default: 3)
 */
export async function cleanOldScreenshots(keepCount: number = 3): Promise<void> {
  const screenshotsDir = "./results/screenshots";
  
  try {
    // Check if screenshots directory exists
    await fs.access(screenshotsDir);
    
    // Get all date folders (format: YYYY-MM-DD_ENV)
    const entries = await fs.readdir(screenshotsDir, { withFileTypes: true });
    const dateFolders = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: path.join(screenshotsDir, entry.name)
      }));
    
    if (dateFolders.length <= keepCount) {
      return; // Nothing to clean
    }
    
    // Get folder stats and sort by modification time (newest first)
    const foldersWithStats = await Promise.all(
      dateFolders.map(async folder => ({
        ...folder,
        mtime: (await fs.stat(folder.path)).mtime
      }))
    );
    
    foldersWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    // Remove old folders (keep only the most recent)
    const foldersToRemove = foldersWithStats.slice(keepCount);
    
    for (const folder of foldersToRemove) {
      await fs.rm(folder.path, { recursive: true, force: true });
      console.log(`🗑️  Removed old screenshot folder: ${folder.name}`);
    }
    
    if (foldersToRemove.length > 0) {
      console.log(`✅ Cleaned up ${foldersToRemove.length} old screenshot folder(s)`);
    }
  } catch (error) {
    // Silently fail if screenshots directory doesn't exist
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
  if (mode === "both") {
    return `./results/json/${dateOnly}_${env}/${country}_${product}_search-results_${testType}-both_${timestamp}.json`;
  }
  return `./results/json/${dateOnly}_${env}/${country}_${product}_search-results_${testType}-${mode}_${timestamp}.json`;
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
  const uiResults: any[][] = [];
  const apiResults: any[][] = [];

  // Run UI tests if enabled
  if (shouldRunUiTests() && setupContextAndPage && performUISmartSearchAndGetResults && processAndLogUiResult) {
    const page = await setupContextAndPage(browser);
    for (const query of queries) {
      const resultsForQuery = [];
      for (let i = 0; i < REPEAT_COUNT; i++) {
        const results = await performUISmartSearchAndGetResults(page, query);
        const entry = await processAndLogUiResult({
          query,
          results,
          testDescribe,
          testTitle,
        });
        resultsForQuery.push(entry);
      }
      // Consistency check for UI results (response[LANGUAGE] and facets)
      const firstResult = resultsForQuery[0];
      const firstString = firstResult?.response?.[lang];
      const firstFacets = firstResult?.facets;
      const line = '────────────────────────────────────────────────────────────';
      let matchCount = 0;
      console.info(`\n${line}`);
      console.info(`🔎 \x1b[1mConsistency Check for Query:\x1b[0m \x1b[36m${query?.value ?? query}\x1b[0m`);
      console.info(`${line}`);
      console.info(`\nResponse:\n  ${firstString}`);
      console.info(`\nFacets:\n  ${JSON.stringify(firstFacets, null, 2)}`);
      for (let i = 1; i < resultsForQuery.length; i++) {
        const compareString = resultsForQuery[i]?.response?.[lang];
        const compareFacets = resultsForQuery[i]?.facets;
        let stringMatch = firstString === compareString;
        let semanticMatch = false;
        if (!stringMatch && firstString && compareString) {
          // Use OpenAI to check semantic similarity
          try {
            semanticMatch = await isSemanticallySimilarOpenAI(firstString, compareString);
          } catch (e) {
            console.warn('⚠️  OpenAI semantic check failed:', e);
          }
        }
        const facetsMatch = deepEqual(firstFacets, compareFacets);
        if (stringMatch || semanticMatch) matchCount++;
        console.info(`\n${line}`);
        console.info(`• \x1b[1mRun #${i + 1}:\x1b[0m`);
        if (stringMatch) {
          console.info('  ✅ Response string matches');
        } else if (semanticMatch) {
          console.info('  ✅ Response string semantically matches');
        } else {
          console.info('  ❌ Response string does NOT match');
          console.info(`      Response:      '${compareString}'`);
          if (lang !== "en") {
            const compareStringEn = await fetchTranslation(compareString, "en");            
            console.info(`      Response (EN): '${compareStringEn}'`);
          }          
        }
        if (facetsMatch) {
          console.info('  ✅ Facets matches');
        } else {
          console.info('  ❌ Facets do NOT match');
          console.info(`      ${JSON.stringify(compareFacets, null, 2)}`);
        }
      }
      const percent = ((matchCount / (resultsForQuery.length - 1)) * 100).toFixed(0);
      // Add consistencyRating to each result in resultsForQuery
      for (const result of resultsForQuery) {
        result.consistencyRating = Number(percent);
      }
      const icon = percent === '100' ? '✅' : '❌';
      console.info(`\n${line}`);      
      console.info(`\n• ${icon} \x1b[1mConsistency Rating:\x1b[0m ${percent}% (${matchCount} / ${resultsForQuery.length - 1} runs matched)`);
      console.info(`${line}\n`);
      uiResults.push(resultsForQuery);
    }
  }

  // Run API tests if enabled
  if (shouldRunApiTests() && performApiSmartSearchAndGetResults && processAndLogApiResult) {
    for (const query of queries) {
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
      const firstResult = resultsForQuery[0];
      const firstString = firstResult?.response?.[lang];
      const firstFacets = firstResult?.facets;
      const line = '────────────────────────────────────────────────────────────';
      let matchCount = 0;
      console.info(`\n${line}`);
      console.info(`🔎 \x1b[1mConsistency Check for Query:\x1b[0m \x1b[36m${query?.value ?? query}\x1b[0m`);
      console.info(`${line}`);
      console.info(`\nResponse:\n  ${firstString}`);
      console.info(`\nFacets:\n  ${JSON.stringify(firstFacets, null, 2)}`);
      for (let i = 1; i < resultsForQuery.length; i++) {
        const compareString = resultsForQuery[i]?.response?.[lang];
        const compareFacets = resultsForQuery[i]?.facets;
        let stringMatch = firstString === compareString;
        let semanticMatch = false;
        if (!stringMatch && firstString && compareString) {
          // Use OpenAI to check semantic similarity
          try {
            semanticMatch = await isSemanticallySimilarOpenAI(firstString, compareString);
          } catch (e) {
            console.warn('⚠️  OpenAI semantic check failed:', e);
          }
        }
        const facetsMatch = deepEqual(firstFacets, compareFacets);
        if (stringMatch || semanticMatch) matchCount++;
        console.info(`\n${line}`);
        console.info(`• \x1b[1mRun #${i + 1}:\x1b[0m`);
        if (stringMatch) {
          console.info('  ✅ Response string matches');
        } else if (semanticMatch) {
          console.info('  ✅ Response string semantically matches');
        } else {
          console.info('  ❌ Response string does NOT match');
          console.info(`      Response:      '${compareString}'`);
          if (lang !== "en") {
            const compareStringEn = await fetchTranslation(compareString, "en");            
            console.info(`      Response (EN): '${compareStringEn}'`);
          }  
        }
        if (facetsMatch) {
          console.info('  ✅ Facets matches');
        } else {
          console.info('  ❌ Facets do NOT match');
          console.info(`      ${JSON.stringify(compareFacets, null, 2)}`);
        }
      }
      const percent = ((matchCount / (resultsForQuery.length - 1)) * 100).toFixed(0);
      // Add consistencyRating to each result in resultsForQuery
      for (const result of resultsForQuery) {
        result.consistencyRating = Number(percent);
      }
      const icon = percent === '100' ? '✅' : '❌';
      console.info(`\n${line}`);      
      console.info(`\n• ${icon} \x1b[1mConsistency Rating:\x1b[0m ${percent}% (${matchCount} / ${resultsForQuery.length - 1} runs matched)`);
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
      });
      uiResults.push(entry);
      
      // Take screenshot after each query (viewport only)
      const actualQuery = query?.value ?? query;
      const screenshotPath = getScreenshotPath(testType, i, actualQuery, runTimestamp);
      await ensureDirectoryExists(screenshotPath);
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 Screenshot saved: ${screenshotPath}`);
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
  if (isFixedQueriesOnly()) {
    return [...fixedQueries];
  }
  return [...fixedQueries, ...generatedQueries];
}

