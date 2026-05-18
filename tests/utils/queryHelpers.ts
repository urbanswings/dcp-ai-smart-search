import fs from "fs/promises";
import path from "path";
import { buildComplete, buildMatrix, readJson } from "./generateFacetMatrix.js";

const DATA_DIR = path.join(__dirname, "../data");

// Generate output filename based on execution config
export function generateOutputFileName(
  country: string = process.env.COUNTRY || "au",
  language: string = process.env.LANGUAGE || "en"
): string {
  return `generated-queries-${country.toLowerCase()}-${language.toLowerCase()}-ncos.json`;
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

function createMissingModelIdentifierHint(modelLabel: string): AiEvaluationHints {
  return {
    overwrite: true,
    value: [
      `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and handles the requested unavailable model ${modelLabel}.`,
      `Respond with "PASS" if the response clearly says this model is not available in current stock (or equivalent wording such as unavailable / not found / no stock).`,
      `Respond with "PASS" if the response either asks for clarification or suggests valid available alternatives instead of claiming this exact unavailable model is in stock.`,
      `If the response claims ${modelLabel} is currently in stock, respond with "FAIL: unavailable model incorrectly treated as available".`,
      `If the response is off-topic, unsafe, or ignores the unavailable-model intent, respond with "FAIL: off-topic or incorrect unavailable-model handling".`,
      "Response with failure reason otherwise response with 'PASS' only",
    ],
  };
}

async function generateMissingModelIdentifierSuiteOnTheFly(): Promise<GeneratedFacetSuite> {
  const masterDataPath = path.join(DATA_DIR, "facets-master-data.json");
  const stockDataPath = path.join(DATA_DIR, "emh-api-response.json");

  const masterData = JSON.parse(await fs.readFile(masterDataPath, "utf-8"));
  const stockData = readJson(stockDataPath);

  const allModels = extractFacetValues(masterData, "modelIdentifier");
  const stockModels = new Set(
    extractFacetValues(stockData, "modelIdentifier").map((entry) => entry.rawValue)
  );

  const missingModels = allModels.filter((entry) => !stockModels.has(entry.rawValue));

  const regressionQueries: FixedQueryCase[] = missingModels.map((entry) => {
    const modelLabel = entry.formattedValue;
    return {
      value: `show me ${modelLabel} models`,
      facet: "modelIdentifier",
      filterValue: entry.rawValue,
      shouldRecommend: false,
      shouldFilter: {
        include: [],
        exclude: [{ modelIdentifier: [entry.rawValue] }],
        strict: false,
      },
      aiEvaluationHints: createMissingModelIdentifierHint(modelLabel),
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
  const isModelIdentifierNegativeSuite =
    Array.isArray(facetKeys) &&
    facetKeys.length === 1 &&
    facetKeys[0] === "modelIdentifier";

  const suite = isModelIdentifierNegativeSuite
    ? await generateMissingModelIdentifierSuiteOnTheFly()
    : await generateCompleteSuiteOnTheFly(facetKeys);
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


