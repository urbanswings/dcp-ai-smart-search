import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { AzureOpenAI } from "openai";
import * as promptEngine from "./promptEngineHelper";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const rootDir = process.cwd();
const sourcePath = path.resolve(rootDir, process.env.MATRIX_SOURCE || "tests/data/emh-api-response.json");
const aiPromptsPath = path.resolve(rootDir, "tests/data/ai-query-prompts.json");

const FACET_ORDER = ["bodyType", "fuelType", "color", "stockType", "brand", "seats"];

// Types
interface FacetValue {
  value: string | number;
  formattedValue?: string;
}

interface FacetListEntry {
  rawValue: string | number;
  formattedValue: string;
}

interface FacetRange {
  min: number;
  max: number;
}

interface Facets {
  [key: string]: {
    values?: FacetValue[] | { min: number; max: number };
    facetType?: string;
  };
}

interface ApiResponse {
  data?: {
    search?: {
      facets?: Facets;
      results?: SearchResult[];
    };
  };
}

interface SearchResult {
  vehicleModel?: {
    motorization?: string;
    vehicleClass?: {
      value?: string | number;
    };
  };
}

interface ShouldFilter {
  include: Array<Record<string, unknown>>;
  exclude: unknown[];
  strict: boolean;
}

interface RegressionQuery {
  value: string;
  facet?: string;
  filterValue?: string;
  shouldRecommend: boolean;
  shouldFilter: ShouldFilter;
}

interface CompleteQuery extends RegressionQuery {}

interface GeneratedSuite {
  generatedAt: string;
  sourcePath: string;
  queryCount: number;
  regressionQueries: RegressionQuery[];
  informativeHintsByQuery: Record<string, string[]>;
}

interface PromptConfig {
  systemPrompt?: string;
  userPromptTemplate?: string;
  maxTokens?: number;
}

interface GenerationOptions {
  language?: string;
  fallbackFn?: (facetKey: string, formattedValue: string, rawValue: unknown) => string;
  filterTextFn?: (facetKey: string, formattedValue: string, rawValue: unknown) => string;
  maxTokens?: number;
}

// Utility functions
function readJson(filePath: string): ApiResponse {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function titleCaseFromToken(value: unknown): string {
  return String(value)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getFacetValues(facets: Facets, facetKey: string): Array<string | number> {
  const values = facets?.[facetKey]?.values;
  if (!Array.isArray(values)) {
    return [];
  }
  const extracted = values
    .map((entry) => entry?.value)
    .filter(
      (value) => value !== undefined && value !== null && String(value).toUpperCase() !== "UNDEFINED"
    );
  return [...new Set(extracted)];
}

function isOpaqueValue(value: unknown): boolean {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{7,}$/i.test(normalized);
}

function getFacetListEntries(facets: Facets, facetKey: string): FacetListEntry[] {
  const values = facets?.[facetKey]?.values;
  if (!Array.isArray(values)) {
    return [];
  }

  const out: FacetListEntry[] = [];
  const seen = new Set<string>();
  for (const entry of values) {
    const rawValue = entry?.value;
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    if (String(rawValue).toUpperCase() === "UNDEFINED") {
      continue;
    }

    const formattedValue = entry?.formattedValue || String(rawValue);
    if (!entry?.formattedValue && isOpaqueValue(rawValue)) {
      continue;
    }

    const key = `${String(rawValue)}::${String(formattedValue)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    out.push({
      rawValue,
      formattedValue: String(formattedValue).trim(),
    });
  }
  return out;
}

function getFacetRange(facets: Facets, facetKey: string): FacetRange | null {
  const values = facets?.[facetKey]?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return null;
  }
  const min = Number((values as Record<string, unknown>).min);
  const max = Number((values as Record<string, unknown>).max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }
  return { min, max };
}

function formatNumberForQuery(value: unknown): string {
  return Math.round(Number(value)).toLocaleString("en-US");
}

function fallbackCompleteQuery(facetKey: string, formattedValue: string, rawValue: unknown): string {
  if (facetKey === "modelIdentifier") {
    return `list me all ${formattedValue}`;
  }
  if (facetKey === "upholstery") {
    return `i'm interested in ${formattedValue} interior`;
  }
  if (facetKey === "price") {
    return `vehicles around price of $${formatNumberForQuery(rawValue)}`;
  }
  if (facetKey === "monthlyRate") {
    return `vehicles around monthly rate of $${formatNumberForQuery(rawValue)}`;
  }
  if (facetKey === "color") {
    return `show me ${formattedValue.toLowerCase()} cars`;
  }
  if (facetKey === "fuelType") {
    return `show me ${formattedValue.toLowerCase()} cars`;
  }
  if (facetKey === "bodyType") {
    return `show me ${toQueryLabel(facetKey, rawValue)}`;
  }
  if (facetKey === "brand") {
    return `list me all ${formattedValue}`;
  }
  if (facetKey === "seats") {
    return `show me ${formattedValue}-seater vehicles`;
  }
  return `show me vehicles with ${facetDisplayName(facetKey)} ${formattedValue}`;
}

function addCompleteQuery(
  queryMap: Map<string, CompleteQuery>,
  query: string,
  facetKey: string,
  filterValue: unknown,
  shouldFilter: ShouldFilter
): void {
  if (queryMap.has(query)) {
    return;
  }
  queryMap.set(query, {
    value: query,
    facet: facetKey,
    filterValue: String(filterValue),
    shouldRecommend: true,
    shouldFilter,
  });
  console.log("===============================");
  console.log(`[complete-generator] filter: ${facetKey} : ${filterValue}`);
  console.log(`[complete-generator] query: ${query}`);
  console.log("===============================");
  console.log("\n");
}

function getOpenAiClient(): AzureOpenAI | null {
  const apiKey = process.env.NEXUS_API_KEY;
  const endpoint = process.env.NEXUS_API_ENDPOINT;
  const apiVersion = process.env.NEXUS_API_VERSION || "2024-08-01-preview";
  if (!apiKey || !endpoint) {
    return null;
  }
  return new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
  });
}

function loadCompletePromptConfig(): PromptConfig {
  try {
    const promptData: Record<string, PromptConfig> = JSON.parse(fs.readFileSync(aiPromptsPath, "utf8"));
    return promptData?.byFilterFacetsComplete || {};
  } catch {
    return {};
  }
}

function buildCompleteFilterText(facetKey: string, formattedValue: string, rawValue: unknown): string {
  if (facetKey === "price") {
    return `filter category 'price' with value of '${formatNumberForQuery(rawValue)}'`;
  }
  return `filter category '${facetDisplayName(facetKey)}' with value of '${formattedValue}'`;
}

function buildMotorizationModelMap(data: ApiResponse): Map<string, Array<string | number>> {
  const results = data?.data?.search?.results || [];
  const motorizationToModelMap = new Map<string, Set<string | number>>();

  for (const result of results) {
    const motorization = result.vehicleModel?.motorization;
    const modelIdentifier = result.vehicleModel?.vehicleClass?.value;

    if (!motorization || modelIdentifier === undefined || modelIdentifier === null) {
      continue;
    }

    const existing = motorizationToModelMap.get(motorization) || new Set<string | number>();
    existing.add(modelIdentifier);
    motorizationToModelMap.set(motorization, existing);
  }

  return new Map(
    Array.from(motorizationToModelMap.entries()).map(([motorization, modelIdentifiers]) => [
      motorization,
      Array.from(modelIdentifiers),
    ])
  );
}

function buildCompleteShouldFilter(
  facetKey: string,
  rawValue: string | number,
  motorizationModelMap: Map<string, Array<string | number>>
): ShouldFilter {
  if (facetKey === "motorization") {
    const modelIdentifiers = motorizationModelMap.get(String(rawValue)) || [];
    return {
      include: [
        {
          modelIdentifier: modelIdentifiers,
          motorization: [rawValue],
        },
      ],
      exclude: [],
      strict: true,
    };
  }

  return { include: [{ [facetKey]: [rawValue] }], exclude: [], strict: true };
}

function createCompleteValueHints(facetKey: string, valueLabel: string): string[] {
  const facetName = facetDisplayName(facetKey);
  return [
    `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and answers the requested ${facetName} filter intent.`,
    `Respond with "PASS" if the response clearly acknowledges or applies the requested ${facetName} value: ${valueLabel}.`,
    `If the response ignores or contradicts the requested ${facetName} value (${valueLabel}), respond with "FAIL: missing or incorrect ${facetName} value (${valueLabel})".`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "FAIL: off-topic or unsafe response".`,
  ];
}

function toCompleteHintValueLabel(facetKey: string, formattedValue: string, rawValue: unknown): string {
  if (["bodyType", "fuelType", "color"].includes(facetKey)) {
    return toHintLabel(facetKey, rawValue);
  }
  return String(formattedValue || rawValue);
}

function createCompleteRangeHints(facetKey: string, numericValue: unknown): string[] {
  const facetName = facetDisplayName(facetKey);
  const rounded = Math.round(Number(numericValue));
  return [
    `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and answers the requested ${facetName} range intent.`,
    `Respond with "PASS" if the response references vehicles around ${facetName} ${rounded} (exact number not required).`,
    `If the response ignores the requested ${facetName} target (${rounded}) or provides clearly unrelated values, respond with "FAIL: missing or incorrect ${facetName} target (${rounded})".`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "FAIL: off-topic or unsafe response".`,
  ];
}

async function buildComplete(data: ApiResponse): Promise<GeneratedSuite> {
  const facets = data?.data?.search?.facets || {};
  const queryMap = new Map<string, CompleteQuery>();
  const informativeHintsByQuery: Record<string, string[]> = {};
  const promptConfig = loadCompletePromptConfig();
  const aiContext = promptEngine.createPromptContext();
  const motorizationModelMap = buildMotorizationModelMap(data);

  for (const facetKey of Object.keys(facets)) {
    const listEntries = getFacetListEntries(facets, facetKey);
    for (const entry of listEntries) {
      const query = await promptEngine.generateQueryWithVariation(
        getOpenAiClient(),
        facetKey,
        entry.formattedValue,
        entry.rawValue,
        promptConfig.systemPrompt,
        promptConfig.userPromptTemplate,
        facetDisplayName,
        aiContext,
        {
          language: process.env.LANGUAGE || "en",
          fallbackFn: fallbackCompleteQuery,
          filterTextFn: buildCompleteFilterText,
          maxTokens: promptConfig.maxTokens,
        }
      );
      addCompleteQuery(
        queryMap,
        query,
        facetKey,
        entry.formattedValue || entry.rawValue,
        buildCompleteShouldFilter(facetKey, entry.rawValue, motorizationModelMap)
      );
      informativeHintsByQuery[query] = createCompleteValueHints(
        facetKey,
        toCompleteHintValueLabel(facetKey, entry.formattedValue, entry.rawValue)
      );
    }

    const range = getFacetRange(facets, facetKey);
    if (range) {
      const points = [range.min, Math.round((range.min + range.max) / 2), range.max];
      const uniquePoints = [...new Set(points)];
      for (const value of uniquePoints) {
        const query = await promptEngine.generateQueryWithVariation(
          getOpenAiClient(),
          facetKey,
          String(value),
          value,
          promptConfig.systemPrompt,
          promptConfig.userPromptTemplate,
          facetDisplayName,
          aiContext,
          {
            language: process.env.LANGUAGE || "en",
            fallbackFn: fallbackCompleteQuery,
            filterTextFn: buildCompleteFilterText,
            maxTokens: promptConfig.maxTokens,
          }
        );
        addCompleteQuery(
          queryMap,
          query,
          facetKey,
          value,
          { include: [{ [facetKey]: [value] }], exclude: [], strict: true }
        );
        informativeHintsByQuery[query] = createCompleteRangeHints(facetKey, value);
      }
    }
  }

  const queries = Array.from(queryMap.values());

  return {
    generatedAt: new Date().toISOString(),
    sourcePath: path.relative(rootDir, sourcePath),
    queryCount: queries.length,
    regressionQueries: queries,
    informativeHintsByQuery,
  };
}

function toQueryLabel(facetKey: string, value: unknown): string {
  if (facetKey === "bodyType") {
    const map: Record<string, string> = {
      LIMOUSINE: "sedans",
      SUV_OFFROADER: "SUVs",
      HATCHBACK: "hatchbacks",
      COUPE: "coupes",
      CABRIO_ROADSTER: "cabriolets",
      PEOPLE_CARRIER: "people carriers",
    };
    return map[String(value)] || `${titleCaseFromToken(value)} vehicles`.toLowerCase();
  }

  if (facetKey === "fuelType") {
    const map: Record<string, string> = {
      DIESEL: "diesel cars",
      ELECTRIC: "electric cars",
      PETROL: "petrol cars",
      PETROL_ELECTRIC_PLUGIN_HYBRID: "plug-in hybrid cars",
    };
    return map[String(value)] || `${titleCaseFromToken(value)} cars`.toLowerCase();
  }

  if (facetKey === "color") {
    const token = String(value).replace(/^PAINT_COLOR_/, "");
    return `${token.toLowerCase()} cars`;
  }

  if (facetKey === "stockType") {
    const map: Record<string, string> = {
      AVAILABLE: "available vehicles",
      IN_PIPELINE: "in-pipeline vehicles",
    };
    return map[String(value)] || `${titleCaseFromToken(value)} vehicles`.toLowerCase();
  }

  if (facetKey === "brand") {
    return String(value);
  }

  if (facetKey === "seats") {
    return `${value}-seater vehicles`;
  }

  return titleCaseFromToken(value);
}

function toHintLabel(facetKey: string, value: unknown): string {
  if (facetKey === "color") {
    const token = String(value).replace(/^PAINT_COLOR_/, "");
    return token.toLowerCase();
  }
  if (facetKey === "fuelType") {
    const map: Record<string, string> = {
      DIESEL: "diesel cars",
      ELECTRIC: "electric cars",
      PETROL: "petrol cars",
      PETROL_ELECTRIC_PLUGIN_HYBRID: "plug-in hybrid cars",
    };
    return map[String(value)] || String(value).toLowerCase().replace(/_/g, " ");
  }
  if (facetKey === "bodyType") {
    const map: Record<string, string> = {
      LIMOUSINE: "sedans",
      SUV_OFFROADER: "SUVs",
      HATCHBACK: "hatchbacks",
      COUPE: "coupes",
      CABRIO_ROADSTER: "cabriolets",
      PEOPLE_CARRIER: "people carriers",
    };
    return map[String(value)] || String(value).toLowerCase().replace(/_/g, " ");
  }
  return String(value);
}

function facetDisplayName(facetKey: string): string {
  const names: Record<string, string> = {
    bodyType: "body type",
    fuelType: "fuel type",
    color: "color",
    stockType: "stock type",
    brand: "brand",
    seats: "seat count",
    modelIdentifier: "model",
    motorization: "variant",
  };
  return names[facetKey] || facetKey;
}

function createExclusionHints(
  facetKey: string,
  excludedValue: unknown,
  allowedValues: Array<string | number>
): string[] {
  const facetName = facetDisplayName(facetKey);
  const excludedText = toHintLabel(facetKey, excludedValue);
  const allowedText = allowedValues.map((v) => toHintLabel(facetKey, v)).join(", ");
  return [
    `Respond with \"PASS\" if the response stays in Mercedes-Benz automotive context and recommends vehicles for this exclusion intent.`,
    `Respond with \"PASS\" when the requested ${facetName} exclusion is respected: exclude ${excludedText}.`,
    `Respond with \"PASS\" when any mentioned ${facetName} values align with the allowed inventory set: ${allowedText}.`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "FAIL: off-topic or unsafe response".`,
    `If the response includes the excluded ${facetName} value (${excludedText}) as part of recommendations, respond with "FAIL: included excluded ${facetName} (${excludedText})".`,
  ];
}

function createInclusionHints(facetKey: string, a: unknown, b: unknown): string[] {
  const facetName = facetDisplayName(facetKey);
  const aText = toHintLabel(facetKey, a);
  const bText = toHintLabel(facetKey, b);
  return [
    `Respond with \"PASS\" if the response stays in Mercedes-Benz automotive context and gives recommendations for this multi-value intent.`,
    `Respond with \"PASS\" if the response addresses both requested ${facetName} values: ${aText} and ${bText}.`,
    `Respond with \"PASS\" if the response is concise but still explicitly references both requested ${facetName} values, optionally with result counts.`,
    `If one of the requested ${facetName} values is ignored, respond with "FAIL: missing ${facetName} value" and specify which value (${aText} or ${bText}) was not addressed.`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "FAIL: off-topic or unsafe response".`,
  ];
}

function pairwise<T>(values: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      out.push([values[i], values[j]]);
    }
  }
  return out;
}

function buildMatrix(data: ApiResponse): GeneratedSuite {
  const facets = data?.data?.search?.facets || {};

  const regressionQueries: RegressionQuery[] = [];
  const informativeHintsByQuery: Record<string, string[]> = {};

  for (const facetKey of FACET_ORDER) {
    const values = getFacetValues(facets, facetKey);
    if (values.length === 0) {
      continue;
    }

    for (const excludedValue of values) {
      const allowedValues = values.filter((value) => value !== excludedValue);
      if (allowedValues.length === 0) {
        continue;
      }
      const query = `all vehicles except ${toQueryLabel(facetKey, excludedValue)}`;
      regressionQueries.push({
        value: query,
        shouldRecommend: true,
        shouldFilter: { include: [{ [facetKey]: allowedValues }], exclude: [], strict: false },
      });
      informativeHintsByQuery[query] = createExclusionHints(facetKey, excludedValue, allowedValues);
    }

    for (const [a, b] of pairwise(values)) {
      const left = toQueryLabel(facetKey, a);
      const right = toQueryLabel(facetKey, b);
      const andQuery = `show me only ${left} and ${right}`;
      const orQuery = `show me only ${left} or ${right}`;

      regressionQueries.push(
        {
          value: andQuery,
          shouldRecommend: true,
          shouldFilter: { include: [{ [facetKey]: [a, b] }], exclude: [], strict: false },
        },
        {
          value: orQuery,
          shouldRecommend: true,
          shouldFilter: { include: [{ [facetKey]: [a, b] }], exclude: [], strict: false },
        }
      );
      informativeHintsByQuery[andQuery] = createInclusionHints(facetKey, a, b);
      informativeHintsByQuery[orQuery] = createInclusionHints(facetKey, a, b);
    }
  }

  const dedupedMap = new Map<string, RegressionQuery>();
  for (const query of regressionQueries) {
    if (!dedupedMap.has(query.value)) {
      dedupedMap.set(query.value, query);
    }
  }
  const dedupedQueries = Array.from(dedupedMap.values());

  return {
    generatedAt: new Date().toISOString(),
    sourcePath: path.relative(rootDir, sourcePath),
    queryCount: dedupedQueries.length,
    regressionQueries: dedupedQueries,
    informativeHintsByQuery,
  };
}

// Export functions for programmatic use
export {
  readJson,
  buildMatrix,
  buildComplete,
  facetDisplayName,
  titleCaseFromToken,
  toQueryLabel,
  toHintLabel,
  getFacetValues,
  getFacetListEntries,
  getFacetRange,
};
