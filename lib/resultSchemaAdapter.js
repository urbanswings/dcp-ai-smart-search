/**
 * Result Schema Adapter
 * 
 * Compatibility layer to work with both old and new result schemas.
 * Automatically detects schema version and normalizes data.
 * 
 * Old schema: flat structure with nested facets and duplicated counts
 * New schema: organized into metadata, request, response, assertions, summary
 */

/**
 * Detect which schema version a result object uses
 * @param {Object} result - A single result object
 * @returns {string} 'new' | 'old' | 'unknown'
 */
function detectSchemaVersion(result) {
  if (!result || typeof result !== 'object') {
    return 'unknown';
  }

  // New schema has these top-level keys
  if (result.metadata && result.request && result.response && result.assertions && result.summary) {
    return 'new';
  }

  // Old schema has these top-level keys
  if (result.timestamp && result.testTitle && result.response && result.results && result.facets) {
    return 'old';
  }

  return 'unknown';
}

/**
 * Normalize a result to new schema format
 * If already in new schema, returns as-is.
 * If in old schema, converts to new.
 * 
 * @param {Object} result - Result in either schema
 * @returns {Object} Result in new schema format
 */
function normalizeToNewSchema(result) {
  const version = detectSchemaVersion(result);

  if (version === 'new') {
    return result;
  }

  if (version === 'old') {
    return convertOldToNew(result);
  }

  throw new Error(`Cannot determine schema version for result: ${JSON.stringify(result).substring(0, 100)}`);
}

/**
 * Convert old schema to new schema
 * @private
 */
function convertOldToNew(oldResult) {
  // Extract expected facets
  const expectedFacets = oldResult.facets?.expected || {};
  const expectedInclude = {};
  const expectedExclude = {};

  for (const facetSpec of expectedFacets.include || []) {
    for (const [facetName, facetValues] of Object.entries(facetSpec || {})) {
      if (facetValues?.length > 0) {
        expectedInclude[facetName] = facetValues;
      }
    }
  }

  for (const facetSpec of expectedFacets.exclude || []) {
    for (const [facetName, facetValues] of Object.entries(facetSpec || {})) {
      if (facetValues?.length > 0) {
        expectedExclude[facetName] = facetValues;
      }
    }
  }

  // Build response data
  const responseData = {
    resultCount: oldResult.resultCount,
    vehicleTotalCount: oldResult.responseVehicleTotalCount,
  };

  if (oldResult.motorization?.length > 0) {
    responseData.detectedModels = oldResult.motorization;
  }

  // Build assertions
  const newResult = {
    metadata: {
      timestamp: oldResult.timestamp,
      timestampSG: oldResult.timestampSG,
      testMode: oldResult.testMode,
      testSuite: oldResult.testDescribe || '',
      testCase: oldResult.testTitle || '',
    },
    request: {
      query: oldResult.query || {},
    },
    response: {
      statusCode: oldResult.statusCode,
      responseTime: oldResult.responseTime,
      message: oldResult.response || {},
      data: responseData,
    },
    assertions: {
      facets: {
        expected: {
          include: expectedInclude,
          exclude: expectedExclude,
        },
        actual: oldResult.facets?.actual || {},
        status: oldResult.results?.facetsResult || 'UNKNOWN',
      },
      count: {
        expected: expectedInclude.resultCount || null,
        actual: oldResult.resultCount,
        status: oldResult.results?.countResult || 'UNKNOWN',
      },
      response: {
        status: oldResult.results?.responseResult || 'UNKNOWN',
      },
    },
    summary: {
      overallStatus: oldResult.hasError ? 'FAIL' : 'PASS',
      hasError: oldResult.hasError || false,
    },
  };

  // Add optional fields
  if (oldResult.results?.backendResultCount !== undefined) {
    newResult.assertions.count.backendCount = oldResult.results.backendResultCount;
  }

  if (oldResult.openaiEvaluation) {
    newResult.assertions.response.feedback = oldResult.openaiEvaluation;
  }

  if (oldResult.facets?.failureReasons?.length > 0) {
    newResult.summary.failureReasons = oldResult.facets.failureReasons;
  }

  return newResult;
}

/**
 * Extract commonly-needed fields from a normalized result
 * Works with new schema format
 * 
 * @param {Object} result - Result in new schema
 * @returns {Object} Extracted fields object
 */
function extractFields(result) {
  const normalized = normalizeToNewSchema(result);

  return {
    // Metadata
    timestamp: normalized.metadata?.timestamp,
    timestampSG: normalized.metadata?.timestampSG,
    testMode: normalized.metadata?.testMode,
    testSuite: normalized.metadata?.testSuite,
    testCase: normalized.metadata?.testCase,

    // Request
    query: normalized.request?.query || {},
    queryText: extractQueryText(normalized.request?.query || {}),

    // Response
    statusCode: normalized.response?.statusCode,
    responseTime: normalized.response?.responseTime,
    responseMessage: normalized.response?.message || {},
    resultCount: normalized.response?.data?.resultCount,
    vehicleTotalCount: normalized.response?.data?.vehicleTotalCount,
    detectedModels: normalized.response?.data?.detectedModels || [],

    // Assertions
    facetsStatus: normalized.assertions?.facets?.status,
    countStatus: normalized.assertions?.count?.status,
    responseStatus: normalized.assertions?.response?.status,
    facetsActual: normalized.assertions?.facets?.actual || {},
    facetsExpected: normalized.assertions?.facets?.expected || {},
    responseFeedback: normalized.assertions?.response?.feedback,

    // Summary
    overallStatus: normalized.summary?.overallStatus,
    hasError: normalized.summary?.hasError,
    failureReasons: normalized.summary?.failureReasons || [],
  };
}

/**
 * Extract query text from multilingual query object
 * Prefers non-English language if available
 * 
 * @param {Object|string} query - Query object or string
 * @returns {string} Extracted query text
 */
function extractQueryText(query) {
  if (!query) return '';

  if (typeof query === 'string') {
    return query;
  }

  if (typeof query === 'object') {
    // Prefer non-English values (original language)
    if (query.tr) return query.tr;
    if (query.ja) return query.ja;
    if (query.hi) return query.hi;
    if (query.bn) return query.bn;
    if (query.gu) return query.gu;
    if (query.kn) return query.kn;
    if (query.ml) return query.ml;
    if (query.mr) return query.mr;
    if (query.ta) return query.ta;
    if (query.te) return query.te;
    if (query.th) return query.th;
    if (query.ko) return query.ko;

    // Fallback to any language, prefer en last
    const firstValue = Object.values(query).find((v) => v);
    return firstValue || '';
  }

  return '';
}

/**
 * Filter results by status(es)
 * @param {Array} results - Array of result objects (any schema version)
 * @param {string|Array<string>} statuses - Status or statuses to filter by ('PASS', 'FAIL', 'SKIP')
 * @returns {Array} Filtered results
 */
function filterByStatus(results, statuses) {
  const statusList = Array.isArray(statuses) ? statuses : [statuses];
  return results.filter((result) => {
    const normalized = normalizeToNewSchema(result);
    return statusList.includes(normalized.summary?.overallStatus);
  });
}

/**
 * Group results by test suite
 * @param {Array} results - Array of result objects (any schema version)
 * @returns {Object} Grouped by testSuite
 */
function groupByTestSuite(results) {
  const grouped = {};

  for (const result of results) {
    const fields = extractFields(result);
    const suite = fields.testSuite || 'Unknown';

    if (!grouped[suite]) {
      grouped[suite] = [];
    }
    grouped[suite].push(result);
  }

  return grouped;
}

/**
 * Group results by test case
 * @param {Array} results - Array of result objects (any schema version)
 * @returns {Object} Grouped by testCase
 */
function groupByTestCase(results) {
  const grouped = {};

  for (const result of results) {
    const fields = extractFields(result);
    const testCase = fields.testCase || 'Unknown';

    if (!grouped[testCase]) {
      grouped[testCase] = [];
    }
    grouped[testCase].push(result);
  }

  return grouped;
}

/**
 * Get status summary statistics
 * @param {Array} results - Array of result objects (any schema version)
 * @returns {Object} Summary with counts
 */
function getStatusSummary(results) {
  const summary = {
    total: results.length,
    pass: 0,
    fail: 0,
    skip: 0,
    unknown: 0,
  };

  for (const result of results) {
    const normalized = normalizeToNewSchema(result);
    const status = normalized.summary?.overallStatus || 'unknown';

    if (status === 'PASS') summary.pass++;
    else if (status === 'FAIL') summary.fail++;
    else if (status === 'SKIP') summary.skip++;
    else summary.unknown++;
  }

  summary.passPercentage = summary.total > 0 ? ((summary.pass / summary.total) * 100).toFixed(2) : 0;
  summary.failPercentage = summary.total > 0 ? ((summary.fail / summary.total) * 100).toFixed(2) : 0;

  return summary;
}

module.exports = {
  detectSchemaVersion,
  normalizeToNewSchema,
  extractFields,
  extractQueryText,
  filterByStatus,
  groupByTestSuite,
  groupByTestCase,
  getStatusSummary,
};
