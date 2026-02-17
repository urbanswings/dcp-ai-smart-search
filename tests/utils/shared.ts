// Shared utilities for both UI and API testing
import fs from "fs/promises";
import path from "path";

export interface TestEntry {
  timestamp: string;
  testMode: "ui" | "api";
  testDescribe: string;
  testTitle: string;
  query: string;
  resultCount: number;
  responseTime?: number;
  statusCode?: number;
  hasError: boolean;
  error?: string;
  uiResults?: any; // For UI mode
  apiResults?: any; // For API mode
  openaiEvaluation: string;
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

export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export function getOutputFileName(testType: string): string {
  const timestamp = new Date().toISOString();
  const dateOnly = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
  }).format(new Date(timestamp));
  const env = process.env.ENVIRONMENT;
  const country = process.env.COUNTRY;
  const product = process.env.PRODUCT;
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

export function createApiResultText(
  results: any,
  resultCount: number,
  responseTime?: number,
  statusCode?: number
): string {
  let resultText = `API Search Results:\n`;

  if (statusCode) {
    resultText += `Status Code: ${statusCode}\n`;
  }

  if (responseTime) {
    resultText += `Response Time: ${responseTime}ms\n`;
  }

  // Handle Smart Search response structure
  if (results?.smartSearchResponse) {
    resultText += `Smart Search Status: ${
      results.smartSearchResponse.passed ? "Passed" : "Failed"
    }\n`;
    const aiMsg =
      results.smartSearchResponse.message_to_user ||
      results.smartSearchResponse.message ||
      results.message_to_user;
    if (aiMsg) {
      resultText += `AI Message: ${aiMsg}\n`;
    }
    if (results.smartSearchResponse.reason) {
      resultText += `Reason: ${results.smartSearchResponse.reason}\n`;
    }
  }

  resultText += `Total Results: ${resultCount}\n\n`;

  // Get the actual search results from the nested structure
  const searchData = results?.searchResults || results;

  if (resultCount > 0 && searchData) {
    // Handle Mercedes-Benz API response structure
    const items =
      searchData.products || searchData.hits || searchData.data || [];

    if (Array.isArray(items)) {
      items.slice(0, 5).forEach((item: any, index: number) => {
        resultText += `Result ${index + 1}:\n`;

        // Mercedes-Benz specific fields
        if (item.shortDisplayName || item.name || item.title) {
          resultText += `  Name: ${
            item.shortDisplayName || item.name || item.title
          }\n`;
        }

        if (item.price || item.grossPrice) {
          const price = item.price || item.grossPrice;
          resultText += `  Price: ${price.value || price} ${
            price.currency || ""
          }\n`;
        }

        if (item.bodyType) {
          resultText += `  Body Type: ${item.bodyType}\n`;
        }

        if (item.modelYear || item.year) {
          resultText += `  Year: ${item.modelYear || item.year}\n`;
        }

        if (item.mileage) {
          resultText += `  Mileage: ${item.mileage.value} ${item.mileage.unit}\n`;
        }

        if (item.id || item.vehicleId) {
          resultText += `  ID: ${item.id || item.vehicleId}\n`;
        }

        resultText += "\n";
      });
    }

    // Add facet information if available
    if (searchData.facets && Array.isArray(searchData.facets)) {
      resultText += `\nAvailable Facets:\n`;
      searchData.facets.slice(0, 3).forEach((facet: any) => {
        resultText += `  ${facet.name}: ${facet.values?.length || 0} options\n`;
      });
    }
  }

  return resultText;
}
