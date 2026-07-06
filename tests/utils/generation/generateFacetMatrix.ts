import dotenv from "dotenv";
import fs from "fs";
import { AzureOpenAI } from "openai";
import path from "path";
import { getOpenAIClient } from "../core/openaiClient";
import * as promptEngine from "../query/promptEngineHelper";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const rootDir = process.cwd();
const sourcePath = path.resolve(
  rootDir,
  process.env.MATRIX_SOURCE || "tests/data/emh-api-response.json",
);
const aiPromptsPath = path.resolve(rootDir, "tests/data/ai-query-prompts.json");
const aiEvaluationRulesPath = path.resolve(
  rootDir,
  "tests/data/ai-evaluation-rules.json",
);

const FACET_ORDER = [
  "bodyType",
  "fuelType",
  "color",
  "brand",
  "price",
];

// Facets to exclude from query generation
const EXCLUDE_FACETS = [
  "dealerId",
  "driveType",
  "generation",
  "registrationType",
  "dealerFittedOptions",
  "chargeTimeDCHigh",
  "energyContent",
  "wltpRangeTotalAllIndividual",
];

// Facets to include in query generation (allowlist — empty means all)
export const INCLUDE_FACETS = [
  "bodyType",
  "brand",
  "campaigns",
  "color",
  "colorPolish",
  "contextType",
  "enginePowerHP",
  "enginePowerKW",
  "equipment",
  "firstRegistrationDate",
  "fuelType",
  "lines",
  "mileage",
  "modelDesignation",
  "modelIdentifier",
  "modelYear",
  "motorization",
  "packages",
  "price",
  "stockType",
  "seats",
  "upholstery",
  "upholsteryPolish",
];

export function isIncludedFacet(facetKey: string): boolean {
  return INCLUDE_FACETS.length === 0 || INCLUDE_FACETS.includes(facetKey);
}

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

const ENGINE_POWER_KW_PER_HP = 1.343;

interface RangeQueryCase {
  formattedValue: string;
  rawValue: number;
  filterValue: string;
  expectedValue: number;
  shouldFilterValue: { min?: number; max?: number } | true;
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
  skipOpenAiEvaluation?: boolean;
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

interface FacetMatrixHintRules {
  genericHints?: Record<string, string[]>;
  rangeHints?: Record<string, string[]>;
  bodyTypeHints?: Record<string, string[]>;
}

let facetMatrixHintRulesCache: FacetMatrixHintRules | null = null;

// Utility functions
function readJson(filePath: string): ApiResponse {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadFacetMatrixHintRules(): FacetMatrixHintRules {
  if (facetMatrixHintRulesCache) {
    return facetMatrixHintRulesCache;
  }

  let rules: FacetMatrixHintRules;
  try {
    const evaluationRules = JSON.parse(
      fs.readFileSync(aiEvaluationRulesPath, "utf8"),
    );
    rules = evaluationRules?.facetMatrix || {};
  } catch {
    rules = {};
  }
  facetMatrixHintRulesCache = rules;
  return facetMatrixHintRulesCache;
}

function renderHintTemplates(
  templates: string[] | undefined,
  values: Record<string, unknown>,
): string[] {
  if (!Array.isArray(templates)) {
    return [];
  }
  return templates.map((template) =>
    template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
      const value = values[key];
      return value === undefined || value === null ? match : String(value);
    }),
  );
}

function titleCaseFromToken(value: unknown): string {
  return String(value)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getFacetValues(
  facets: Facets,
  facetKey: string,
): Array<string | number> {
  const values = facets?.[facetKey]?.values;
  if (!Array.isArray(values)) {
    return [];
  }
  const extracted = values
    .map((entry) => entry?.value)
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).toUpperCase() !== "UNDEFINED",
    );
  return [...new Set(extracted)];
}

function isOpaqueValue(value: unknown): boolean {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{7,}$/i.test(normalized);
}

function getMappedFormattedValue(
  facetKey: string,
  rawValue: unknown,
): string | null {
  if (facetKey === "bodyType") {
    const map: Record<string, string> = {
      SUV_OFFROADER: "SUV",
      CABRIO_ROADSTER: "Cabriolet",
    };
    return map[String(rawValue)] || null;
  }
  if (facetKey === "stockType") {
    const map: Record<string, string> = {
      AVAILABLE: "Available",
      IN_PIPELINE: "In Pipeline",
    };
    return map[String(rawValue)] || null;
  }
  return null;
}

function getFacetListEntries(
  facets: Facets,
  facetKey: string,
): FacetListEntry[] {
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

    const formattedValue =
      entry?.formattedValue ||
      getMappedFormattedValue(facetKey, rawValue) ||
      String(rawValue);
    if (
      !entry?.formattedValue &&
      !getMappedFormattedValue(facetKey, rawValue) &&
      isOpaqueValue(rawValue)
    ) {
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
  // For engine power, keep scenario unit but prefer EMH HP source for KW scenarios.
  if (facetKey === "enginePowerKW") {
    const convertedFromHp = getConvertedEnginePowerRangeFromCounterpart(
      facets,
      "enginePowerKW",
    );
    if (convertedFromHp) {
      return convertedFromHp;
    }
  }

  const values = facets?.[facetKey]?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    const convertedFallbackRange = getConvertedEnginePowerRangeFromCounterpart(
      facets,
      facetKey,
    );
    return convertedFallbackRange;
  }
  const min = Number((values as Record<string, unknown>).min);
  const max = Number((values as Record<string, unknown>).max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const convertedFallbackRange = getConvertedEnginePowerRangeFromCounterpart(
      facets,
      facetKey,
    );
    return convertedFallbackRange;
  }
  return { min, max };
}

function getDirectFacetRange(facets: Facets, facetKey: string): FacetRange | null {
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

function resolveEffectiveFacetKeyForShouldFilter(
  facets: Facets,
  facetKey: string,
): string {
  if (facetKey !== "enginePowerHP" && facetKey !== "enginePowerKW") {
    return facetKey;
  }

  // Prefer backend/base facet key from EMH response.
  if (getDirectFacetRange(facets, "enginePowerHP")) {
    return "enginePowerHP";
  }
  if (getDirectFacetRange(facets, "enginePowerKW")) {
    return "enginePowerKW";
  }

  return facetKey;
}

function convertEnginePowerValue(
  sourceFacetKey: string,
  targetFacetKey: string,
  value: number,
): number {
  if (sourceFacetKey === targetFacetKey) {
    return Math.round(value);
  }
  if (sourceFacetKey === "enginePowerKW" && targetFacetKey === "enginePowerHP") {
    return Math.round(value * ENGINE_POWER_KW_PER_HP);
  }
  if (sourceFacetKey === "enginePowerHP" && targetFacetKey === "enginePowerKW") {
    return Math.round(value / ENGINE_POWER_KW_PER_HP);
  }
  return Math.round(value);
}

function getConvertedEnginePowerRangeFromCounterpart(
  facets: Facets,
  targetFacetKey: string,
): FacetRange | null {
  if (targetFacetKey !== "enginePowerHP" && targetFacetKey !== "enginePowerKW") {
    return null;
  }

  const sourceFacetKey =
    targetFacetKey === "enginePowerHP" ? "enginePowerKW" : "enginePowerHP";
  const sourceValues = facets?.[sourceFacetKey]?.values;
  if (!sourceValues || typeof sourceValues !== "object" || Array.isArray(sourceValues)) {
    return null;
  }

  const sourceMin = Number((sourceValues as Record<string, unknown>).min);
  const sourceMax = Number((sourceValues as Record<string, unknown>).max);
  if (!Number.isFinite(sourceMin) || !Number.isFinite(sourceMax) || sourceMin === sourceMax) {
    return null;
  }

  const convertedMin = convertEnginePowerValue(
    sourceFacetKey,
    targetFacetKey,
    sourceMin,
  );
  const convertedMax = convertEnginePowerValue(
    sourceFacetKey,
    targetFacetKey,
    sourceMax,
  );

  const min = Math.min(convertedMin, convertedMax);
  const max = Math.max(convertedMin, convertedMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }

  return { min, max };
}

function formatLocalizedInteger(value: unknown, locale: string): string {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    numericValue,
  );
}

function getCountryCode(): string {
  return (process.env.COUNTRY || "AU").toUpperCase();
}

function getLanguageCode(): string {
  const language = (process.env.LANGUAGE || "EN")
    .toLowerCase()
    .split(/[-_]/)[0];
  const country = getCountryCode().toLowerCase();
  if (language === "kr" || country === "kr") return "ko";
  if (language === "jp" || country === "jp") return "ja";
  return language;
}

function formatLocalizedPriceValue(value: unknown): string {
  switch (getCountryCode()) {
    case "TR":
      return `₺${formatLocalizedInteger(value, "tr-TR")}`;
    case "AU":
      return `A$ ${formatLocalizedInteger(value, "en-AU")}`;
    case "IN":
      return `₹ ${formatLocalizedInteger(value, "en-IN")}`;
    case "SG":
      return `${formatLocalizedInteger(value, "en-SG")} SGD`;
    case "KR":
      return `${formatLocalizedInteger(value, "ko-KR")} 원`;
    case "TH":
      return `THB ${formatLocalizedInteger(value, "en-TH")}`;
    default:
      return formatLocalizedInteger(value, "en-US");
  }
}

function formatFacetValueForQuery(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
): string {
  if (facetKey === "price" || facetKey === "monthlyRate") {
    return formatLocalizedPriceValue(rawValue);
  }
  if (facetKey === "bodyType") {
    return toQueryLabel(facetKey, rawValue);
  }
  return String(formattedValue || rawValue);
}

function getCompleteDisplayValue(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
): string {
  if (facetKey === "bodyType") {
    return toQueryLabel(facetKey, rawValue);
  }
  return String(formattedValue || rawValue);
}

type RangePhraseKey = "lessThan" | "under" | "moreThan" | "above";

const RANGE_PHRASE_TEMPLATES: Record<string, Record<RangePhraseKey, string>> = {
  en: {
    lessThan: "less than {value}",
    under: "under {value}",
    moreThan: "more than {value}",
    above: "above {value}",
  },
  tr: {
    lessThan: "{value} değerinden az",
    under: "{value} altı",
    moreThan: "{value} değerinden fazla",
    above: "{value} üstü",
  },
  th: {
    lessThan: "ต่ำกว่า {value}",
    under: "ไม่เกิน {value}",
    moreThan: "มากกว่า {value}",
    above: "เกิน {value}",
  },
  ko: {
    lessThan: "{value} 미만",
    under: "{value} 이하",
    moreThan: "{value} 초과",
    above: "{value} 이상",
  },
  ja: {
    lessThan: "{value}未満",
    under: "{value}以下",
    moreThan: "{value}超",
    above: "{value}以上",
  },
};

const LOCALIZED_FACET_NAMES_FOR_QUERY: Record<
  string,
  Record<string, string>
> = {
  tr: {
    bodyType: "gövde tipi",
    fuelType: "yakıt tipi",
    color: "renk",
    stockType: "stok tipi",
    brand: "marka",
    price: "fiyat",
    monthlyRate: "aylık taksit",
    seats: "koltuk sayısı",
    modelIdentifier: "model",
    motorization: "varyant",
    mileage: "kilometre",
    enginePowerHP: "motor gücü (HP)",
    enginePowerKW: "motor gücü (kW)",
    modelYear: "model yılı",
    firstRegistrationDate: "ilk tescil tarihi",
    equipment: "donanım",
    packages: "donanım paketi",
    lines: "tasarım konsepti",
    colorPolish: "boya tipi",
    upholstery: "döşeme",
    upholsteryPolish: "döşeme kaplaması",
  },
  th: {
    bodyType: "ประเภทรถ",
    fuelType: "ประเภทเชื้อเพลิง",
    color: "สี",
    stockType: "ประเภทสต็อก",
    brand: "แบรนด์",
    price: "ราคา",
    monthlyRate: "ค่างวดรายเดือน",
    seats: "จำนวนที่นั่ง",
    modelIdentifier: "รุ่น",
    motorization: "รุ่นย่อย",
    mileage: "ระยะทาง",
    enginePowerHP: "แรงม้า",
    enginePowerKW: "กำลังเครื่องยนต์ (kW)",
    modelYear: "ปีรุ่น",
    firstRegistrationDate: "วันที่จดทะเบียนครั้งแรก",
    equipment: "อุปกรณ์",
    packages: "แพ็กเกจ",
    lines: "ไลน์",
    colorPolish: "ประเภทสี",
    upholstery: "สีภายใน",
    upholsteryPolish: "วัสดุตกแต่งภายใน",
  },
  ko: {
    bodyType: "바디 타입",
    fuelType: "연료 타입",
    color: "색상",
    stockType: "재고 유형",
    brand: "브랜드",
    price: "가격",
    monthlyRate: "월 납입금",
    seats: "좌석 수",
    modelIdentifier: "모델",
    motorization: "세부 모델",
    mileage: "주행거리",
    enginePowerHP: "엔진 출력(마력)",
    enginePowerKW: "엔진 출력(킬로와트)",
    modelYear: "연식",
    firstRegistrationDate: "최초 등록일",
    equipment: "옵션사양",
    packages: "패키지",
    lines: "라인",
    colorPolish: "도장 마감",
    upholstery: "내장 색상",
    upholsteryPolish: "내장 마감",
  },
  ja: {
    bodyType: "ボディタイプ",
    fuelType: "燃料タイプ",
    color: "色",
    stockType: "在庫タイプ",
    brand: "ブランド",
    price: "価格",
    monthlyRate: "月額支払",
    seats: "座席数",
    modelIdentifier: "モデル",
    motorization: "グレード",
    mileage: "走行距離",
    enginePowerHP: "馬力",
    enginePowerKW: "エンジン出力（kW）",
    modelYear: "年式",
    firstRegistrationDate: "初度登録日",
    equipment: "装備",
    packages: "パッケージ",
    lines: "ライン",
    colorPolish: "塗装仕上げ",
    upholstery: "内装色",
    upholsteryPolish: "内装仕上げ",
  },
};

function getRangePhraseTemplates(): Record<RangePhraseKey, string> {
  return RANGE_PHRASE_TEMPLATES[getLanguageCode()] || RANGE_PHRASE_TEMPLATES.en;
}

function formatRangePhrase(template: string, value: string): string {
  return template.replace(/\{value\}/g, value);
}

function facetDisplayNameForQuery(facetKey: string): string {
  const language = getLanguageCode();
  return (
    LOCALIZED_FACET_NAMES_FOR_QUERY[language]?.[facetKey] ||
    facetDisplayName(facetKey)
  );
}

function shouldUseLocalizedFallback(): boolean {
  return getLanguageCode() !== "en";
}

function fallbackLocalizedCompleteQuery(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
): string {
  const displayValue = formatFacetValueForQuery(
    facetKey,
    formattedValue,
    rawValue,
  );
  const valueLabel =
    facetKey === "price" || facetKey === "monthlyRate"
      ? displayValue
      : String(formattedValue || rawValue);
  return `${valueLabel} ${facetDisplayNameForQuery(facetKey)}`.trim();
}

function isRangeQueryValue(value: unknown): boolean {
  const text = String(value).trim();
  const localizedRangePhrases = Object.values(RANGE_PHRASE_TEMPLATES)
    .flatMap((templates) => Object.values(templates))
    .map((template) => template.replace(/\{value\}/g, "").trim())
    .filter(Boolean);
  return (
    /^(less than|more than|under|above|between)\b/i.test(text) ||
    localizedRangePhrases.some((phrase) => text.includes(phrase))
  );
}

function fallbackCompleteQuery(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
): string {
  const displayValue = formatFacetValueForQuery(
    facetKey,
    formattedValue,
    rawValue,
  );
  if (isRangeQueryValue(formattedValue)) {
    return `${formattedValue} ${facetDisplayNameForQuery(facetKey)}`;
  }
  if (shouldUseLocalizedFallback()) {
    return fallbackLocalizedCompleteQuery(facetKey, formattedValue, rawValue);
  }
  if (facetKey === "modelIdentifier") {
    return `list me all ${formattedValue}`;
  }
  if (facetKey === "upholstery") {
    return `i'm interested in ${formattedValue} interior`;
  }
  if (facetKey === "price") {
    return `vehicles around price of ${displayValue}`;
  }
  if (facetKey === "monthlyRate") {
    return `vehicles around monthly rate of ${displayValue}`;
  }
  if (facetKey === "color") {
    return `show me ${formattedValue.toLowerCase()} cars`;
  }
  if (facetKey === "fuelType") {
    return `show me ${toQueryLabel(facetKey, rawValue)}`;
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
  shouldFilter: ShouldFilter,
): void {
  const isNumericFilterValue =
    typeof filterValue === "number" ||
    (typeof filterValue === "string" && Number.isFinite(Number(filterValue)));
  const displayFilterValue =
    (facetKey === "price" || facetKey === "monthlyRate") &&
    !isNumericFilterValue
      ? String(filterValue)
      : formatFacetValueForQuery(facetKey, String(filterValue), filterValue);
  if (queryMap.has(query)) {
    return;
  }
  queryMap.set(query, {
    value: query,
    facet: facetKey,
    filterValue: displayFilterValue,
    shouldRecommend: true,
    shouldFilter,
  });
  console.log("===============================");
  console.log(
    `[complete-generator] filter: ${facetKey} : ${displayFilterValue}`,
  );
  console.log(`[complete-generator] query: ${query}`);
  console.log("===============================");
  console.log("\n");
}



function loadCompletePromptConfig(): PromptConfig {
  try {
    const promptData = JSON.parse(fs.readFileSync(aiPromptsPath, "utf8"));
    return promptData?.["Sanity Test"]?.["By Filter Facets (complete)"] || {};
  } catch {
    return {};
  }
}

function buildCompleteFilterText(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
): string {
  if (facetKey === "price" || facetKey === "monthlyRate") {
    return `'category'='${facetDisplayNameForQuery(facetKey)}' 'value'='${formattedValue || formatLocalizedPriceValue(rawValue)}'`;
  }
  if (facetKey === "fuelType") {
    const label = toQueryLabel(facetKey, rawValue).replace(/ cars$/, "");
    return `'category'='${facetDisplayNameForQuery(facetKey)}' 'value'='${label}'`;
  }
  return `'category'='${facetDisplayNameForQuery(facetKey)}' 'value'='${formattedValue}'`;
}

function buildMotorizationModelMap(
  data: ApiResponse,
): Map<string, Array<string | number>> {
  const results = data?.data?.search?.results || [];
  const motorizationToModelMap = new Map<string, Set<string | number>>();

  for (const result of results) {
    const motorization = result.vehicleModel?.motorization;
    const modelIdentifier = result.vehicleModel?.vehicleClass?.value;

    if (
      !motorization ||
      modelIdentifier === undefined ||
      modelIdentifier === null
    ) {
      continue;
    }

    const existing =
      motorizationToModelMap.get(motorization) || new Set<string | number>();
    existing.add(modelIdentifier);
    motorizationToModelMap.set(motorization, existing);
  }

  return new Map(
    Array.from(motorizationToModelMap.entries()).map(
      ([motorization, modelIdentifiers]) => [
        motorization,
        Array.from(modelIdentifiers),
      ],
    ),
  );
}

function buildCompleteShouldFilter(
  facetKey: string,
  rawValue: string | number,
  motorizationModelMap: Map<string, Array<string | number>>,
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
      strict: false,
    };
  }

  return { include: [{ [facetKey]: [rawValue] }], exclude: [], strict: false };
}

function buildAcceptedFacetValueLabels(
  facetKey: string,
  valueLabel: string,
  formattedValue: string,
  rawValue: unknown,
): string[] {
  const labels = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value || "").trim();
    if (text) labels.add(text);
  };

  add(valueLabel);
  add(formattedValue);

  if (facetKey === "bodyType") {
    const bodyTypeAliases: Record<string, string[]> = {
      LIMOUSINE: ["sedan", "sedans", "limousine"],
      SUV_OFFROADER: ["suv", "suvs", "sport utility vehicle"],
      HATCHBACK: ["hatchback", "hatchbacks"],
      COUPE: ["coupe", "coupes"],
      CABRIO_ROADSTER: ["cabriolet", "cabriolets", "roadster", "roadsters"],
      PEOPLE_CARRIER: ["people carrier", "people carriers", "mpv", "mpvs"],
      STATION: ["estate", "estates", "station wagon", "station wagons"],
    };

    for (const alias of bodyTypeAliases[String(rawValue)] || []) {
      add(alias);
    }
  }

  if (facetKey === "fuelType") {
    const fuelTypeAliases: Record<string, string[]> = {
      DIESEL: ["diesel"],
      ELECTRIC: ["electric", "electric vehicle", "ev"],
      PETROL: ["petrol", "gasoline"],
      DIESEL_ELECTRIC_PLUGIN_HYBRID: [
        "hybrid diesel",
        "diesel hybrid",
        "plug-in hybrid diesel",
        "plugin hybrid diesel",
        "hybrid (diesel + electric)",
        "diesel electric hybrid",
      ],
      PETROL_ELECTRIC_PLUGIN_HYBRID: [
        "hybrid petrol",
        "petrol hybrid",
        "hybrid gasoline",
        "plug-in hybrid",
        "plugin hybrid",
        "hybrid (petrol + electric)",
        "hybrid (gasoline + electric)",
        "petrol electric hybrid",
        "gasoline electric hybrid",
      ],
    };

    for (const alias of fuelTypeAliases[String(rawValue)] || []) {
      add(alias);
    }
  }

  return Array.from(labels);
}

function createCompleteValueHints(
  facetKey: string,
  valueLabel: string,
  formattedValue: string,
  rawValue: unknown,
): string[] {
  const hintRules = loadFacetMatrixHintRules();
  const facetName = facetDisplayName(facetKey);
  const acceptedLabels = buildAcceptedFacetValueLabels(
    facetKey,
    valueLabel,
    formattedValue,
    rawValue,
  );
  const acceptedLabelText = acceptedLabels.join(" / ");

  if (facetKey === "bodyType" && acceptedLabels.length > 1) {
    return renderHintTemplates(hintRules.bodyTypeHints?.completeValue, {
      facetName,
      acceptedLabelText,
      valueLabel,
    });
  }

  return renderHintTemplates(hintRules.genericHints?.completeValue, {
    facetName,
    valueLabel: acceptedLabelText,
  });
}

function toCompleteHintValueLabel(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
): string {
  if (["bodyType", "fuelType", "color"].includes(facetKey)) {
    return toHintLabel(facetKey, rawValue);
  }
  if (facetKey === "price" || facetKey === "monthlyRate") {
    return formatLocalizedPriceValue(rawValue);
  }
  return String(formattedValue || rawValue);
}

function createCompleteRangeHints(
  facetKey: string,
  numericValue: unknown,
  valueLabel?: string,
): string[] {
  const hintRules = loadFacetMatrixHintRules();
  const facetName = facetDisplayName(facetKey);
  const targetValue =
    valueLabel ||
    toCompleteHintValueLabel(facetKey, String(numericValue), numericValue);
  const targetVerb = isRangeQueryValue(targetValue)
    ? `references vehicles with ${facetName} ${targetValue}`
    : `references vehicles around ${facetName} ${targetValue} (exact number not required)`;
  return renderHintTemplates(hintRules.genericHints?.completeRange, {
    facetName,
    targetValue,
    targetVerb,
  });
}

function getRangeValueMatrix(
  facetKey: string,
  range: FacetRange,
): RangeQueryCase[] {
  const midpoint = Math.round((range.min + range.max) / 2);
  const formattedMidpoint = formatFacetValueForQuery(
    facetKey,
    String(midpoint),
    midpoint,
  );
  const rangePhraseTemplates = getRangePhraseTemplates();

  return [
    {
      formattedValue: formattedMidpoint,
      rawValue: midpoint,
      filterValue: formattedMidpoint,
      expectedValue: midpoint,
      shouldFilterValue: true as const,
    },
    {
      formattedValue: formatRangePhrase(
        rangePhraseTemplates.lessThan,
        formattedMidpoint,
      ),
      rawValue: midpoint,
      filterValue: formatRangePhrase(
        rangePhraseTemplates.lessThan,
        formattedMidpoint,
      ),
      expectedValue: midpoint,
      shouldFilterValue: { max: midpoint },
    },
    {
      formattedValue: formatRangePhrase(
        rangePhraseTemplates.under,
        formattedMidpoint,
      ),
      rawValue: midpoint,
      filterValue: formatRangePhrase(
        rangePhraseTemplates.under,
        formattedMidpoint,
      ),
      expectedValue: midpoint,
      shouldFilterValue: { max: midpoint },
    },
    {
      formattedValue: formatRangePhrase(
        rangePhraseTemplates.moreThan,
        formattedMidpoint,
      ),
      rawValue: midpoint + 1,
      filterValue: formatRangePhrase(
        rangePhraseTemplates.moreThan,
        formattedMidpoint,
      ),
      expectedValue: midpoint + 1,
      shouldFilterValue: { min: midpoint },
    },
    {
      formattedValue: formatRangePhrase(
        rangePhraseTemplates.above,
        formattedMidpoint,
      ),
      rawValue: midpoint + 1,
      filterValue: formatRangePhrase(
        rangePhraseTemplates.above,
        formattedMidpoint,
      ),
      expectedValue: midpoint + 1,
      shouldFilterValue: { min: midpoint },
    },
  ];
}

async function buildComplete(
  data: ApiResponse,
  targetFacetKeys?: string[],
): Promise<GeneratedSuite> {
  const facets = data?.data?.search?.facets || {};
  setGlobalFacets(facets);
  const queryMap = new Map<string, CompleteQuery>();
  const informativeHintsByQuery: Record<string, string[]> = {};
  const promptConfig = loadCompletePromptConfig();
  const aiContext = promptEngine.createPromptContext();
  const motorizationModelMap = buildMotorizationModelMap(data);

  const facetKeysToProcess =
    Array.isArray(targetFacetKeys) && targetFacetKeys.length > 0
      ? targetFacetKeys.filter((key) => Object.prototype.hasOwnProperty.call(facets, key))
      : Object.keys(facets);

  for (const facetKey of facetKeysToProcess) {
    // Skip excluded facets
    if (EXCLUDE_FACETS.includes(facetKey)) {
      continue;
    }
    // Skip facets not in the allowlist (when allowlist is non-empty)
    if (!isIncludedFacet(facetKey)) {
      continue;
    }

    const listEntries = getFacetListEntries(facets, facetKey);
    for (const entry of listEntries) {
      const displayValue = getCompleteDisplayValue(
        facetKey,
        entry.formattedValue,
        entry.rawValue,
      );
      const query = await promptEngine.generateQueryWithVariation(
        getOpenAIClient(),
        facetKey,
        displayValue,
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
        },
      );
      addCompleteQuery(
        queryMap,
        query,
        facetKey,
        displayValue,
        buildCompleteShouldFilter(
          facetKey,
          entry.rawValue,
          motorizationModelMap,
        ),
      );
      informativeHintsByQuery[query] = createCompleteValueHints(
        facetKey,
        toCompleteHintValueLabel(
          facetKey,
          entry.formattedValue,
          entry.rawValue,
        ),
        entry.formattedValue,
        entry.rawValue,
      );
    }

    const range = getFacetRange(facets, facetKey);
    if (range) {
      const rangeValueMatrix = getRangeValueMatrix(facetKey, range);
      for (const rangeValue of rangeValueMatrix) {
        const query = await promptEngine.generateQueryWithVariation(
          getOpenAIClient(),
          facetKey,
          rangeValue.formattedValue,
          rangeValue.rawValue,
          promptConfig.systemPrompt,
          promptConfig.userPromptTemplate,
          facetDisplayName,
          aiContext,
          {
            language: process.env.LANGUAGE || "en",
            fallbackFn: fallbackCompleteQuery,
            filterTextFn: buildCompleteFilterText,
            maxTokens: promptConfig.maxTokens,
          },
        );
        const effectiveFacetKey = resolveEffectiveFacetKeyForShouldFilter(
          facets,
          facetKey,
        );

        let effectiveShouldFilterValue: { min?: number; max?: number } | true;
        if (rangeValue.shouldFilterValue === true) {
          effectiveShouldFilterValue = true;
        } else if (effectiveFacetKey === facetKey) {
          effectiveShouldFilterValue = rangeValue.shouldFilterValue;
        } else {
          const raw = rangeValue.shouldFilterValue as { min?: number; max?: number };
          const converted: { min?: number; max?: number } = {};
          if (raw.min !== undefined) {
            converted.min = convertEnginePowerValue(facetKey, effectiveFacetKey, raw.min);
          }
          if (raw.max !== undefined) {
            converted.max = convertEnginePowerValue(facetKey, effectiveFacetKey, raw.max);
          }
          effectiveShouldFilterValue = converted;
        }

        addCompleteQuery(queryMap, query, facetKey, rangeValue.filterValue, {
          include: [{ [effectiveFacetKey]: effectiveShouldFilterValue }],
          exclude: [],
          strict: false,
        });
        informativeHintsByQuery[query] = createCompleteRangeHints(
          facetKey,
          rangeValue.rawValue,
          rangeValue.filterValue,
        );
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

function getFacetFormattedValue(
  facetKey: string,
  rawValue: unknown,
): string | null {
  const facetData = globalFacets?.[facetKey];
  if (facetData && Array.isArray(facetData.values)) {
    for (const entry of facetData.values) {
      if (entry?.value === rawValue && entry?.formattedValue) {
        return String(entry.formattedValue).trim();
      }
    }
  }
  return null;
}

function toQueryLabel(facetKey: string, value: unknown): string {
  if (facetKey === "bodyType") {
    const map: Record<string, string> = {
      LIMOUSINE: "sedans",
      SUV_OFFROADER: "SUVs",
      HATCHBACK: "hatchbacks",
      COUPE: "coupes",
      CABRIO_ROADSTER: "cabriolets",
      PEOPLE_CARRIER: "MPV",
    };

    const canonicalLabel = map[String(value)];
    if (canonicalLabel) {
      return canonicalLabel;
    }
  }

  // First try to get formattedValue from API response facet data
  const apiFormattedValue = getFacetFormattedValue(facetKey, value);
  if (apiFormattedValue) {
    return apiFormattedValue;
  }

  if (facetKey === "bodyType") {
    const map: Record<string, string> = {
      LIMOUSINE: "sedans",
      SUV_OFFROADER: "SUVs",
      HATCHBACK: "hatchbacks",
      COUPE: "coupes",
      CABRIO_ROADSTER: "cabriolets",
      PEOPLE_CARRIER: "MPV",
    };
    return (
      map[String(value)] ||
      `${titleCaseFromToken(value)} vehicles`.toLowerCase()
    );
  }

  if (facetKey === "fuelType") {
    const map: Record<string, string> = {
      DIESEL: "diesel",
      ELECTRIC: "electric",
      PETROL: "petrol",
      DIESEL_ELECTRIC_PLUGIN_HYBRID: "hybrid diesel",
      PETROL_ELECTRIC_PLUGIN_HYBRID: "hybrid petrol",
    };
    return (
      map[String(value)] || `${titleCaseFromToken(value)}`.toLowerCase()
    );
  }

  if (facetKey === "color") {
    const colorMap = buildUUIDMapFromFacets(globalFacets, "color");
    const strValue = String(value).toLowerCase();
    if (colorMap[strValue]) {
      return `${colorMap[strValue]} cars`;
    }
    const token = String(value).replace(/^PAINT_COLOR_/, "");
    return `${token.toLowerCase()} cars`;
  }

  if (facetKey === "stockType") {
    const map: Record<string, string> = {
      AVAILABLE: "in-stock",
      IN_PIPELINE: "future",
    };
    return (
      map[String(value)] ||
      `${titleCaseFromToken(value)} vehicles`.toLowerCase()
    );
  }

  if (facetKey === "brand") {
    return String(value);
  }

  if (facetKey === "seats") {
    return `${value}-seater vehicles`;
  }

  return titleCaseFromToken(value);
}

// Cache for UUID maps built from API response
let uuidMapCache: Record<string, Record<string, string>> = {};

function buildUUIDMapFromFacets(
  facets: Facets,
  facetKey: string,
): Record<string, string> {
  if (uuidMapCache[facetKey]) {
    return uuidMapCache[facetKey];
  }

  const map: Record<string, string> = {};
  const facetData = facets?.[facetKey];

  if (facetData && Array.isArray(facetData.values)) {
    for (const entry of facetData.values) {
      if (entry && entry.value && entry.formattedValue) {
        const strValue = String(entry.value).toLowerCase();
        map[strValue] = String(entry.formattedValue).toLowerCase();
      }
    }
  }

  uuidMapCache[facetKey] = map;
  return map;
}

// Global facets reference for UUID map building
let globalFacets: Facets = {};

function setGlobalFacets(facets: Facets): void {
  globalFacets = facets;
  uuidMapCache = {}; // Clear cache when facets change
}

function toHintLabel(facetKey: string, value: unknown): string {
  // First try to get formattedValue from API response facet data
  const apiFormattedValue = getFacetFormattedValue(facetKey, value);
  if (apiFormattedValue) {
    return apiFormattedValue;
  }

  if (facetKey === "color") {
    const colorMap = buildUUIDMapFromFacets(globalFacets, "color");
    const strValue = String(value).toLowerCase();
    // Check if it's a UUID first (from API response)
    if (colorMap[strValue]) {
      return colorMap[strValue];
    }
    // Otherwise, try the old PAINT_COLOR_ format
    const token = String(value).replace(/^PAINT_COLOR_/, "");
    return token.toLowerCase();
  }
  if (facetKey === "upholstery") {
    const upholsteryMap = buildUUIDMapFromFacets(globalFacets, "upholstery");
    const strValue = String(value).toLowerCase();
    // Check if it's a UUID first (from API response)
    if (upholsteryMap[strValue]) {
      return upholsteryMap[strValue];
    }
    // Otherwise, try the old format
    const token = String(value).replace(/^UPHOLSTERY_/, "");
    return token.toLowerCase();
  }
  if (facetKey === "upholsteryPolish") {
    // Map to upholstery polish/treatment names
    return String(value)
      .toLowerCase()
      .replace(/^UPHOLSTERY_/, "");
  }
  if (facetKey === "fuelType") {
    const map: Record<string, string> = {
      DIESEL: "diesel",
      ELECTRIC: "electric",
      PETROL: "petrol",
      DIESEL_ELECTRIC_PLUGIN_HYBRID: "hybrid diesel",
      PETROL_ELECTRIC_PLUGIN_HYBRID: "hybrid petrol",
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
      PEOPLE_CARRIER: "MPV",
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
    price: "price",
    monthlyRate: "monthly rate",
    seats: "seat count",
    modelIdentifier: "model",
    motorization: "variant",
  };
  return names[facetKey] || facetKey;
}

function createExclusionHints(
  facetKey: string,
  excludedValue: unknown,
  allowedValues: Array<string | number>,
): string[] {
  const hintRules = loadFacetMatrixHintRules();
  const facetName = facetDisplayName(facetKey);
  const excludedText = toHintLabel(facetKey, excludedValue);
  const allowedText = allowedValues
    .map((v) => toHintLabel(facetKey, v))
    .join(", ");
  return renderHintTemplates(hintRules.genericHints?.exclusion, {
    facetName,
    excludedText,
    allowedText,
  });
}

function createInclusionHints(
  facetKey: string,
  a: unknown,
  b: unknown,
): string[] {
  const hintRules = loadFacetMatrixHintRules();
  const facetName = facetDisplayName(facetKey);
  const aText = toHintLabel(facetKey, a);
  const bText = toHintLabel(facetKey, b);
  return renderHintTemplates(hintRules.genericHints?.inclusion, {
    facetName,
    aText,
    bText,
  });
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

interface LocalizedMatrixPhrases {
  showMeOnly: string;
  and: string;
  or: string;
  allVehiclesExcept: string;
}

function getLocalizedMatrixPhrases(): LocalizedMatrixPhrases {
  const language = getLanguageCode();
  const phrases: Record<string, LocalizedMatrixPhrases> = {
    en: {
      showMeOnly: "show me only",
      and: "and",
      or: "or",
      allVehiclesExcept: "all vehicles except",
    },
    tr: {
      showMeOnly: "bana sadece göster",
      and: "ve",
      or: "veya",
      allVehiclesExcept: "hariç tüm araçlar",
    },
    th: {
      showMeOnly: "แสดงให้ฉันดูเฉพาะ",
      and: "และ",
      or: "หรือ",
      allVehiclesExcept: "ยานพาหนะทั้งหมดยกเว้น",
    },
    ko: {
      showMeOnly: "다음만 보여주세요",
      and: "및",
      or: "또는",
      allVehiclesExcept: "를 제외한 모든 차량",
    },
    ja: {
      showMeOnly: "次のみを表示してください",
      and: "と",
      or: "または",
      allVehiclesExcept: "次以外のすべての車両",
    },
  };
  return phrases[language] || phrases.en;
}

function buildExclusionQuery(
  facetKey: string,
  excludedValue: unknown,
  phrases: LocalizedMatrixPhrases,
): string {
  const valueLabel = toQueryLabel(facetKey, excludedValue);
  const language = getLanguageCode();
  
  // Korean uses postfix word order: <value> + suffix
  if (language === "ko") {
    return `${valueLabel} ${phrases.allVehiclesExcept}`;
  }
  
  // Other languages use prefix word order: prefix + <value>
  return `${phrases.allVehiclesExcept} ${valueLabel}`;
}

function buildMatrix(data: ApiResponse): GeneratedSuite {
  const facets = data?.data?.search?.facets || {};
  setGlobalFacets(facets);
  const phrases = getLocalizedMatrixPhrases();

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
      const query = buildExclusionQuery(facetKey, excludedValue, phrases);
      regressionQueries.push({
        value: query,
        skipOpenAiEvaluation: true,
        shouldRecommend: true,
        shouldFilter: {
          include: [{ [facetKey]: allowedValues }],
          exclude: [],
          strict: false,
        },
      });
      informativeHintsByQuery[query] = createExclusionHints(
        facetKey,
        excludedValue,
        allowedValues,
      );
    }

    for (const [a, b] of pairwise(values)) {
      const left = toQueryLabel(facetKey, a);
      const right = toQueryLabel(facetKey, b);
      const andQuery = `${phrases.showMeOnly} ${left} ${phrases.and} ${right}`;
      const orQuery = `${phrases.showMeOnly} ${left} ${phrases.or} ${right}`;

      regressionQueries.push(
        {
          value: andQuery,
          shouldRecommend: true,
          shouldFilter: {
            include: [{ [facetKey]: [a, b] }],
            exclude: [],
            strict: false,
          },
        },
        {
          value: orQuery,
          shouldRecommend: true,
          shouldFilter: {
            include: [{ [facetKey]: [a, b] }],
            exclude: [],
            strict: false,
          },
        },
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
  buildComplete,
  buildMatrix,
  facetDisplayName,
  getFacetListEntries,
  getFacetRange,
  getFacetValues,
  readJson,
  titleCaseFromToken,
  toHintLabel,
  toQueryLabel,
};
