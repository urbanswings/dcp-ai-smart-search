import { test, TestInfo } from "@playwright/test";
import fs from "fs/promises";
import { fetchEmhApiResponse } from "../api/apiHelpers";
import { normalizeFixedQueries, saveFacetCompleteSuite } from "../query/queryHelpers";
import {
  COUNTRY,
  ENVIRONMENT,
  getProject,
  LANGUAGE,
  PRODUCT,
  VEHICLE_CATEGORY,
} from "./shared";
import { logTestContext } from "./testHelpers";

const DEFAULT_TEST_TIMEOUT_MS = 10 * 60000;
const QUERY_TIMEOUT_BUFFER_MS = 2 * 60000;
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || 45000);
const MAX_QUERY_SCALED_TIMEOUT_MS = Number(
  process.env.MAX_QUERY_TIMEOUT_MS || 60 * 60000,
);

export async function fetchAndSaveEmhApiResponse(
  outputPath: string,
  options: { throwOnError?: boolean } = {},
): Promise<any | null> {
  try {
    const emhApiResponse = await fetchEmhApiResponse();

    if (!emhApiResponse) {
      throw new Error("No EMH API response returned.");
    }

    await fs.writeFile(
      outputPath,
      JSON.stringify(emhApiResponse, null, 2),
      "utf-8",
    );
    console.log(`Saved EMH API response to: ${outputPath}`);
    return emhApiResponse;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch and save EMH API response:", errorMessage);
    if (options.throwOnError) {
      throw error;
    }
    return null;
  }
}

export async function saveGeneratedQueriesIfAny(
  queries: unknown[],
): Promise<void> {
  if (!Array.isArray(queries) || queries.length === 0) {
    return;
  }

  await saveFacetCompleteSuite(
    normalizeFixedQueries(
      queries as Parameters<typeof normalizeFixedQueries>[0],
    ),
  );
}

export function extendTimeoutForQueryCount(
  testInfo: TestInfo,
  queryCount: number,
): void {
  if (!Number.isFinite(queryCount) || queryCount <= 0) {
    return;
  }

  const scaledTimeout = Math.min(
    Math.max(
      DEFAULT_TEST_TIMEOUT_MS,
      QUERY_TIMEOUT_BUFFER_MS + queryCount * QUERY_TIMEOUT_MS,
    ),
    MAX_QUERY_SCALED_TIMEOUT_MS,
  );

  if (scaledTimeout > testInfo.timeout) {
    testInfo.setTimeout(scaledTimeout);
    console.log(
      `[timeout] Extended "${testInfo.title}" timeout to ${Math.round(scaledTimeout / 1000)}s for ${queryCount} queries.`,
    );
  }
}

export function registerSmartSearchSuiteHooks(
  describeName: string,
  failureLogLevel: "error" | "warn" = "error",
): void {
  test.beforeEach(async ({}, testInfo) => {
    const env = ENVIRONMENT;
    const country = COUNTRY;
    const product = PRODUCT;
    const vehicleCategory = VEHICLE_CATEGORY;
    const project = getProject();
    const browserType = "chromium";
    const timestamp = new Date().toISOString();
    const language = LANGUAGE?.toLowerCase() || "en";

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
      console[failureLogLevel](`Test failed: ${testInfo.title}`);
    } else {
      console.log(`Test passed: ${testInfo.title}`);
    }
  });
}
