import fs from "fs/promises";
import path from "path";
import {
  buildFacetValueDisplayMap,
  extractResponseFacets,
  formatExpectedFacetValues,
} from "./facetDisplayHelpers";

const FACETS_MASTER_DATA_PATH = path.resolve(
  __dirname,
  "../../data/facets-master-data.json",
);

let facetsMasterDataCache: any | null = null;

export async function getFacetsMasterData(): Promise<any> {
  if (facetsMasterDataCache) return facetsMasterDataCache;
  try {
    const content = await fs.readFile(FACETS_MASTER_DATA_PATH, "utf-8");
    facetsMasterDataCache = JSON.parse(content);
  } catch {
    facetsMasterDataCache = {};
  }
  return facetsMasterDataCache;
}

export function normalizeFacetToken(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Re-compose characters so Hangul syllables (e.g. 세단) are preserved
      // before the allow-list regex below.
      .normalize("NFC")
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/^paint[_-]?color[_-]?/i, "")
      .replace(/^upholstery[_-]?color[_-]?/i, "")
      .replace(/[^a-z0-9가-힣ぁ-ゖァ-ヺー一-龯]/g, "")
  );
}

const colorTranslations: Record<string, string> = {
  화이트: "white",
  블랙: "black",
  그레이: "grey",
  레드: "red",
  블루: "blue",
  실버: "silver",
  베이지: "beige",
  브라운: "brown",
  흰색: "white",
  하얀색: "white",
  검정: "black",
  검은색: "black",
  회색: "grey",
  은색: "silver",
  빨간색: "red",
  파란색: "blue",
  beyaz: "white",
  siyah: "black",
  gri: "grey",
  gumus: "silver",
  kirmizi: "red",
  mavi: "blue",
  kahverengi: "brown",
  bej: "beige",
  sari: "yellow",
  gümüş: "silver",
  ดำ: "black",
  ขาว: "white",
  เทา: "grey",
  เงิน: "silver",
  แดง: "red",
  น้ำเงิน: "blue",
  เขียว: "green",
  เหลือง: "yellow",
  น้ำตาล: "brown",
  เบจ: "beige",
};

export function translateColorName(value: string): string {
  const normalized = normalizeFacetToken(value);
  return colorTranslations[normalized] || normalized;
}

export function collectPrimitiveFacetValues(value: any): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPrimitiveFacetValues(item));
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith("__"))
      .flatMap(([, item]) => collectPrimitiveFacetValues(item));
  }
  return [String(value)];
}

export function getFacetRangeBounds(
  value: any,
): { min: number; max: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const min = Number(value.min);
  const max = Number(value.max);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return min <= max ? { min, max } : { min: max, max: min };
}

export function isExpectedValueWithinFacetRange(
  expected: unknown,
  range: { min: number; max: number },
): boolean {
  const numericExpected = Number(expected);
  return (
    Number.isFinite(numericExpected) &&
    numericExpected >= range.min &&
    numericExpected <= range.max
  );
}

export type FacetCandidateTokenBuilder = (rawValue: string) => string[];

export interface ExpectedFacetValidationOptions {
  actualFacets: any;
  resultsFacets: Record<string, any>;
  responseData: any;
  buildFacetCandidateTokens: FacetCandidateTokenBuilder;
  matchIncludedValuesWithCandidates?: boolean;
  enforceOnlyExpectedIncludedValues?: boolean;
}

export interface ExpectedFacetValidationResult {
  passed: boolean;
  expectedBeFacets: {
    include: any[];
    exclude: any[];
    strict: boolean;
  };
  failureReasons: string[];
}

const ENGINE_POWER_KW_PER_HP = 1.343;

function getEnginePowerCompanionFacetKey(facetKey: string): string | null {
  if (facetKey === "enginePowerHP") return "enginePowerKW";
  if (facetKey === "enginePowerKW") return "enginePowerHP";
  return null;
}

function convertEnginePowerValueBetweenFacets(
  value: unknown,
  fromFacetKey: string,
  toFacetKey: string,
): number | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  if (fromFacetKey === toFacetKey) {
    return Math.round(numericValue);
  }
  if (fromFacetKey === "enginePowerHP" && toFacetKey === "enginePowerKW") {
    return Math.round(numericValue / ENGINE_POWER_KW_PER_HP);
  }
  if (fromFacetKey === "enginePowerKW" && toFacetKey === "enginePowerHP") {
    return Math.round(numericValue * ENGINE_POWER_KW_PER_HP);
  }
  return null;
}

function buildUuidToSemanticMap(
  facetsData: Record<string, any>,
): Record<string, Record<string, string>> {
  const uuidToSemanticMap: Record<string, Record<string, string>> = {};

  for (const facetKey of ["color", "upholstery"]) {
    if (facetsData[facetKey]?.values) {
      uuidToSemanticMap[facetKey] = {};
      for (const item of facetsData[facetKey].values) {
        if (item.value && item.formattedValue) {
          const translated = translateColorName(item.formattedValue);
          uuidToSemanticMap[facetKey][item.value.toUpperCase()] =
            translated.toLowerCase();
        }
      }
    }
  }

  return uuidToSemanticMap;
}

function buildActualFacetCandidates(
  key: string,
  actualValues: string[],
  uuidToSemanticMap: Record<string, Record<string, string>>,
  buildFacetCandidateTokens: FacetCandidateTokenBuilder,
): Set<string> {
  const semanticActuals = actualValues.map((value) => {
    const valueString = String(value).toUpperCase();
    return uuidToSemanticMap[key]?.[valueString] ?? String(value);
  });
  const actualCandidates = new Set<string>();

  for (const actual of semanticActuals) {
    const candidates = buildFacetCandidateTokens(actual);
    candidates.forEach((candidate) =>
      actualCandidates.add(candidate.toUpperCase()),
    );
  }

  return actualCandidates;
}

function matchesFacetCandidates(
  key: string,
  expected: unknown,
  actualCandidates: Set<string>,
  buildFacetCandidateTokens: FacetCandidateTokenBuilder,
): boolean {
  const processedExpected = ["color", "upholstery"].includes(key)
    ? translateColorName(String(expected))
    : String(expected);
  const expectedCandidates = buildFacetCandidateTokens(processedExpected);

  return expectedCandidates.some((candidate) =>
    actualCandidates.has(candidate.toUpperCase()),
  );
}

function parseUpholsteryCompositeParts(value: unknown): string[] {
  const rawValue = String(value || "").trim().toUpperCase();
  if (!rawValue.startsWith("UPHOLSTERY_COLOR_")) {
    return [];
  }

  const rawParts = rawValue
    .replace(/^UPHOLSTERY_COLOR_/, "")
    .split("_")
    .filter(Boolean);
  if (rawParts.length < 2) {
    return [];
  }

  return rawParts.map((part) => normalizeFacetToken(part)).filter(Boolean);
}

function getNormalizedFacetValueSet(
  resultsFacets: Record<string, any>,
  key: string,
): Set<string> {
  return new Set(
    collectPrimitiveFacetValues(resultsFacets[key])
      .map((value) => normalizeFacetToken(String(value || "")))
      .filter(Boolean),
  );
}

function isSplitUpholsteryCompositePresent(
  expected: unknown,
  resultsFacets: Record<string, any>,
): boolean {
  const parts = parseUpholsteryCompositeParts(expected);
  if (parts.length < 2) {
    return false;
  }

  const upholsteryValues = getNormalizedFacetValueSet(resultsFacets, "upholstery");
  const colorValues = getNormalizedFacetValueSet(resultsFacets, "color");
  if (upholsteryValues.size === 0 || colorValues.size === 0) {
    return false;
  }

  const combinedValues = new Set<string>([...upholsteryValues, ...colorValues]);
  const allPartsPresent = parts.every((part) => combinedValues.has(part));
  if (!allPartsPresent) {
    return false;
  }

  return parts.some((part) => upholsteryValues.has(part));
}

function isUpholsteryValueCoveredByCompositeExpectation(
  actualValue: unknown,
  expectedValues: unknown[],
  resultsFacets: Record<string, any>,
): boolean {
  const normalizedActual = normalizeFacetToken(String(actualValue || ""));
  if (!normalizedActual) {
    return false;
  }

  return expectedValues.some((expected) => {
    const parts = parseUpholsteryCompositeParts(expected);
    if (parts.length < 2 || !parts.includes(normalizedActual)) {
      return false;
    }

    return isSplitUpholsteryCompositePresent(expected, resultsFacets);
  });
}

export async function validateExpectedFacets({
  actualFacets,
  resultsFacets,
  responseData,
  buildFacetCandidateTokens,
  matchIncludedValuesWithCandidates = false,
  enforceOnlyExpectedIncludedValues = false,
}: ExpectedFacetValidationOptions): Promise<ExpectedFacetValidationResult> {
  const include = actualFacets.include || [];
  const exclude = actualFacets.exclude || [];
  const strict = actualFacets.strict ?? false;
  const resultsKeys = Object.keys(resultsFacets);
  const resultsKeysSet = new Set(resultsKeys);
  const includeKeys = new Set<string>();
  const failureReasons: string[] = [];

  for (const filterObj of include) {
    for (const key of Object.keys(filterObj)) {
      includeKeys.add(key);
    }
  }

  const facetsData = extractResponseFacets(responseData || {});
  const masterData = await getFacetsMasterData();
  const facetValueDisplayMap = buildFacetValueDisplayMap(
    facetsData,
    masterData || {},
  );
  const uuidToSemanticMap = buildUuidToSemanticMap(facetsData);

  for (const filterObj of include) {
    for (const [key, expectedValues] of Object.entries(filterObj)) {
      if (!resultsKeysSet.has(key)) {
        const companionKey = getEnginePowerCompanionFacetKey(key);
        if (companionKey && resultsKeysSet.has(companionKey)) {
          const companionRange = getFacetRangeBounds(resultsFacets[companionKey]);
          if (companionRange) {
            // true: companion key exists, pass
            if (expectedValues === true) {
              continue;
            }
            // { min/max }: convert constraint to companion unit and check
            if (
              typeof expectedValues === "object" &&
              !Array.isArray(expectedValues) &&
              expectedValues !== null &&
              ("min" in expectedValues || "max" in expectedValues)
            ) {
              const constraint = expectedValues as { min?: number; max?: number };
              if (constraint.min !== undefined) {
                const convertedMin = convertEnginePowerValueBetweenFacets(constraint.min, key, companionKey);
                if (convertedMin !== null && companionRange.min !== convertedMin) {
                  failureReasons.push(
                    `Expected ${key} min == ${constraint.min} (as ${companionKey} min == ${convertedMin}, actual min: ${companionRange.min})`,
                  );
                }
              }
              if (constraint.max !== undefined) {
                const convertedMax = convertEnginePowerValueBetweenFacets(constraint.max, key, companionKey);
                if (convertedMax !== null && companionRange.max !== convertedMax) {
                  failureReasons.push(
                    `Expected ${key} max == ${constraint.max} (as ${companionKey} max == ${convertedMax}, actual max: ${companionRange.max})`,
                  );
                }
              }
              continue;
            }
            // array: convert each value and check within companion range
            if (Array.isArray(expectedValues) && expectedValues.length > 0) {
              for (const expected of expectedValues) {
                const convertedExpected = convertEnginePowerValueBetweenFacets(
                  expected,
                  key,
                  companionKey,
                );
                if (
                  convertedExpected === null ||
                  !isExpectedValueWithinFacetRange(convertedExpected, companionRange)
                ) {
                  failureReasons.push(
                    `Expected facet value outside range: ${key}=${expected} (validated via ${companionKey} range: ${companionRange.min}-${companionRange.max})`,
                  );
                }
              }
              continue;
            }
          }
        }

        if (Array.isArray(expectedValues) && expectedValues.length > 0) {
          failureReasons.push(
            `Missing required facet key: ${key} (expected value(s): ${formatExpectedFacetValues(key, expectedValues, facetValueDisplayMap)})`,
          );
        } else if (expectedValues !== true) {
          failureReasons.push(`Missing required facet key: ${key}`);
        }
        continue;
      }

      // Handle true: facet key exists in actual → pass
      if (expectedValues === true) {
        continue;
      }

      // Handle { min?, max? } range constraint
      if (
        typeof expectedValues === "object" &&
        !Array.isArray(expectedValues) &&
        expectedValues !== null &&
        ("min" in expectedValues || "max" in expectedValues)
      ) {
        const rangeBounds = getFacetRangeBounds(resultsFacets[key]);
        if (rangeBounds) {
          const constraint = expectedValues as { min?: number; max?: number };
          if (constraint.min !== undefined && rangeBounds.min !== constraint.min) {
            failureReasons.push(
              `Expected ${key} range min == ${constraint.min} (actual min: ${rangeBounds.min})`,
            );
          }
          if (constraint.max !== undefined && rangeBounds.max !== constraint.max) {
            failureReasons.push(
              `Expected ${key} range max == ${constraint.max} (actual max: ${rangeBounds.max})`,
            );
          }
        }
        continue;
      }

      if (!Array.isArray(expectedValues) || expectedValues.length === 0) {
        continue;
      }

      const rangeBounds = getFacetRangeBounds(resultsFacets[key]);
      if (rangeBounds) {
        for (const expected of expectedValues) {
          if (!isExpectedValueWithinFacetRange(expected, rangeBounds)) {
            failureReasons.push(
              `Expected facet value outside range: ${key}=${expected} (actual range: ${rangeBounds.min}-${rangeBounds.max})`,
            );
          }
        }
        continue;
      }

      const actualValues = collectPrimitiveFacetValues(resultsFacets[key]);
      const rawActuals = new Set(
        actualValues.map((value) => String(value).trim().toUpperCase()),
      );
      const actualCandidates = matchIncludedValuesWithCandidates
        ? buildActualFacetCandidates(
            key,
            actualValues,
            uuidToSemanticMap,
            buildFacetCandidateTokens,
          )
        : null;

      for (const expected of expectedValues) {
        const rawExpected = String(expected).trim().toUpperCase();
        if (rawActuals.has(rawExpected)) {
          continue;
        }

        if (
          matchIncludedValuesWithCandidates &&
          actualCandidates &&
          matchesFacetCandidates(
            key,
            expected,
            actualCandidates,
            buildFacetCandidateTokens,
          )
        ) {
          continue;
        }

        if (
          key === "upholstery" &&
          isSplitUpholsteryCompositePresent(expected, resultsFacets)
        ) {
          continue;
        }

        failureReasons.push(`Missing required facet value: ${key}=${expected}`);
      }

      if (enforceOnlyExpectedIncludedValues) {
        const expectedSet = new Set(
          expectedValues.map((value) => String(value).trim().toUpperCase()),
        );
        for (const actual of actualValues) {
          const rawActual = String(actual).trim().toUpperCase();
          if (!expectedSet.has(rawActual)) {
            if (
              key === "upholstery" &&
              isUpholsteryValueCoveredByCompositeExpectation(
                actual,
                expectedValues,
                resultsFacets,
              )
            ) {
              continue;
            }

            failureReasons.push(
              `Unexpected facet value in ${key}: ${actual} (expected only: ${expectedValues.join(", ")})`,
            );
          }
        }
      }
    }
  }

  for (const filterObj of exclude) {
    for (const [key, excludedValues] of Object.entries(filterObj)) {
      if (!resultsKeysSet.has(key)) continue;

      if (Array.isArray(excludedValues) && excludedValues.length > 0) {
        const actualValues = collectPrimitiveFacetValues(resultsFacets[key]);
        const rawActuals = new Set(
          actualValues.map((value) => String(value).trim().toUpperCase()),
        );
        const actualCandidates = buildActualFacetCandidates(
          key,
          actualValues,
          uuidToSemanticMap,
          buildFacetCandidateTokens,
        );

        for (const excluded of excludedValues) {
          const rawExcluded = String(excluded).trim().toUpperCase();
          if (rawActuals.has(rawExcluded)) {
            failureReasons.push(
              `Excluded facet value present: ${key}=${excluded}`,
            );
            continue;
          }

          if (
            matchesFacetCandidates(
              key,
              excluded,
              actualCandidates,
              buildFacetCandidateTokens,
            )
          ) {
            failureReasons.push(
              `Excluded facet value present: ${key}=${excluded}`,
            );
          }
        }
      } else {
        failureReasons.push(`Excluded facet key present: ${key}`);
      }
    }
  }

  if (strict) {
    for (const key of resultsKeys) {
      if (!includeKeys.has(key)) {
        failureReasons.push(`Unexpected facet in strict mode: ${key}`);
      }
    }
  }

  return {
    passed: failureReasons.length === 0,
    expectedBeFacets: {
      include,
      exclude,
      strict,
    },
    failureReasons,
  };
}
