// Shared utilities for both UI and API testing
import fs from "fs/promises";
import path from "path";
import { ENVIRONMENT, COUNTRY, PRODUCT, LANGUAGE } from "./testHelpers";

export { ENVIRONMENT, COUNTRY, PRODUCT, LANGUAGE };

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

export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export function getOutputFileName(testType: string): string {
  const timestamp = new Date().toISOString();
  const dateOnly = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
  }).format(new Date(timestamp));
  const env = ENVIRONMENT;
  const country = COUNTRY;
  const product = PRODUCT;
  const mode = getTestMode();
  if (mode === "both") {
    return `./results/json/${dateOnly}_${env}/${country}_${product}_search-results_${testType}-both_${timestamp}.json`;
  }
  return `./results/json/${dateOnly}_${env}/${country}_${product}_search-results_${testType}-${mode}_${timestamp}.json`;
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

  // Run UI tests if enabled
  if (shouldRunUiTests() && setupContextAndPage && performUISmartSearchAndGetResults && processAndLogUiResult) {
    const page = await setupContextAndPage(browser);
    for (const query of queries) {
      const results = await performUISmartSearchAndGetResults(page, query);
      const entry = await processAndLogUiResult({
        query,
        results,
        testDescribe,
        testTitle,
      });
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

