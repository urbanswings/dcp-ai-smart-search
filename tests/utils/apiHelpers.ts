import axios from 'axios';

export interface ApiSearchResult {
  query: string;
  results: any;
  responseTime: number;
  statusCode: number;
  error?: string;
}

export interface ApiClient {
  searchEndpoint: string;
  baseURL: string;
  headers: Record<string, string>;
}

export class SearchApiClient {
  private client: any;
  private baseURL: string;

  constructor() {
    const env = process.env.ENVIRONMENT?.toUpperCase();
    
    // Determine base URL based on environment
    if (env === 'PROD' || env === 'PRODUCTION') {
      this.baseURL = 'https://shop.mercedes-benz.com';
    } else {
      // Default to INT for staging, dev, or any other environment
      this.baseURL = 'https://shop-int.mercedes-benz.com';
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AI-Smart-Search-Test/1.0',
      },
    });
  }

  async getSmartSearchQuery(query: string): Promise<ApiSearchResult> {
    const startTime = Date.now();
    try {
      const countryCode = process.env.COUNTRY?.toUpperCase() || 'KR';
      const locale = (process.env.COUNTRY || 'kr').toLowerCase();
      
      const params = {
        raw: query,
        countryCode: countryCode,
        fields: 'FULL',
        lang: 'ko',
        pageSize: 12,
        currentPage: 0,
        sales_channel: 'second_hand'
      };

      const response = await this.client.get(`/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`, {
        params
      });

      const responseTime = Date.now() - startTime;
      
      // Parse response data if it's a string
      let responseData = response.data;
      if (typeof responseData === 'string') {
        try {
          responseData = JSON.parse(responseData);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }
      
      return {
        query,
        results: responseData,
        responseTime,
        statusCode: response.status,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      let errorMessage = error.message || 'Unknown API error';
      
      // Include response data for better debugging
      if (error.response?.data) {
        errorMessage += ` | Response: ${JSON.stringify(error.response.data)}`;
      }
      
      return {
        query,
        results: null,
        responseTime,
        statusCode: error.response?.status || 0,
        error: errorMessage,
      };
    }
  }

  async performSearch(query: string): Promise<ApiSearchResult> {
    const startTime = Date.now();
    try {
      const countryCode = process.env.COUNTRY?.toUpperCase() || 'KR';
      const locale = (process.env.COUNTRY || 'kr').toLowerCase();
      
      // Step 1: Get Smart Search Query
      const smartSearchParams = {
        raw: query,
        countryCode: countryCode,
        fields: 'FULL',
        lang: 'ko',
        pageSize: 12,
        currentPage: 0,
        sales_channel: 'second_hand'
      };

      const smartSearchResponse = await this.client.get(`/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`, {
        params: smartSearchParams
      });

      // Parse response data if it's a string
      let smartSearchData = smartSearchResponse.data;
      if (typeof smartSearchData === 'string') {
        try {
          smartSearchData = JSON.parse(smartSearchData);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }
      
      // Check if Smart Search was successful
      if (!smartSearchData.passed || !smartSearchData.url) {
        const responseTime = Date.now() - startTime;
        return {
          query,
          results: {
            smartSearchResponse: smartSearchData,
            message_to_user: smartSearchData.message_to_user,
            passed: smartSearchData.passed,
            reason: smartSearchData.reason
          },
          responseTime,
          statusCode: smartSearchData.http_status_code || smartSearchResponse.status,
          // Don't set error for no_results - it's a valid response with message_to_user
        };
      }

      // Step 2: Execute the actual search using the returned URL
      const actualSearchResponse = await axios.get(smartSearchData.url, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AI-Smart-Search-Test/1.0',
        }
      });

      const responseTime = Date.now() - startTime;
      
      return {
        query,
        results: {
          smartSearchResponse: smartSearchData,
          searchResults: actualSearchResponse.data,
          message_to_user: smartSearchData.message_to_user
        },
        responseTime,
        statusCode: actualSearchResponse.status,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      // Handle 400 status codes as valid responses with message_to_user
      if (error.response?.status === 400) {
        let responseData = error.response.data;
        
        // Parse response data if it's a string
        if (typeof responseData === 'string') {
          try {
            responseData = JSON.parse(responseData);
          } catch (e) {
            // If parsing fails, keep as string
          }
        }
        
        // Extract message_to_user from nested error structure if present
        let messageToUser = responseData.message_to_user || 'No message available';
        let reason = responseData.reason || 'Bad request';
        
        if (responseData.errors && Array.isArray(responseData.errors) && responseData.errors.length > 0) {
          const errorMessage = responseData.errors[0].message;
          if (errorMessage && typeof errorMessage === 'string') {
            try {
              const parsedError = JSON.parse(errorMessage);
              if (parsedError.message_to_user) {
                messageToUser = parsedError.message_to_user;
              }
              if (parsedError.reason) {
                reason = parsedError.reason;
              }
            } catch (e) {
              // If parsing fails, use the original message
            }
          }
        }
        
        return {
          query,
          results: {
            smartSearchResponse: responseData,
            message_to_user: messageToUser,
            passed: false,
            reason: reason
          },
          responseTime,
          statusCode: 400,
        };
      }
      
      return {
        query,
        results: null,
        responseTime,
        statusCode: error.response?.status || 0,
        error: error.message || 'Unknown API error',
      };
    }
  }

  async performSearchWithFacets(query: string, facets?: Record<string, any>): Promise<ApiSearchResult> {
    const startTime = Date.now();
    try {
      const countryCode = process.env.COUNTRY?.toUpperCase() || 'KR';
      const locale = (process.env.COUNTRY || 'kr').toLowerCase();
      
      // Step 1: Get Smart Search Query
      const smartSearchParams = {
        raw: query,
        countryCode: countryCode,
        fields: 'FULL',
        lang: 'ko',
        pageSize: 12,
        currentPage: 0,
        sales_channel: 'second_hand',
        ...(facets && facets) // Additional facet parameters can be added here
      };

      const smartSearchResponse = await this.client.get(`/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`, {
        params: smartSearchParams
      });

      // Parse response data if it's a string
      let smartSearchData = smartSearchResponse.data;
      if (typeof smartSearchData === 'string') {
        try {
          smartSearchData = JSON.parse(smartSearchData);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }
      
      // Check if Smart Search was successful
      if (!smartSearchData.passed || !smartSearchData.url) {
        const responseTime = Date.now() - startTime;
        return {
          query,
          results: {
            smartSearchResponse: smartSearchData,
            message_to_user: smartSearchData.message_to_user,
            passed: smartSearchData.passed,
            reason: smartSearchData.reason
          },
          responseTime,
          statusCode: smartSearchData.http_status_code || smartSearchResponse.status,
          // Don't set error for no_results - it's a valid response with message_to_user
        };
      }

      // Step 2: Execute the actual search using the returned URL
      let searchUrl = smartSearchData.url;
      
      // Apply additional facets to the search URL if provided
      if (facets && Object.keys(facets).length > 0) {
        const url = new URL(searchUrl);
        Object.entries(facets).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => url.searchParams.append(key, v));
          } else {
            url.searchParams.set(key, value);
          }
        });
        searchUrl = url.toString();
      }

      const actualSearchResponse = await axios.get(searchUrl, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AI-Smart-Search-Test/1.0',
        }
      });

      const responseTime = Date.now() - startTime;
      
      return {
        query,
        results: {
          smartSearchResponse: smartSearchData,
          searchResults: actualSearchResponse.data,
          message_to_user: smartSearchData.message_to_user,
          appliedFacets: facets
        },
        responseTime,
        statusCode: actualSearchResponse.status,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      // Handle 400 status codes as valid responses with message_to_user
      if (error.response?.status === 400) {
        let responseData = error.response.data;
        
        // Parse response data if it's a string
        if (typeof responseData === 'string') {
          try {
            responseData = JSON.parse(responseData);
          } catch (e) {
            // If parsing fails, keep as string
          }
        }
        
        // Extract message_to_user from nested error structure if present
        let messageToUser = responseData.message_to_user || 'No message available';
        let reason = responseData.reason || 'Bad request';
        
        if (responseData.errors && Array.isArray(responseData.errors) && responseData.errors.length > 0) {
          const errorMessage = responseData.errors[0].message;
          if (errorMessage && typeof errorMessage === 'string') {
            try {
              const parsedError = JSON.parse(errorMessage);
              if (parsedError.message_to_user) {
                messageToUser = parsedError.message_to_user;
              }
              if (parsedError.reason) {
                reason = parsedError.reason;
              }
            } catch (e) {
              // If parsing fails, use the original message
            }
          }
        }
        
        return {
          query,
          results: {
            smartSearchResponse: responseData,
            message_to_user: messageToUser,
            passed: false,
            reason: reason,
            appliedFacets: facets
          },
          responseTime,
          statusCode: 400,
        };
      }
      
      return {
        query,
        results: null,
        responseTime,
        statusCode: error.response?.status || 0,
        error: error.message || 'Unknown API error',
      };
    }
  }
}

export async function performApiSearchAndGetResults(query: string, facets?: Record<string, any>): Promise<ApiSearchResult> {
  const apiClient = new SearchApiClient();
  
  if (facets) {
    return await apiClient.performSearchWithFacets(query, facets);
  }
  
  return await apiClient.performSearch(query);
}

export async function processAndLogApiResult({
  query,
  result,
  testDescribe,
  testTitle,
  customEval,
  expectedStatusCode
}: {
  query: string;
  result: ApiSearchResult;
  testDescribe: string;
  testTitle: string;
  customEval?: (resultData: any) => Promise<string>;
  expectedStatusCode?: number;
}): Promise<any> {
  const { evaluateSearchResult } = await import('./testHelpers');
  const { createApiResultText } = await import('./shared');
  
  let evaluation = "No results to evaluate";
  let resultCount = 0;
  let hasError = false;

  // Check if status code matches expectation (if provided)
  if (expectedStatusCode && result.statusCode !== expectedStatusCode) {
    evaluation = `Status Code Mismatch: Expected ${expectedStatusCode}, got ${result.statusCode}`;
    hasError = true;
  } else if (expectedStatusCode && result.statusCode === expectedStatusCode) {
    // If we have an expected status code and it matches, treat as success regardless of error
    evaluation = `Expected status code ${expectedStatusCode} received as expected`;
    hasError = false;
    
    // If there are also results to evaluate, include that information
    if (result.results) {
      const searchResults = result.results.searchResults;
      const smartSearchResponse = result.results.smartSearchResponse;
      
      if (searchResults) {
        resultCount = searchResults.products?.length || 
                     searchResults.pagination?.totalNumberOfResults ||
                     searchResults.hits?.length ||
                     searchResults.data?.length || 0;
      }
      
      const resultText = createApiResultText(result.results, resultCount, result.responseTime, result.statusCode);
      
      if (customEval) {
        const additionalEval = await customEval(result.results);
        evaluation += ` | ${additionalEval}`;
      } else {
        const additionalEval = await evaluateSearchResult(resultText);
        evaluation += ` | ${additionalEval}`;
      }
      
      // Add smart search message to evaluation if available
      if (smartSearchResponse?.message_to_user) {
        evaluation += `\n\nSmart Search Message: ${smartSearchResponse.message_to_user}`;
      }
    }
  } else if (result.error && result.statusCode !== 400) {
    // Check for non-400 errors (400 is now treated as valid response with message_to_user)
    evaluation = `API Error: ${result.error}`;
    hasError = true;
  } else if (result.results) {
    // Handle the new Smart Search + Actual Search response structure
    const searchResults = result.results.searchResults;
    const smartSearchResponse = result.results.smartSearchResponse;
    
    // Extract result count from the actual search results
    if (searchResults) {
      resultCount = searchResults.products?.length || 
                   searchResults.pagination?.totalNumberOfResults ||
                   searchResults.hits?.length ||
                   searchResults.data?.length || 0;
    } else {
      // If no search results, it means smart search failed or returned no URL
      resultCount = 0;
    }
    
    const resultText = createApiResultText(result.results, resultCount, result.responseTime, result.statusCode);
    
    if (customEval) {
      evaluation = await customEval(result.results);
    } else {
      evaluation = await evaluateSearchResult(resultText);
    }
    
    // Add smart search message to evaluation if available
    if (smartSearchResponse?.message_to_user) {
      evaluation += `\n\nSmart Search Message: ${smartSearchResponse.message_to_user}`;
    }
  }

  const entry = {
    timestamp: new Date().toISOString(),
    testMode: 'api',
    testDescribe,
    testTitle,
    query,
    resultCount,
    responseTime: result.responseTime,
    statusCode: result.statusCode,
    hasError,
    error: result.error,
    apiResults: result.results,
    openaiEvaluation: evaluation,
  };

  // Format output to match UI test format
  const icon = hasError ? "❌" : "✅";
  const smartSearchMessage = result.results?.smartSearchResponse?.message_to_user || 
                            result.results?.message_to_user || 
                            "No message available";
  
  console.log(`${testTitle}: '${query}'`);
  console.log(`Search results: ${smartSearchMessage}`);
  console.log(`\t${icon} ${evaluation.replace(/\n\nSmart Search Message:.*/, '')}`);
  console.log("\n");
  
  return entry;
}