import fs from "fs/promises";
import path from "path";
import {
  buildFacetValueDisplayMap,
  extractResponseFacets,
  formatExpectedFacetValues,
} from "./facetDisplayHelpers";

const FACETS_MASTER_DATA_PATH = path.resolve(
  __dirname,
  "../data/facets-master-data.json",
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
        if (Array.isArray(expectedValues) && expectedValues.length > 0) {
          failureReasons.push(
            `Missing required facet key: ${key} (expected value(s): ${formatExpectedFacetValues(key, expectedValues, facetValueDisplayMap)})`,
          );
        } else {
          failureReasons.push(`Missing required facet key: ${key}`);
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

        failureReasons.push(`Missing required facet value: ${key}=${expected}`);
      }

      if (enforceOnlyExpectedIncludedValues) {
        const expectedSet = new Set(
          expectedValues.map((value) => String(value).trim().toUpperCase()),
        );
        for (const actual of actualValues) {
          const rawActual = String(actual).trim().toUpperCase();
          if (!expectedSet.has(rawActual)) {
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
