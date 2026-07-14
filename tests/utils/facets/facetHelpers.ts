import fs from "fs/promises";
import path from "path";
import { generateOpenAIQuery } from "../query/aiHelpers";
import { extractMissingFacetValuesFromData } from "./facetValueHelpers";
import { isIncludedFacet } from "../generation/generateFacetMatrix";
import { LANGUAGE } from "../core/testHelpers";

export interface SimplifiedFacet {
  code: string;
  type: "range" | "list";
  min?: number;
  max?: number;
  count?: number;
  values?: Array<{ code: string; name: string; count?: number }>;
  displayName?: string;
}

interface DateNumericFacetQuery {
  value: string;
  facet: string;
  filterText: string;
  filterValue: string;
  shouldRecommend: boolean;
  shouldFilter: {
    include: Array<Record<string, Array<string | number>>>;
    exclude: Array<Record<string, Array<string | number>>>;
    strict: false;
  };
  aiEvaluationHints: {
    value: string[];
    overwrite: true;
  };
}

const AND_OR_MATRIX_FACETS = [
  "bodyType",
  "brand",
  "color",
  "fuelType",
  "price",
];
const AND_OR_MATRIX_ANCHOR_FACETS = ["bodyType", "color"];
const UNAVAILABLE_AVAILABLE_VALUE_LIMIT = 2;
const DATA_DIR = path.join(__dirname, "../../data");

const FACET_LABELS: Record<string, string> = {
  bodyType: "body type",
  brand: "brand",
  color: "color",
  fuelType: "fuel type",
  price: "price",
};

const LOCALIZED_FACET_LABELS: Record<string, Record<string, string>> = {
  th: {
    bodyType: "ประเภทรถ",
    brand: "แบรนด์",
    color: "สี",
    fuelType: "ประเภทเชื้อเพลิง",
    price: "ราคา",
  },
  tr: {
    bodyType: "gövde tipi",
    brand: "marka",
    color: "renk",
    fuelType: "yakıt tipi",
    price: "fiyat",
  },
  ko: {
    bodyType: "바디 타입",
    brand: "브랜드",
    color: "색상",
    fuelType: "연료 타입",
    price: "가격",
  },
  ja: {
    bodyType: "ボディタイプ",
    brand: "ブランド",
    color: "色",
    fuelType: "燃料タイプ",
    price: "価格",
  },
};

interface AndOrFacetMatrixQuery {
  value: string;
  facet: string;
  operator: "AND" | "OR";
  filterText: string;
  filterValue: string;
  shouldFilter:
    | boolean
    | {
        include: Array<Record<string, Array<string | number>>>;
        exclude: Array<Record<string, Array<string | number>>>;
        strict: false;
      };
  aiEvaluationHints: {
    value: string[];
    overwrite: true;
  };
}

interface PunctuatedFacetMatrixQuery {
  value: string;
  facet: string;
  filterText: string;
  filterValue: string;
  shouldFilter: {
    include: Array<Record<string, Array<string | number>>>;
    exclude: Array<Record<string, Array<string | number>>>;
    strict: false;
  };
  aiEvaluationHints: {
    value: string[];
    overwrite: true;
  };
}

/**
 * Converts raw facets from EMH or DCP API responses to a simplified format
 * @param emhApiResponse - EMH GraphQL API response containing facets
 * @param dcpApiResponse - DCP API response containing facets
 * @param project - Project type ('EMH' or 'DCP')
 * @returns Array of simplified facets
 */
export async function fetchAndConvertFacets(
  emhApiResponse: any,
  dcpApiResponse: any,
  project: string,
): Promise<SimplifiedFacet[]> {
  let facets: SimplifiedFacet[] = [];

  // List of facet codes to skip/ignore
  const skipFacetCodes = ["driveType", "stockType", "generation"];

  try {
    let rawFacets = [];

    if (project === "EMH") {
      // EMH GraphQL response structure: data.search.facets
      rawFacets = emhApiResponse.data?.search?.facets || {};

      // Convert EMH GraphQL facets to array format
      rawFacets = Object.entries(rawFacets)
        .filter(([key]) => !skipFacetCodes.includes(key))
        .map(([key, value]: [string, any]) => {
          const facetData: any = { code: key };

          // Check facet type based on the structure
          if (value?.facetType === "RANGE" && value?.values) {
            facetData.facetDisplayType = "SLIDER";
            facetData.min = value.values.min;
            facetData.max = value.values.max;
            facetData.count = value.values.count;
            facetData.displayName = key;
          } else if (value?.values && Array.isArray(value.values)) {
            facetData.facetDisplayType = "LIST";
            facetData.values = value.values.map((v: any) => ({
              code: v.value || v.formattedValue,
              name: v.formattedValue || v.value || v.label,
              count: v.count,
            }));
            facetData.displayName = key;
          }

          return facetData;
        });
    } else {
      // DCP response structure: data.facets
      rawFacets = (dcpApiResponse.data.facets || []).filter(
        (facet: any) => !skipFacetCodes.includes(facet.code),
      );
    }

    console.log(`Successfully fetched ${rawFacets.length} raw facets from API`);

    // Convert raw facets to simplified format (same logic as facetToJson.js)
    function extractSimpleValues(values: any[]) {
      if (!Array.isArray(values)) return [];
      return values
        .map((v: any) => {
          if (v.code && v.name) {
            return { code: v.code, name: v.name, count: v.count };
          }
          if (Array.isArray(v.values)) {
            return v.values
              .map((inner: any) => ({
                code: inner.code,
                name: inner.name,
                count: inner.count,
              }))
              .filter((x: any) => x.code && x.name);
          }
          return null;
        })
        .flat()
        .filter((x: any) => x && x.code && x.name);
    }

    facets = rawFacets
      .map((facet: any) => {
        const { code, min, max, count, values, displayName, facetDisplayType } =
          facet;
        let type;
        if (facetDisplayType === "SLIDER") {
          type = "range";
          const parsedMin = parseFloat(Number(min).toFixed(1));
          const parsedMax = parseFloat(Number(max).toFixed(1));
          // Skip if min or max are invalid or equal
          if (isNaN(parsedMin) || isNaN(parsedMax) || parsedMin === parsedMax) {
            return null;
          }
          return {
            code,
            type,
            min: parsedMin,
            max: parsedMax,
            count,
            displayName,
          };
        } else {
          type = "list";
          return {
            code,
            type,
            values: extractSimpleValues(values),
            displayName,
          };
        }
      })
      .filter((facet: any) => facet !== null);

    console.log(`Converted to ${facets.length} simplified facets`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch facets from API", errorMessage);
  }

  return facets;
}

/**
 * Generates search queries from facets
 * @param facets - Array of simplified facets
 * @param aiPromptData - AI prompt configuration data
 * @returns Array of query objects with query, facet code, filterText, and filterValue
 */
export async function generateQueriesFromFacets(
  facets: SimplifiedFacet[],
  aiPromptData: {
    count: number;
    systemPrompt: string;
    userPromptTemplate: string;
    fallback: string;
  },
): Promise<
  Array<{
    value: string;
    facet: string;
    filterText: string;
    filterValue: string;
  }>
> {
  const queryPromises = facets.map(async (facet: any) => {
    let filterValue, filterText;
    // Special handling for firstRegistrationDateSlider as date type
    if (facet.code === "firstRegistrationDateSlider") {
      let minYear = 2000;
      let maxYear = new Date().getFullYear();
      if (
        typeof facet.min === "number" &&
        facet.min > 1900 &&
        facet.min < 2100
      ) {
        minYear = Math.floor(facet.min);
      }
      if (
        typeof facet.max === "number" &&
        facet.max > 1900 &&
        facet.max < 2100
      ) {
        maxYear = Math.floor(facet.max);
      }
      if (minYear >= maxYear) {
        minYear = 2000;
        maxYear = new Date().getFullYear();
      }
      const useRange = Math.random() > 0.5;
      function randomDateYYYYMM(yearStart: number, yearEnd: number) {
        const year =
          Math.floor(Math.random() * (yearEnd - yearStart + 1)) + yearStart;
        const month = Math.floor(Math.random() * 12) + 1;
        return `${year}/${String(month).padStart(2, "0")}`;
      }
      if (useRange) {
        const date1 = randomDateYYYYMM(minYear, maxYear);
        const date2 = randomDateYYYYMM(minYear, maxYear);
        const d1 = new Date(date1.replace("/", "-"));
        const d2 = new Date(date2.replace("/", "-"));
        const fromDate = d1 < d2 ? date1 : date2;
        const toDate = d1 < d2 ? date2 : date1;
        filterValue = `${fromDate} to ${toDate}`;
      } else {
        filterValue = randomDateYYYYMM(minYear, maxYear);
      }
    } else if (facet.type === "range") {
      const min = Number(facet.min);
      const max = Number(facet.max);
      const useRange = Math.random() > 0.5;
      if (useRange) {
        const value1 = Math.random() * (max - min) + min;
        const value2 = Math.random() * (max - min) + min;
        const rangeMin = Math.round(Math.min(value1, value2));
        const rangeMax = Math.round(Math.max(value1, value2));
        filterValue = `${rangeMin} to ${rangeMax}`;
        let displayName = facet.displayName || facet.code;
        filterText = `${displayName}`;
      } else {
        filterValue = Math.round(Math.random() * (max - min) + min);
        let displayName = facet.displayName || facet.code;
        filterText = `${displayName}`;
      }
    } else if (
      facet.type === "list" &&
      Array.isArray(facet.values) &&
      facet.values.length > 0
    ) {
      const randomValue =
        facet.values[Math.floor(Math.random() * facet.values.length)];
      filterValue = randomValue.name || randomValue.code;
    } else {
      return null;
    }

    filterText = `filter is of category '${
      facet.displayName || facet.code
    }' with value of '${filterValue}'`;
    const query = await generateOpenAIQuery(
      aiPromptData.systemPrompt,
      aiPromptData.userPromptTemplate.replace(/\{filterText\}/g, filterText),
    );

    console.log("\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Generated query for facet '${facet.code}'`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Query:       '${query}'`);
    console.log(`filterValue: '${filterValue}'`);
    console.log(`filterText:  '${filterText}'`);

    return {
      value: query,
      facet: facet.code,
      filterText,
      filterValue: filterValue.toString().toUpperCase(),
    };
  });

  const queries = (await Promise.all(queryPromises)).filter(Boolean);
  return queries as Array<{
    value: string;
    facet: string;
    filterText: string;
    filterValue: string;
  }>;
}

function isFacetInStock(facet: { count?: number }): boolean {
  return facet.count === undefined || Number(facet.count) > 0;
}

function createDateNumericFacetHints(
  facetLabel: string,
  filterValue: string,
  inStock: boolean,
): string[] {
  if (inStock) {
    return [
      `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and applies or acknowledges the requested ${facetLabel} numeric/date filter (${filterValue}).`,
      `PASS if the response provides matching Mercedes-Benz vehicles, result counts, or a filtered inventory response for ${facetLabel} ${filterValue}.`,
      `FAIL if the response ignores, misinterprets, or contradicts the requested ${facetLabel} numeric/date filter (${filterValue}).`,
      `FAIL if the response says the requested ${facetLabel} filter is unavailable or has no matching vehicles when the facet is in stock.`,
      `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "MSG FAIL: invalid response".`,
      `Respond with failure reason otherwise respond with "PASS" only.`,
    ];
  }

  return [
    `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and handles the requested unavailable ${facetLabel} numeric/date filter (${filterValue}).`,
    `PASS if the response says the requested ${facetLabel} filter has no matching vehicles, is unavailable, not in stock, or offers alternatives after acknowledging no exact match.`,
    `FAIL if the response presents the unavailable requested ${facetLabel} filter (${filterValue}) as available matching inventory.`,
    `FAIL if the response ignores the requested ${facetLabel} numeric/date filter (${filterValue}).`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "MSG FAIL: invalid response".`,
    `Respond with failure reason otherwise respond with "PASS" only.`,
  ];
}

function getRangeFacetQueryValue(facet: SimplifiedFacet): {
  filterText: string;
  filterValue: string;
  expectedValue: number;
} | null {
  const min = Number(facet.min);
  const max = Number(facet.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return null;
  }

  if (facet.code === "firstRegistrationDateSlider") {
    const minYear = Math.max(1900, Math.floor(min));
    const maxYear = Math.min(2100, Math.floor(max));
    if (minYear >= maxYear) {
      return null;
    }

    const expectedValue = Math.round((minYear + maxYear) / 2);
    const filterValue = `${minYear} to ${maxYear}`;
    return {
      filterText: `filter is of category '${facet.displayName || facet.code}' with value of '${filterValue}'`,
      filterValue,
      expectedValue,
    };
  }

  const lower = Math.round(min + (max - min) * 0.25);
  const upper = Math.round(min + (max - min) * 0.75);
  const expectedValue = Math.round((lower + upper) / 2);
  const filterValue =
    lower === upper ? `${expectedValue}` : `${lower} to ${upper}`;
  return {
    filterText: `filter is of category '${facet.displayName || facet.code}' with value of '${filterValue}'`,
    filterValue,
    expectedValue,
  };
}

export async function generateDateNumericQueriesFromFacets(
  facets: SimplifiedFacet[],
  aiPromptData: {
    count: number;
    systemPrompt: string;
    userPromptTemplate: string;
    fallback: string;
  },
): Promise<DateNumericFacetQuery[]> {
  const rangeFacets = facets
    .filter((facet) => facet.type === "range" && isIncludedFacet(facet.code))
    .slice(0, aiPromptData.count || 8);

  const queries = await Promise.all(
    rangeFacets.map(async (facet): Promise<DateNumericFacetQuery | null> => {
      const rangeQueryValue = getRangeFacetQueryValue(facet);
      if (!rangeQueryValue) {
        return null;
      }

      const query = await generateOpenAIQuery(
        aiPromptData.systemPrompt,
        aiPromptData.userPromptTemplate.replace(
          /\{filterText\}/g,
          rangeQueryValue.filterText,
        ),
        aiPromptData.fallback,
      );
      const inStock = isFacetInStock(facet);
      const facetLabel = facet.displayName || facet.code;

      const shouldFilter: DateNumericFacetQuery["shouldFilter"] = {
        include: inStock
          ? [{ [facet.code]: [rangeQueryValue.expectedValue] }]
          : [],
        exclude: inStock
          ? []
          : [{ [facet.code]: [rangeQueryValue.expectedValue] }],
        strict: false,
      };

      return {
        value: query,
        facet: facet.code,
        filterText: rangeQueryValue.filterText,
        filterValue: rangeQueryValue.filterValue,
        shouldRecommend: inStock,
        shouldFilter,
        aiEvaluationHints: {
          value: createDateNumericFacetHints(
            facetLabel,
            rangeQueryValue.filterValue,
            inStock,
          ),
          overwrite: true,
        },
      };
    }),
  );

  return queries.filter(
    (query): query is DateNumericFacetQuery => query !== null,
  );
}

function getFacetLabel(facet: SimplifiedFacet): string {
  return FACET_LABELS[facet.code] || facet.displayName || facet.code;
}

function getLanguageCode(): string {
  return (process.env.LANGUAGE || LANGUAGE || "en")
    .toLowerCase()
    .split(/[-_]/)[0];
}

function getLocalizedFacetLabel(facet: SimplifiedFacet): string {
  const languageCode = getLanguageCode();
  return (
    LOCALIZED_FACET_LABELS[languageCode]?.[facet.code] || getFacetLabel(facet)
  );
}

function getMappedFormattedValue(
  facetKey: string,
  rawValue: unknown,
): string | null {
  if (facetKey === "bodyType") {
    const map: Record<string, string> = {
      SUV_OFFROADER: "SUV",
      CABRIO_ROADSTER: "Cabriolet",
      PEOPLE_CARRIER: "MPV",
      LIMOUSINE: "sedan",
    };
    return map[String(rawValue)] || null;
  }
  return null;
}

function getFacetMatrixValues(facet: SimplifiedFacet): Array<{
  queryValue: string;
  expectedValue: string | number;
  count?: number;
}> {
  if (facet.type === "range") {
    const min = Number(facet.min);
    const max = Number(facet.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      return [];
    }

    const value = Math.round(min + (max - min) * 0.5);
    return [
      {
        queryValue: value.toLocaleString("en-US"),
        expectedValue: value,
        count: facet.count,
      },
    ];
  }

  if (!Array.isArray(facet.values) || facet.values.length === 0) {
    return [];
  }

  return facet.values.map((value) => ({
    queryValue:
      getMappedFormattedValue(facet.code, value.code) ||
      value.name ||
      value.code,
    expectedValue: value.code,
    count: value.count,
  }));
}

function isFacetMatrixValueInStock(value: { count?: number }): boolean {
  return value.count === undefined || Number(value.count) > 0;
}

function buildAndOrQueryValue(
  operator: "AND" | "OR",
  anchorLabel: string,
  anchorValue: string,
  targetLabel: string,
  targetValue: string,
): string {
  const languageCode = getLanguageCode();

  if (languageCode === "th") {
    const connector = operator === "AND" ? "และ" : "หรือ";
    return `แสดงรถที่มี${anchorLabel} ${anchorValue} ${connector} ${targetLabel} ${targetValue}`;
  }

  if (languageCode === "tr") {
    const connector = operator === "AND" ? "ve" : "veya";
    return `${anchorLabel} ${anchorValue} ${connector} ${targetLabel} ${targetValue} olan araçları göster.`;
  }

  if (languageCode === "ko") {
    const connector = operator === "AND" ? "그리고" : "또는";
    return `${anchorLabel} ${anchorValue} ${connector} ${targetLabel} ${targetValue} 차량을 보여줘.`;
  }

  if (languageCode === "ja") {
    const connector = operator === "AND" ? "かつ" : "または";
    return `${anchorLabel}が${anchorValue}${connector}${targetLabel}が${targetValue}の車を表示してください。`;
  }

  const connector = operator === "AND" ? "and" : "or";
  return `Show me vehicles with ${anchorLabel} ${anchorValue} ${connector} ${targetLabel} ${targetValue}.`;
}

function buildPunctuatedFacetQueryValue(
  facetA: SimplifiedFacet,
  valueA: string,
  facetB: SimplifiedFacet,
  valueB: string,
  facetC: SimplifiedFacet,
  valueC: string,
): string {
  const formatTerm = (facet: SimplifiedFacet, value: string): string => {
    if (facet.code === "color") {
      return `${value} color`;
    }
    if (facet.code === "fuelType") {
      return `${value} engine`;
    }
    if (facet.code === "price") {
      return `less than ${value}`;
    }
    if (facet.code === "bodyType" || facet.code === "brand") {
      return value;
    }
    return `${value} ${getLocalizedFacetLabel(facet)}`;
  };

  return `get me ${formatTerm(facetA, valueA)}, ${formatTerm(facetB, valueB)} and ${formatTerm(facetC, valueC)}`;
}

function buildUnavailableAvailableFacetQueryValue(
  availableFacet: SimplifiedFacet,
  availableValue: string,
  unavailableFacet: SimplifiedFacet,
  unavailableValue: string,
): string {
  const availableLabel = getLocalizedFacetLabel(availableFacet);
  const unavailableLabel = getLocalizedFacetLabel(unavailableFacet);
  return `show me ${availableLabel} ${availableValue} with ${unavailableLabel} ${unavailableValue}`;
}

function createAndOrFacetHints(
  operator: "AND" | "OR",
  firstFacetLabel: string,
  firstValueLabel: string,
  secondFacetLabel: string,
  secondValueLabel: string,
): string[] {
  const intent =
    operator === "AND"
      ? "combined AND filter intent"
      : "alternative OR filter intent";
  const connector = operator === "AND" ? "and" : "or";

  return [
    `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and answers the requested ${intent}.`,
    `Respond with "PASS" only if the response acknowledges or applies ${firstFacetLabel} ${firstValueLabel} ${connector} ${secondFacetLabel} ${secondValueLabel}.`,
    `If the response ignores or contradicts ${firstFacetLabel} ${firstValueLabel}, respond with "MSG FAIL: missing or incorrect ${firstFacetLabel} value (${firstValueLabel})".`,
    `If the response ignores or contradicts ${secondFacetLabel} ${secondValueLabel}, respond with "MSG FAIL: missing or incorrect ${secondFacetLabel} value (${secondValueLabel})".`,
    `If the response says the requested ${firstFacetLabel}/${secondFacetLabel} combination has no results, is unavailable, is not in stock, or otherwise implies no matching vehicles were found, respond with "MSG FAIL: no results for requested ${firstFacetLabel}/${secondFacetLabel} values (${firstValueLabel}, ${secondValueLabel})".`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "MSG FAIL: invalid response".`,
    `Respond with failure reason otherwise respond with "PASS" only.`,
  ];
}

function createPunctuatedFacetHints(
  facetLabelsAndValues: Array<{
    facetLabel: string;
    valueLabel: string;
    inStock: boolean;
  }>,
): string[] {
  const requestedValues = facetLabelsAndValues
    .map(({ facetLabel, valueLabel }) => `${facetLabel} ${valueLabel}`)
    .join(", ");
  const unavailableValues = facetLabelsAndValues
    .filter(({ inStock }) => !inStock)
    .map(({ facetLabel, valueLabel }) => `${facetLabel} ${valueLabel}`)
    .join(", ");
  const availableValues = facetLabelsAndValues
    .filter(({ inStock }) => inStock)
    .map(({ facetLabel, valueLabel }) => `${facetLabel} ${valueLabel}`)
    .join(", ");

  const hints = [
    `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and handles the requested three-facet filter intent for ${requestedValues}.`,
  ];

  for (const { facetLabel, valueLabel, inStock } of facetLabelsAndValues) {
    if (inStock) {
      hints.push(
        `If the response ignores or contradicts ${facetLabel} ${valueLabel}, respond with "MSG FAIL: missing or incorrect ${facetLabel} value (${valueLabel})".`,
      );
    } else {
      hints.push(
        `Respond with "PASS" if the response acknowledges that ${facetLabel} ${valueLabel} is unavailable or not in stock.`,
      );
      hints.push(
        `FAIL if the response presents unavailable ${facetLabel} ${valueLabel} as an available match.`,
      );
    }
  }

  if (unavailableValues && availableValues) {
    hints.push(
      `Respond with "PASS" if unavailable requested value(s) are acknowledged as unavailable (${unavailableValues}) while available requested value(s) are still offered or applied as alternatives or partial matches (${availableValues}).`,
    );
  } else if (unavailableValues) {
    hints.push(
      `Respond with "PASS" if the response says no matching vehicles are available for the requested values and offers to adjust the search.`,
    );
  }

  hints.push(
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "MSG FAIL: invalid response".`,
    `Respond with failure reason otherwise respond with "PASS" only.`,
  );

  return hints;
}

export function generatePunctuatedFacetMatrixFromFacets(
  facets: SimplifiedFacet[],
): PunctuatedFacetMatrixQuery[] {
  const facetByCode = new Map(facets.map((facet) => [facet.code, facet]));
  const queries: PunctuatedFacetMatrixQuery[] = [];

  for (
    let firstIndex = 0;
    firstIndex < AND_OR_MATRIX_FACETS.length - 2;
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < AND_OR_MATRIX_FACETS.length - 1;
      secondIndex += 1
    ) {
      for (
        let thirdIndex = secondIndex + 1;
        thirdIndex < AND_OR_MATRIX_FACETS.length;
        thirdIndex += 1
      ) {
        const facetCodes = [
          AND_OR_MATRIX_FACETS[firstIndex],
          AND_OR_MATRIX_FACETS[secondIndex],
          AND_OR_MATRIX_FACETS[thirdIndex],
        ];
        const selectedFacets = facetCodes
          .map((facetCode) => facetByCode.get(facetCode))
          .filter((facet): facet is SimplifiedFacet => Boolean(facet));

        if (selectedFacets.length !== 3) {
          continue;
        }

        const [firstFacet, secondFacet, thirdFacet] = selectedFacets;
        const firstValues = getFacetMatrixValues(firstFacet);
        const secondValues = getFacetMatrixValues(secondFacet);
        const thirdValues = getFacetMatrixValues(thirdFacet);

        if (
          firstValues.length === 0 ||
          secondValues.length === 0 ||
          thirdValues.length === 0
        ) {
          continue;
        }

        for (const firstValue of firstValues) {
          for (const secondValue of secondValues) {
            for (const thirdValue of thirdValues) {
              const values = [
                { facet: firstFacet, value: firstValue },
                { facet: secondFacet, value: secondValue },
                { facet: thirdFacet, value: thirdValue },
              ];
              const include = values
                .filter(({ value }) => isFacetMatrixValueInStock(value))
                .map(({ facet, value }) => ({
                  [facet.code]: [value.expectedValue],
                }));
              const exclude = values
                .filter(({ value }) => !isFacetMatrixValueInStock(value))
                .map(({ facet, value }) => ({
                  [facet.code]: [value.expectedValue],
                }));
              const facetLabelsAndValues = values.map(({ facet, value }) => ({
                facetLabel: getFacetLabel(facet),
                valueLabel: value.queryValue,
                inStock: isFacetMatrixValueInStock(value),
              }));

              queries.push({
                value: buildPunctuatedFacetQueryValue(
                  firstFacet,
                  firstValue.queryValue,
                  secondFacet,
                  secondValue.queryValue,
                  thirdFacet,
                  thirdValue.queryValue,
                ),
                facet: facetCodes.join("+"),
                filterText: values
                  .map(
                    ({ facet, value }) =>
                      `${getFacetLabel(facet)} '${value.queryValue}'`,
                  )
                  .join(", "),
                filterValue: values
                  .map(({ value }) => value.expectedValue)
                  .join(","),
                shouldFilter: {
                  include,
                  exclude,
                  strict: false,
                },
                aiEvaluationHints: {
                  value: createPunctuatedFacetHints(facetLabelsAndValues),
                  overwrite: true,
                },
              });
            }
          }
        }
      }
    }
  }

  return queries;
}

function getFacetMatrixValuesByStock(
  facet: SimplifiedFacet,
  inStock: boolean,
  limit = UNAVAILABLE_AVAILABLE_VALUE_LIMIT,
): Array<{
  queryValue: string;
  expectedValue: string | number;
  count?: number;
}> {
  return getFacetMatrixValues(facet)
    .filter((value) => isFacetMatrixValueInStock(value) === inStock)
    .slice(0, limit);
}

async function loadUnavailableFacetMatrixValues(facetKey: string): Promise<
  Array<{
    queryValue: string;
    expectedValue: string;
  }>
> {
  const masterDataPath = path.join(DATA_DIR, "facets-master-data.json");
  const stockDataPath = path.join(DATA_DIR, "emh-api-response.json");
  const masterData = JSON.parse(await fs.readFile(masterDataPath, "utf-8"));
  const stockData = JSON.parse(await fs.readFile(stockDataPath, "utf-8"));

  return extractMissingFacetValuesFromData(facetKey, masterData, stockData)
    .slice(0, UNAVAILABLE_AVAILABLE_VALUE_LIMIT)
    .map((entry) => ({
      queryValue:
        getMappedFormattedValue(facetKey, entry.rawValue) ||
        entry.formattedValue,
      expectedValue: entry.rawValue,
    }));
}

export async function generateUnavailableAvailableFacetMatrixFromFacets(
  facets: SimplifiedFacet[],
): Promise<PunctuatedFacetMatrixQuery[]> {
  const facetByCode = new Map(facets.map((facet) => [facet.code, facet]));
  const queries: PunctuatedFacetMatrixQuery[] = [];

  for (
    let firstIndex = 0;
    firstIndex < AND_OR_MATRIX_FACETS.length - 1;
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < AND_OR_MATRIX_FACETS.length;
      secondIndex += 1
    ) {
      const firstFacet = facetByCode.get(AND_OR_MATRIX_FACETS[firstIndex]);
      const secondFacet = facetByCode.get(AND_OR_MATRIX_FACETS[secondIndex]);

      if (!firstFacet || !secondFacet) {
        continue;
      }

      const firstAvailableValues = getFacetMatrixValuesByStock(
        firstFacet,
        true,
      );
      const firstUnavailableValues = await loadUnavailableFacetMatrixValues(
        firstFacet.code,
      );
      const secondAvailableValues = getFacetMatrixValuesByStock(
        secondFacet,
        true,
      );
      const secondUnavailableValues = await loadUnavailableFacetMatrixValues(
        secondFacet.code,
      );
      const pairCases = [
        {
          availableFacet: firstFacet,
          availableValues: firstAvailableValues,
          unavailableFacet: secondFacet,
          unavailableValues: secondUnavailableValues,
        },
        {
          availableFacet: secondFacet,
          availableValues: secondAvailableValues,
          unavailableFacet: firstFacet,
          unavailableValues: firstUnavailableValues,
        },
      ];

      for (const pairCase of pairCases) {
        for (const availableValue of pairCase.availableValues) {
          for (const unavailableValue of pairCase.unavailableValues) {
            const availableLabel = getFacetLabel(pairCase.availableFacet);
            const unavailableLabel = getFacetLabel(pairCase.unavailableFacet);
            queries.push({
              value: buildUnavailableAvailableFacetQueryValue(
                pairCase.availableFacet,
                availableValue.queryValue,
                pairCase.unavailableFacet,
                unavailableValue.queryValue,
              ),
              facet: `${pairCase.availableFacet.code}+${pairCase.unavailableFacet.code}`,
              filterText: `${availableLabel} '${availableValue.queryValue}', ${unavailableLabel} '${unavailableValue.queryValue}'`,
              filterValue: `${availableValue.expectedValue},${unavailableValue.expectedValue}`,
              shouldFilter: {
                include: [
                  {
                    [pairCase.availableFacet.code]: [
                      availableValue.expectedValue,
                    ],
                  },
                ],
                exclude: [
                  {
                    [pairCase.unavailableFacet.code]: [
                      unavailableValue.expectedValue,
                    ],
                  },
                ],
                strict: false,
              },
              aiEvaluationHints: {
                value: createPunctuatedFacetHints([
                  {
                    facetLabel: availableLabel,
                    valueLabel: availableValue.queryValue,
                    inStock: true,
                  },
                  {
                    facetLabel: unavailableLabel,
                    valueLabel: unavailableValue.queryValue,
                    inStock: false,
                  },
                ]),
                overwrite: true,
              },
            });
          }
        }
      }
    }
  }

  return queries;
}

function createUnavailableAndOrFacetHints(
  operator: "AND" | "OR",
  firstFacetLabel: string,
  firstValueLabel: string,
  firstInStock: boolean,
  secondFacetLabel: string,
  secondValueLabel: string,
  secondInStock: boolean,
): string[] {
  const connector = operator === "AND" ? "and" : "or";
  const unavailableValues = [
    !firstInStock ? `${firstFacetLabel} ${firstValueLabel}` : "",
    !secondInStock ? `${secondFacetLabel} ${secondValueLabel}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const availableValues = [
    firstInStock ? `${firstFacetLabel} ${firstValueLabel}` : "",
    secondInStock ? `${secondFacetLabel} ${secondValueLabel}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const hints = [
    `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and handles the requested ${operator} filter intent for ${firstFacetLabel} ${firstValueLabel} ${connector} ${secondFacetLabel} ${secondValueLabel}.`,
    `Respond with "PASS" if the response acknowledges that the unavailable requested facet value(s) are not available or not in stock: ${unavailableValues}.`,
    `FAIL if the response presents the unavailable requested facet value(s) as available matches: ${unavailableValues}.`,
  ];

  if (availableValues) {
    hints.push(
      `Respond with "PASS" if the response still offers or applies available requested facet value(s) as alternatives or partial matches: ${availableValues}.`,
    );
  } else {
    hints.push(
      `Respond with "PASS" if the response says no matching vehicles are available for the requested ${firstFacetLabel}/${secondFacetLabel} values and offers to adjust the search.`,
    );
  }

  hints.push(
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "MSG FAIL: invalid response".`,
    `Respond with failure reason otherwise respond with "PASS" only.`,
  );

  return hints;
}

export function generateAndOrFacetMatrixFromFacets(
  facets: SimplifiedFacet[],
): AndOrFacetMatrixQuery[] {
  const facetByCode = new Map(facets.map((facet) => [facet.code, facet]));
  const queries: AndOrFacetMatrixQuery[] = [];

  for (const anchorFacetCode of AND_OR_MATRIX_ANCHOR_FACETS) {
    const anchorFacet = facetByCode.get(anchorFacetCode);
    if (!anchorFacet) {
      continue;
    }

    const anchorValues = getFacetMatrixValues(anchorFacet);
    if (anchorValues.length === 0) {
      continue;
    }

    for (const targetFacetCode of AND_OR_MATRIX_FACETS) {
      if (targetFacetCode === anchorFacetCode) {
        continue;
      }

      const targetFacet = facetByCode.get(targetFacetCode);
      if (!targetFacet) {
        continue;
      }

      const targetValues = getFacetMatrixValues(targetFacet);
      if (targetValues.length === 0) {
        continue;
      }

      for (const anchorValue of anchorValues) {
        for (const targetValue of targetValues) {
          const anchorLabel = getFacetLabel(anchorFacet);
          const targetLabel = getFacetLabel(targetFacet);
          const localizedAnchorLabel = getLocalizedFacetLabel(anchorFacet);
          const localizedTargetLabel = getLocalizedFacetLabel(targetFacet);
          const facetPair = `${anchorFacet.code}+${targetFacet.code}`;
          const filterText = `${anchorLabel} '${anchorValue.queryValue}' and ${targetLabel} '${targetValue.queryValue}'`;
          const filterValue = `${anchorValue.expectedValue},${targetValue.expectedValue}`;
          const anchorInStock = isFacetMatrixValueInStock(anchorValue);
          const targetInStock = isFacetMatrixValueInStock(targetValue);
          const include = [
            anchorInStock
              ? { [anchorFacet.code]: [anchorValue.expectedValue] }
              : null,
            targetInStock
              ? { [targetFacet.code]: [targetValue.expectedValue] }
              : null,
          ].filter(
            (entry): entry is Record<string, Array<string | number>> =>
              entry !== null,
          );
          const exclude = [
            anchorInStock
              ? null
              : { [anchorFacet.code]: [anchorValue.expectedValue] },
            targetInStock
              ? null
              : { [targetFacet.code]: [targetValue.expectedValue] },
          ].filter(
            (entry): entry is Record<string, Array<string | number>> =>
              entry !== null,
          );
          const allValuesInStock = anchorInStock && targetInStock;

          queries.push({
            value: buildAndOrQueryValue(
              "AND",
              localizedAnchorLabel,
              anchorValue.queryValue,
              localizedTargetLabel,
              targetValue.queryValue,
            ),
            facet: facetPair,
            operator: "AND",
            filterText,
            filterValue,
            shouldFilter: {
              include,
              exclude,
              strict: false,
            },
            aiEvaluationHints: {
              value: allValuesInStock
                ? createAndOrFacetHints(
                    "AND",
                    anchorLabel,
                    anchorValue.queryValue,
                    targetLabel,
                    targetValue.queryValue,
                  )
                : createUnavailableAndOrFacetHints(
                    "AND",
                    anchorLabel,
                    anchorValue.queryValue,
                    anchorInStock,
                    targetLabel,
                    targetValue.queryValue,
                    targetInStock,
                  ),
              overwrite: true,
            },
          });

          queries.push({
            value: buildAndOrQueryValue(
              "OR",
              localizedAnchorLabel,
              anchorValue.queryValue,
              localizedTargetLabel,
              targetValue.queryValue,
            ),
            facet: facetPair,
            operator: "OR",
            filterText,
            filterValue,
            shouldFilter: {
              include,
              exclude,
              strict: false,
            },
            aiEvaluationHints: {
              value: allValuesInStock
                ? createAndOrFacetHints(
                    "OR",
                    anchorLabel,
                    anchorValue.queryValue,
                    targetLabel,
                    targetValue.queryValue,
                  )
                : createUnavailableAndOrFacetHints(
                    "OR",
                    anchorLabel,
                    anchorValue.queryValue,
                    anchorInStock,
                    targetLabel,
                    targetValue.queryValue,
                    targetInStock,
                  ),
              overwrite: true,
            },
          });
        }
      }
    }
  }

  return queries;
}
