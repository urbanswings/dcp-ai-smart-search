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

export async function loadFacetCompleteSuite(
  fallbackHints?: AiEvaluationHints,
  facetKeys?: string[]
): Promise<FixedQueryCase[]> {
  const suite = await generateCompleteSuiteOnTheFly(facetKeys);
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


