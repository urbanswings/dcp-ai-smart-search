// Shared utilities for both UI and API testing

export interface TestEntry {
  timestamp: string;
  testMode: 'ui' | 'api';
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

export function getTestMode(): 'ui' | 'api' | 'both' {
  return (process.env.TEST_MODE as 'ui' | 'api' | 'both') || 'ui';
}

export function shouldRunUiTests(): boolean {
  const mode = getTestMode();
  return mode === 'ui' || mode === 'both';
}

export function shouldRunApiTests(): boolean {
  const mode = getTestMode();
  return mode === 'api' || mode === 'both';
}

export function getOutputFileName(testType: string): string {
  const mode = getTestMode();
  if (mode === 'both') {
    return `./results/json/search-results-${testType}-combined.json`;
  }
  return `./results/json/search-results-${testType}-${mode}.json`;
}

export async function combineResults(uiResults: any[], apiResults: any[]): Promise<any[]> {
  const combined = [];
  
  // Add UI results
  for (const result of uiResults) {
    combined.push({ ...result, testMode: 'ui' });
  }
  
  // Add API results
  for (const result of apiResults) {
    combined.push({ ...result, testMode: 'api' });
  }
  
  return combined;
}

// Helper to create a simple text result for API evaluation
export function createApiResultText(results: any, resultCount: number, responseTime?: number, statusCode?: number): string {
  let resultText = `API Search Results:\n`;
  
  if (statusCode) {
    resultText += `Status Code: ${statusCode}\n`;
  }
  
  if (responseTime) {
    resultText += `Response Time: ${responseTime}ms\n`;
  }
  
  // Handle Smart Search response structure
  if (results?.smartSearchResponse) {
    resultText += `Smart Search Status: ${results.smartSearchResponse.passed ? 'Passed' : 'Failed'}\n`;
    if (results.smartSearchResponse.message_to_user) {
      resultText += `AI Message: ${results.smartSearchResponse.message_to_user}\n`;
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
    const items = searchData.products || searchData.hits || searchData.data || [];
    
    if (Array.isArray(items)) {
      items.slice(0, 5).forEach((item: any, index: number) => {
        resultText += `Result ${index + 1}:\n`;
        
        // Mercedes-Benz specific fields
        if (item.shortDisplayName || item.name || item.title) {
          resultText += `  Name: ${item.shortDisplayName || item.name || item.title}\n`;
        }
        
        if (item.price || item.grossPrice) {
          const price = item.price || item.grossPrice;
          resultText += `  Price: ${price.value || price} ${price.currency || ''}\n`;
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
        
        resultText += '\n';
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