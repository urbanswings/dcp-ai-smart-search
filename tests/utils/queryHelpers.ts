import fs from "fs/promises";
import path from "path";
import { buildComplete, buildMatrix, readJson } from "./generateFacetMatrix.js";

const DATA_DIR = path.join(__dirname, "../data");

// Generate output filename based on execution config
export function generateOutputFileName(
  country: string = process.env.COUNTRY || "au",
  language: string = process.env.LANGUAGE || "en",
  product: string = process.env.PRODUCT || "ncos"
): string {
  return `generated-queries-${country.toLowerCase()}-${language.toLowerCase()}-${product.toLowerCase()}.json`;
}

export interface AiEvaluationHints {
  value: string[];
  overwrite: boolean;
}

export interface ShouldFilterSpec {
  include?: Array<Record<string, any>>;
  exclude?: Array<Record<string, any>>;
  strict?: boolean;
}

export interface FixedQueryCase {
  value: string;
  shouldRecommend?: boolean;
  shouldFilter?: ShouldFilterSpec | Record<string, any> | boolean;
  aiEvaluationHints?: AiEvaluationHints;
  [key: string]: any;
}

export type FixedQueryInput = string | FixedQueryCase;

export interface GeneratedFacetSuite {
  generatedAt?: string;
  sourcePath?: string;
  queryCount?: number;
  regressionQueries?: FixedQueryInput[];
  informativeHintsByQuery?: Record<string, string[]>;
}

export async function loadGeneratedFacetSuite(
  filePath: string,
  fallbackHints?: AiEvaluationHints
): Promise<FixedQueryCase[]> {
  const raw = await fs.readFile(filePath, "utf-8");
  const suite = JSON.parse(raw) as GeneratedFacetSuite;
  return normalizeGeneratedFacetCompleteSuite(suite, fallbackHints);
}

function filterFacetsInApiResponse(
  sourceData: GeneratedFacetSuite | any,
  allowedFacetKeys: string[]
): any {
  if (!Array.isArray(allowedFacetKeys) || allowedFacetKeys.length === 0) {
    return sourceData;
  }

  const allowed = new Set(allowedFacetKeys);
  const allFacets = sourceData?.data?.search?.facets;
  if (!allFacets || typeof allFacets !== "object") {
    return sourceData;
  }

  const filteredFacets = Object.fromEntries(
    Object.entries(allFacets).filter(([facetKey]) => allowed.has(facetKey))
  );

  return {
    ...sourceData,
    data: {
      ...(sourceData?.data || {}),
      search: {
        ...(sourceData?.data?.search || {}),
        facets: filteredFacets,
      },
    },
  };
}

async function generateCompleteSuiteOnTheFly(facetKeys?: string[]): Promise<GeneratedFacetSuite> {
  const sourceDataPath = path.join(DATA_DIR, "emh-api-response.json");
  const sourceData = readJson(sourceDataPath);
  const scopedSourceData = filterFacetsInApiResponse(sourceData, facetKeys || []);
  return buildComplete(scopedSourceData);
}

async function generateMatrixSuiteOnTheFly(): Promise<GeneratedFacetSuite> {
  const sourceDataPath = path.join(DATA_DIR, "emh-api-response.json");
  const sourceData = readJson(sourceDataPath);
  return buildMatrix(sourceData);
}

function extractFacetValues(sourceData: any, facetKey: string): Array<{ rawValue: string; formattedValue: string }> {
  const facetValues = sourceData?.data?.search?.facets?.[facetKey]?.values || sourceData?.[facetKey]?.values;
  if (!Array.isArray(facetValues)) {
    return [];
  }

  const seen = new Set<string>();
  const values: Array<{ rawValue: string; formattedValue: string }> = [];

  for (const entry of facetValues) {
    const raw =
      typeof entry === "string" || typeof entry === "number"
        ? String(entry)
        : String(entry?.value ?? "");
    const rawValue = raw.trim();
    if (!rawValue || rawValue.toUpperCase() === "UNDEFINED") {
      continue;
    }

    if (seen.has(rawValue)) {
      continue;
    }
    seen.add(rawValue);

    const formattedValue =
      typeof entry === "object" && entry !== null && entry?.formattedValue
        ? String(entry.formattedValue).trim()
        : rawValue;

    values.push({
      rawValue,
      formattedValue: formattedValue || rawValue,
    });
  }

  return values;
}

function createUnavailableFacetValueHint(facetKey: string, valueLabel: string): AiEvaluationHints {
  return {
    overwrite: true,
    value: [
      `Respond with "PASS" if the response explicitly states the requested ${facetKey} (${valueLabel}) is unavailable, not available, couldn't find, no exact match, not in stock, or similar unavailability language.`,
      `PASS is acceptable even if alternatives or other recommendations are offered afterward. The key is an upfront explicit unavailability statement.`,
      `Examples of acceptable PASS responses: "couldn't find exact match", "not available", "no results for ${valueLabel}", "not in stock", "we don't have ${valueLabel}".`,
      `FAIL only if: (1) response is completely silent about the request without any acknowledgment, OR (2) response only lists alternatives without ever stating the requested ${valueLabel} is unavailable/not found.`,
      `If the response is off-topic, unsafe, or unrelated to automotive search, respond with "FAIL: off-topic or unsafe response".`,
      "Explicitly stated unavailability = PASS. Respond with 'PASS' or provide specific failure reason.",
    ],
  };
}

function extractMissingFacetValues(
  facetKey: string,
  masterData: any,
  stockData: any
): Array<{ rawValue: string; formattedValue: string }> {
  const allValues = extractFacetValues(masterData, facetKey);
  const stockValuesArr = extractFacetValues(stockData, facetKey);
  
  // For facets that use UUIDs (color, upholstery), normalize by formattedValue
  // Otherwise, normalize by rawValue
  const useFormattedValue = ["color", "upholstery"].includes(facetKey);
  
  const stockValues = new Set(
    stockValuesArr.map((entry) => 
      useFormattedValue 
        ? String(entry.formattedValue).toLowerCase() 
        : String(entry.rawValue).toUpperCase()
    )
  );
  
  return allValues.filter((entry) => {
    const normalizedValue = useFormattedValue
      ? String(entry.formattedValue).toLowerCase()
      : String(entry.rawValue).toUpperCase();
    return !stockValues.has(normalizedValue);
  });
}

async function generateMissingFacetValuesSuiteOnTheFly(facetKey: string): Promise<GeneratedFacetSuite> {
  const masterDataPath = path.join(DATA_DIR, "facets-master-data.json");
  const stockDataPath = path.join(DATA_DIR, "emh-api-response.json");

  const masterData = JSON.parse(await fs.readFile(masterDataPath, "utf-8"));
  const stockData = readJson(stockDataPath);

  const missingValues = extractMissingFacetValues(facetKey, masterData, stockData);

  const regressionQueries: FixedQueryCase[] = missingValues.map((entry) => {
    const valueLabel = entry.formattedValue;
    return {
      value: `show me ${valueLabel} ${facetKey}`,
      facet: facetKey,
      filterValue: entry.rawValue,
      shouldRecommend: false,
      shouldFilter: {
        include: [],
        exclude: [{ [facetKey]: [entry.rawValue] }],
        strict: false,
      },
      aiEvaluationHints: createUnavailableFacetValueHint(facetKey, valueLabel),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sourcePath: `tests/data/${path.basename(masterDataPath)} - tests/data/${path.basename(stockDataPath)}`,
    queryCount: regressionQueries.length,
    regressionQueries,
    informativeHintsByQuery: {},
  };
}

export async function loadFacetCompleteSuite(
  fallbackHints?: AiEvaluationHints,
  facetKeys?: string[]
): Promise<FixedQueryCase[]> {
  const suite = await generateCompleteSuiteOnTheFly(facetKeys);
  const normalizedSuite = normalizeGeneratedFacetCompleteSuite(suite, fallbackHints);
  await saveFacetCompleteSuite(normalizedSuite);
  return normalizedSuite;
}

export async function loadMissingFacetValuesSuite(
  facetKey: string,
  fallbackHints?: AiEvaluationHints
): Promise<FixedQueryCase[]> {
  const suite = await generateMissingFacetValuesSuiteOnTheFly(facetKey);
  const normalizedSuite = normalizeGeneratedFacetCompleteSuite(suite, fallbackHints);
  await saveFacetCompleteSuite(normalizedSuite);
  return normalizedSuite;
}

export async function saveFacetCompleteSuite(
  normalizedSuite: FixedQueryCase[],
  outputFileName: string = generateOutputFileName()
): Promise<void> {
  const outputPath = path.join(DATA_DIR, outputFileName);
  await fs.writeFile(outputPath, JSON.stringify(normalizedSuite, null, 2), "utf-8");
  
  console.log(`✅ Generated queries saved to: ${outputPath}`);
  console.log(`📊 Total queries generated: ${normalizedSuite.length}`);
}

export async function loadFacetMatrixSuite(): Promise<FixedQueryCase[]> {
  const suite = await generateMatrixSuiteOnTheFly();
  return normalizeGeneratedFacetCompleteSuite(suite);
}

export function normalizeFixedQuery(
  query: FixedQueryInput,
  defaults: Partial<Pick<FixedQueryCase, "shouldRecommend" | "shouldFilter" | "aiEvaluationHints">> = {}
): FixedQueryCase {
  const base: FixedQueryCase =
    typeof query === "string" ? { value: query } : { ...query };

  if (base.shouldRecommend === undefined && defaults.shouldRecommend !== undefined) {
    base.shouldRecommend = defaults.shouldRecommend;
  }

  if (base.shouldFilter === undefined && defaults.shouldFilter !== undefined) {
    base.shouldFilter = defaults.shouldFilter;
  }

  if (!base.aiEvaluationHints && defaults.aiEvaluationHints) {
    base.aiEvaluationHints = defaults.aiEvaluationHints;
  }

  return base;
}

export function normalizeFixedQueries(
  queries: FixedQueryInput[],
  defaults: Partial<Pick<FixedQueryCase, "shouldRecommend" | "shouldFilter" | "aiEvaluationHints">> = {}
): FixedQueryCase[] {
  return queries.map((query) => normalizeFixedQuery(query, defaults));
}

export function normalizeGeneratedFacetCompleteSuite(
  suite: GeneratedFacetSuite,
  fallbackHints?: AiEvaluationHints
): FixedQueryCase[] {
  return normalizeFixedQueries(suite.regressionQueries || []).map((query) => {
    const generatedHints = query.value
      ? suite.informativeHintsByQuery?.[query.value] || []
      : [];

    if (generatedHints.length > 0) {
      return {
        ...query,
        aiEvaluationHints: { value: generatedHints, overwrite: true },
      };
    }

    if (!query.aiEvaluationHints && fallbackHints) {
      return {
        ...query,
        aiEvaluationHints: fallbackHints,
      };
    }

    return query;
  });
}


