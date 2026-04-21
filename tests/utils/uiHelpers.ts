import { Browser, Page } from "@playwright/test";
import { chromium } from "playwright";
import fs from "fs/promises";
import {
  evaluateSearchResult,
  fetchTranslation,
  openaiChatCompletion,
} from "./aiHelpers";
import { deepEqual, isLanguageConsistencyAccepted } from "./shared";

export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const LANGUAGE = process.env.LANGUAGE;
export const PRODUCT = process.env.PRODUCT;

export interface UiSearchResult {
  query: string;
  results: any;
  responseTime: number;
  error?: string;
}

function normalizeFacetToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/^paint[_-]?color[_-]?/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function collectPrimitiveFacetValues(value: any): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPrimitiveFacetValues(item));
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => collectPrimitiveFacetValues(item));
  }
  return [String(value)];
}

function isOpaqueFacetValue(facetKey: string, rawValue: string): boolean {
  return (
    ["upholstery", "color"].includes(facetKey) &&
    /^[0-9a-f]{8,}$/i.test(rawValue)
  );
}

const facetValueAliasMap: Record<string, string[]> = {
  // Body type aliases
  "limousine": ["sedan"],
  "sedan": ["limousine"],
  "suv": ["suvoffroader"],
  "suvoffroader": ["suv"],
  // TR: "SUV & Arazi aracı" covers both SUV and SUV_OFFROADER
  "suvaraziaraci": ["suv", "suvoffroader"],
  "suvaraziarac": ["suv", "suvoffroader"],
  "cabrioroadster": ["cabrioletroadster", "kabriyo", "cabriolet"],
  "cabrioletroadster": ["cabrioroadster", "kabriyo", "cabriolet"],
  // TR body type display names → BE codes
  "kabriyo": ["cabrioroadster", "cabrioletroadster"],
  "amggt": ["mercedesamggt"],
  "mercedesamggt": ["amggt"],
  // TR model series: "A-Serisi" → "aserisi", "C-Serisi" → "cserisi", etc.
  "a": ["aclass", "aserisi"],
  "aclass": ["a", "aserisi"],
  "aserisi": ["a", "aclass"],
  "b": ["bclass", "bserisi"],
  "bclass": ["b", "bserisi"],
  "bserisi": ["b", "bclass"],
  "c": ["cclass", "cserisi"],
  "cclass": ["c", "cserisi"],
  "cserisi": ["c", "cclass"],
  "e": ["eclass", "eserisi"],
  "eclass": ["e", "eserisi"],
  "eserisi": ["e", "eclass"],
  "g": ["gclass", "gserisi"],
  "gclass": ["g", "gserisi"],
  "gserisi": ["g", "gclass"],
  "s": ["sclass", "sserisi"],
  "sclass": ["s", "sserisi"],
  "sserisi": ["s", "sclass"],
  "hatchback": ["hatches"],
  "hatches": ["hatchback"],
  "peoplecarrier": ["peoplemovers", "mpvs"],
  "peoplemovers": ["peoplecarrier", "mpvs"],
  "mpvs": ["peoplecarrier", "peoplemovers"],
  "station": ["estate"],
  "estate": ["station"],
  // Fuel type aliases
  "pluginhybridpetrol": ["petrolelectricpluginhybrid"],
  "petrolelectricpluginhybrid": ["pluginhybridpetrol"],
  // TR fuel type display names → BE codes
  "benzin": ["petrol"],
  "petrol": ["benzin"],
  "dizel": ["diesel"],
  "diesel": ["dizel"],
  "elektrik": ["electric"],
  "electric": ["elektrik"],
  "hibrit": ["petrolelectricpluginhybrid", "pluginhybridpetrol"],
  // TR: "Benzinli Plug-in Hibrit" normalizes to "benzinlipluginhibrit"
  "benzinlipluginhibrit": ["petrolelectricpluginhybrid", "pluginhybridpetrol"],
  // Brand aliases: UI may show "Mercedes-Benz" or "Mercedes Benz"
  "mercedesbenz": ["mercedes"],
  "mercedes": ["mercedesbenz"],
  // TR color display names → BE codes (PAINT_COLOR_ prefix is stripped by normalizeFacetToken)
  "siyah": ["black"],
  "black": ["siyah"],
  "beyaz": ["white"],
  "white": ["beyaz"],
  "gumus": ["silver", "grey", "gray"],
  "silver": ["gumus"],
  "gri": ["grey", "gray", "silver"],
  "grey": ["gri", "gray"],
  "gray": ["gri", "grey"],
  "kirmizi": ["red"],
  "red": ["kirmizi"],
  "mavi": ["blue"],
  "blue": ["mavi"],
  "yesil": ["green"],
  "green": ["yesil"],
};

function buildFacetCandidateTokens(rawValue: string): string[] {
  const candidates = new Set<string>();
  const normalizedRaw = normalizeFacetToken(rawValue);
  if (normalizedRaw) {
    candidates.add(normalizedRaw);
    for (const alias of facetValueAliasMap[normalizedRaw] || []) {
      candidates.add(alias);
    }
  }

  if (rawValue.includes("_")) {
    const lastToken = rawValue.split("_").pop() || rawValue;
    const normalizedLastToken = normalizeFacetToken(lastToken);
    if (normalizedLastToken) {
      candidates.add(normalizedLastToken);
      for (const alias of facetValueAliasMap[normalizedLastToken] || []) {
        candidates.add(alias);
      }
    }
  }

  return Array.from(candidates);
}

function mapUiLabelToFacetKey(label: string): string | null {
  const normalizedLabel = normalizeFacetToken(label);
  const labelMap: Record<string, string> = {
    "brand": "brand",
    "brandname": "brand",
    "body": "bodyType",
    "bodystyle": "bodyType",
    "bodytype": "bodyType",
    "vehicletype": "bodyType",
    "model": "modelIdentifier",
    "modelvariant": "motorization",
    "variant": "motorization",
    "varyant": "motorization",
    "modelidentifier": "modelIdentifier",
    "motorization": "motorization",
    "fueltype": "fuelType",
    "engine": "fuelType",
    "color": "color",
    "colour": "color",
    "upholstery": "upholstery",
    "upholsterycolor": "upholstery",
    "upholsterycolour": "upholstery",
    "modelyear": "modelYear",
    "price": "price",
    "totalprice": "price",
    "marka": "brand",
    "modeladi": "modelIdentifier",
    "motor": "motorization",
    "yakittipi": "fuelType",
    "govdetipi": "bodyType",
    "govdeturu": "bodyType",
    "renk": "color",
    "renkler": "color",
    "doseme": "upholstery",
    "dosemerenk": "upholstery",
    "icdoseme": "upholstery",
    "icdosemerenk": "upholstery",
    "modelyili": "modelYear",
    "fiyat": "price",
    // TR: equipment
    "donanim": "equipment",
    "equipment": "equipment",
  };

  return labelMap[normalizedLabel] || null;
}

function parseUiSelectedFiltersToKeyValue(
  uiSelectedFilters: string[]
): Record<string, string[]> {
  const keyValueFilters: Record<string, string[]> = {};

  for (const text of uiSelectedFilters) {
    const cleanText = text.replace(/\s+/g, " ").trim();
    const colonIndex = cleanText.indexOf(":");
    if (colonIndex < 0) {
      continue;
    }

    const label = cleanText.slice(0, colonIndex).trim();
    let value = cleanText.slice(colonIndex + 1).trim();
    
    // Remove trailing "X" (close button) from the value
    value = value.replace(/\s*X\s*$/i, "").trim();
    // Strip artefact colons produced by the tree-walker joining label+separator text nodes
    value = value.replace(/^[:\s]+|[:\s]+$/g, "").trim();
    
    const facetKey = mapUiLabelToFacetKey(label);
    if (!facetKey) {
      continue;
    }

    // Always register the key so the empty-key guard in comparison fires.
    if (!keyValueFilters[facetKey]) {
      keyValueFilters[facetKey] = [];
    }

    if (!value) {
      // Pill is present but value is empty (e.g. "Marka :") — key is registered
      // with an empty array so compareUiSelectedFiltersWithFacets skips it.
      continue;
    }

    keyValueFilters[facetKey].push(value);
  }

  return keyValueFilters;
}

function compareUiSelectedFiltersWithFacets(
  facets: Record<string, any>,
  uiSelectedFiltersKV: Record<string, string[]>
): {
  matches: boolean;
  missingFacetValues: string[];
} {
  const uiSelectedFacetKeys = new Set(Object.keys(uiSelectedFiltersKV));
  const facetKeyUiFallbacks: Record<string, string[]> = {
    upholstery: ["upholstery", "color"],
    fuelType: ["fuelType", "motorization"],
  };

  const missingFacetValues: string[] = [];
  for (const [facetKey, facetValue] of Object.entries(facets)) {
    if (facetKey === "price" && uiSelectedFacetKeys.has("price")) {
      continue;
    }

    const rawFacetValues = collectPrimitiveFacetValues(facetValue);
    const candidateUiKeys = facetKeyUiFallbacks[facetKey] || [facetKey];
    const keySpecificUiValues = candidateUiKeys.flatMap(
      (candidateKey) => uiSelectedFiltersKV[candidateKey] || []
    );
    const hasSelectedFacetKey = candidateUiKeys.some((candidateKey) =>
      uiSelectedFacetKeys.has(candidateKey)
    );

    // Treat facet keys whose only captured values are separator artefacts (e.g. ":") as empty
    const realUiValues = keySpecificUiValues.filter((v) => v !== ":" && v.trim() !== "");
    if (hasSelectedFacetKey && realUiValues.length === 0) {
      continue;
    }

    const keySpecificUiTokens = new Set(
      realUiValues.flatMap((value) => buildFacetCandidateTokens(value))
    );

    for (const rawValue of rawFacetValues) {
      if (isOpaqueFacetValue(facetKey, rawValue)) {
        continue;
      }

      const expectedCandidates = buildFacetCandidateTokens(rawValue);
      const matchedByKey =
        keySpecificUiTokens.size > 0 &&
        expectedCandidates.some(
          (candidate) =>
            keySpecificUiTokens.has(candidate) ||
            // Handle truncated UI pill text (ends with "…"): UI token is a prefix of BE candidate
            Array.from(keySpecificUiTokens).some(
              (uiToken) => uiToken.length >= 10 && candidate.startsWith(uiToken)
            )
        );

      if (!matchedByKey) {
        missingFacetValues.push(rawValue);
      }
    }
  }

  return {
    matches: missingFacetValues.length === 0,
    missingFacetValues,
  };
}

function compareUiSelectedFiltersWithFacetsByExpectedValue(
  expectedValue: string,
  facets: Record<string, any>,
  uiSelectedFiltersKV: Record<string, string[]>
): {
  matches: boolean;
  missingFacetValues: string[];
} {
  const normalizedExpected = normalizeFacetToken(expectedValue || "");
  if (!normalizedExpected) {
    return {
      matches: false,
      missingFacetValues: ["empty-expected-filter-value"],
    };
  }

  const backendEquipmentValues = collectPrimitiveFacetValues(facets?.equipment);
  const uiEquipmentValues = uiSelectedFiltersKV?.equipment || [];

  const expectedCandidates = buildFacetCandidateTokens(expectedValue);
  const backendTokens = new Set(
    backendEquipmentValues.flatMap((value) => buildFacetCandidateTokens(value))
  );
  const uiTokens = new Set(
    uiEquipmentValues.flatMap((value) => buildFacetCandidateTokens(value))
  );

  const matchesTokenSet = (tokens: Set<string>): boolean =>
    expectedCandidates.some(
      (candidate) =>
        tokens.has(candidate) ||
        Array.from(tokens).some(
          (token) => token.length >= 10 && candidate.startsWith(token)
        )
    );

  const matchesBackend = matchesTokenSet(backendTokens);
  const matchesUi = matchesTokenSet(uiTokens);

  const missingFacetValues: string[] = [];
  if (!matchesBackend) {
    missingFacetValues.push(`be:equipment missing '${expectedValue}'`);
  }
  if (!matchesUi) {
    missingFacetValues.push(`ui:equipment missing '${expectedValue}'`);
  }

  return {
    matches: missingFacetValues.length === 0,
    missingFacetValues,
  };
}

async function extractUiSelectedFilters(page: Page): Promise<Record<string, string[]>> {
  try {
    console.debug("[DEBUG] Attempting to extract selected filters from UI...");
    const resetButtonVisible = await page
      .locator("#emh-selected-filters-reset-button")
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => false);
    if (resetButtonVisible) {
      console.debug("[DEBUG] Selected filters reset button visible, proceeding to extract selected filters...");
    } else {
      console.debug("[DEBUG] Selected filters reset button not visible, continuing with pill-based extraction...");
    }

    const selectors = [".emh-selected-filters__pill", ".selected-filters__pill"];

    for (const selector of selectors) {
      console.debug(`[DEBUG] Checking for filter pills with selector "${selector}"...`);
      const pills = page.locator(selector);
      const firstVisible = await pills.first().isVisible().catch(() => false);
      if (!firstVisible) {
        break;
      }

      const count = await pills.count().catch(() => 0);
      if (count === 0) {
        continue;
      }

      console.debug(`[DEBUG] Found ${count} filter pills with selector "${selector}"`);

      // Extract each pill's text individually for better accuracy
      const pillTexts: string[] = [];
      for (let i = 0; i < count; i++) {
        const pill = pills.nth(i);
        const innerText = await pill.innerText().catch(() => "");
        const normalizedInnerText = innerText.replace(/\s+/g, " ").trim();
        // If the pill innerText ends with ":" (no value captured), try several
        // alternative sources to find the value: aria-label, data attributes,
        // child elements that may contain the value in a separate node.
        if (/:\s*$/.test(normalizedInnerText)) {
          const recovered: string = await pill.evaluate((el) => {
            // 1. aria-label on the pill itself
            const ariaLabel = el.getAttribute("aria-label") || "";
            if (ariaLabel) return ariaLabel;
            // 2. data-value / data-label attributes
            const dataValue = el.getAttribute("data-value") || el.getAttribute("data-label") || "";
            if (dataValue) return dataValue;
            // 3. Walk all descendants; innerText misses elements with certain CSS
            //    (e.g. display:contents). Collect text from every element.
            const all = el.querySelectorAll("*");
            for (const child of Array.from(all)) {
              const t = ((child as HTMLElement).innerText || (child as HTMLElement).textContent || "").trim();
              if (t && !t.includes("\n") && t !== "×" && t !== "x" && t !== "X") {
                // Return first non-colon-only, non-close-button text that contains more than label
                const colon = t.indexOf(":");
                if (colon >= 0 && t.slice(colon + 1).trim()) return t;
              }
            }
            // 4. Walk all text nodes including those inside shadow DOM fragments
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            const parts: string[] = [];
            let node = walker.nextNode();
            while (node) {
              const t = (node.nodeValue || "").trim();
              if (t && t !== "×" && t !== "x" && t !== "X") parts.push(t);
              node = walker.nextNode();
            }
            return parts.join(" : ");
          }).catch(() => "");
          const normalizedRecovered = recovered.replace(/\s+/g, " ").trim();
          pillTexts.push(normalizedRecovered.length > normalizedInnerText.length ? normalizedRecovered : innerText);
        } else {
          pillTexts.push(innerText);
        }
      }

      console.debug(`[DEBUG] Extracted filter texts: ${JSON.stringify(pillTexts)}`);

      const normalizedTexts = pillTexts
        .map((text) => text.replace(/\s+/g, " ").trim())
        .filter((text) => text.length > 0);

      if (normalizedTexts.length > 0) {
        console.debug(`[DEBUG] Normalized filter texts: ${JSON.stringify(normalizedTexts)}`);
        const result = parseUiSelectedFiltersToKeyValue(normalizedTexts);
        console.debug(`[DEBUG] Parsed filter result: ${JSON.stringify(result)}`);
        return result;
      }
    }

    return {};
  } catch (e: any) {
    if (e?.message?.includes("Target page, context or browser has been closed")) {
      console.debug("[DEBUG] Page closed during filter extraction, returning empty filters");
    } else {
      console.warn("[DEBUG] Error extracting UI selected filters:", e);
    }
    return {};
  }
}

export async function processAndLogUiResult({
  query,
  results,
  testDescribe,
  testTitle,
  customEval,
  page,
}: {
  query: any;
  results: UiSearchResult;
  testDescribe: string;
  testTitle: string;
  customEval?: (resultText: string) => Promise<string>;
  page?: Page;
}): Promise<any> {
  const testFacets = process.env.TEST_FACETS === "true";
  const actualInput = query?.value ?? query;
  const actualFacets = query?.shouldFilter;
  const aiEvaluationHints = query?.aiEvaluationHints;
  const smartSearchMessage = results.results.resultText;
  const apiResponse = results.results.responseData;
  const uiSelectedFiltersKV: Record<string, string[]> =
    results.results?.uiSelectedFiltersKV || {};
  const resultsFacets = (() => {
    const params = results.results.responseData?.data?.smartSearch?.parameters || {};
    const excludeKeys = [
      "contextType",
      "isUcos",
      "limit",
      "sortingType",
      "language",
      "profileId",
      "vehicleCategory",
      "__typename"
    ];
    return Object.fromEntries(
      Object.entries(params).filter(([key]) => !excludeKeys.includes(key))
    );
  })();
  let openaiEvaluation = (
    customEval
      ? await customEval(smartSearchMessage)
      : await evaluateSearchResult(smartSearchMessage, aiEvaluationHints, actualInput)
  )?.trim();
  let resultCount = 0;
  let hasError = false;
  let uiFacetComparison: {
    matches: boolean;
    missingFacetValues: string[];
  } | null = null;
  const lang = process.env.LANGUAGE?.toLocaleLowerCase() || "en";
  const addFailureReason = (reason: string) => {
    const normalizedEvaluation = (openaiEvaluation || "").trim();
    if (!normalizedEvaluation || normalizedEvaluation.toUpperCase() === "PASS") {
      openaiEvaluation = reason;
    } else if (!normalizedEvaluation.includes(reason)) {
      openaiEvaluation = `${normalizedEvaluation} | ${reason}`;
    }
    hasError = true;
  };

  // Handle the new Smart Search + Actual Search response structure
  const searchResults =
    process.env.API_ENDPOINT_LOCAL === "true"
      ? apiResponse?.searchResults
      : apiResponse?.data?.smartSearch;
  if (searchResults) {
    resultCount =
      searchResults.navigation?.totalResults ||
      searchResults.results?.length ||
      0;
  } 

  // Extract UI vehicle count if page is provided
  let uiVehicleCount: number | null = null;
  if (page) {
    try {
      const uiCountElement = page.locator('[data-test-id="srp__header-results__result-amount__number"]');
      const uiCountText = await uiCountElement.innerText();
      uiVehicleCount = parseInt(uiCountText.replace(/[^0-9]/g, ''), 10);
      if (isNaN(uiVehicleCount)) {
        uiVehicleCount = null;
      }
    } catch (e) {
      console.debug("[DEBUG] Could not extract UI vehicle count:", e);
    }
  }
  if (uiVehicleCount === 0 && resultCount > 0) {
    addFailureReason("UI is zero");
  }

  // Facets check (test-data vs BE)  
  if (actualFacets === false) {
    // shouldFilter: false — assert no filters were applied
    if (Object.keys(resultsFacets).length > 0) {
      addFailureReason(
        `Expected no filters, but got ${JSON.stringify(resultsFacets)}`
      );
    }
  } else if (actualFacets === true) {
    // shouldFilter: true — assert at least one filter was applied
    if (Object.keys(resultsFacets).length === 0) {
      addFailureReason(`Expected at least one filter to be applied, but got none`);
    }
  } else if (testFacets && actualFacets && !deepEqual(resultsFacets, actualFacets, ["__typename"])) {
    addFailureReason(
      `Facets mismatch: expected ${JSON.stringify(actualFacets)}, got ${JSON.stringify(resultsFacets)}`
    );
  }

  // Facets check (Query vs UI vs BE)
  const facetMismatches: string[] = [];
  const isFacetEquipmentOnly = Object.keys(resultsFacets).length > 1 && resultsFacets.equipment;
  if (isFacetEquipmentOnly) {
    const apiEquipmentFacets: Array<{ formattedValue: string; value: string }> =
      apiResponse?.data?.smartSearch?.facets?.equipment?.values ?? [];
    const equipmentCodeToName = new Map<string, string>(
      apiEquipmentFacets.map((f) => [f.value, f.formattedValue])
    );
    const resolvedEquipment = (resultsFacets.equipment as string[]).map(
      (code: string) => equipmentCodeToName.get(code) ?? code
    );
    resultsFacets.equipment = resolvedEquipment;
  }
  uiFacetComparison = compareUiSelectedFiltersWithFacets(
    resultsFacets,
    uiSelectedFiltersKV
  );
  if (query?.facet === 'equipment') {
    uiFacetComparison = compareUiSelectedFiltersWithFacetsByExpectedValue(
      query.filterValue,
      resultsFacets,
      uiSelectedFiltersKV
    );
  }
  if (!uiFacetComparison.matches) {
    facetMismatches.push(
      `Filters Mismatch: missing ${JSON.stringify(
        uiFacetComparison.missingFacetValues
      )}, uiSelectedFiltersKV ${JSON.stringify(uiSelectedFiltersKV)}, beFacets ${JSON.stringify(resultsFacets)}`
    );
  }
  if (testFacets && facetMismatches.length > 0) {
    addFailureReason(facetMismatches.join(" | "));
  }

  // Validate language consistency between query and response using OpenAI
  let langCheckResult = "YES";
  try {
    const langCompletion = await openaiChatCompletion([
      { role: "system", content: "You are a linguistic expert. Evaluate if the two texts are of the same language." },
      { role: "user", content: `Text#1: '${actualInput}'\nText#2: '${smartSearchMessage}'\nRespond with 'YES' only if they are the same language, otherwise respond with 2-digit language code of Text#1 and Text#2.` }
    ], {
      max_tokens: 10,
      temperature: 0.2
    });
    langCheckResult = langCompletion.choices?.[0]?.message?.content?.trim().toUpperCase() || "NO";
  } catch (error: any) {
    console.warn(`[WARN] OpenAI language validation skipped: ${error?.message || error}`);
    // Skip validation if OpenAI is unavailable (quota/network issues)
    langCheckResult = "YES";
  }
  if (!isLanguageConsistencyAccepted(langCheckResult)) {
    console.debug("[DEBUG] Language consistency check: FAIL");
    addFailureReason(`Language Inconsistency - '${langCheckResult}'`);
  }

  const normalizedEvaluation = (openaiEvaluation || "").trim();
  const evaluationPassed = normalizedEvaluation.toUpperCase() === "PASS";
  const displayHasError = hasError || !evaluationPassed;

  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${displayHasError ? "❌ FAIL |" : "✅"} ${openaiEvaluation} | ${testTitle}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Query:         '${actualInput}'`);
  console.log(`Response:      '${smartSearchMessage}'`);
  console.log(
    `UI Filters:    '${JSON.stringify(uiSelectedFiltersKV)}'`
  );
  let queryEn = actualInput;
  let smartSearchMessageEn = smartSearchMessage;
  if (lang !== "en") {
    queryEn = await fetchTranslation(actualInput, "en");
    smartSearchMessageEn = await fetchTranslation(
      smartSearchMessage,
      "en"
    );
    console.log(`Query (EN):    '${queryEn}'`);
    console.log(`Response (EN): '${smartSearchMessageEn}'`);
  }
  console.log("\n");

  return {
    timestamp: new Date().toISOString(),
    timestampSG: new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    }),
    testMode: "ui",    
    testDescribe,
    testTitle,
    query: {
      [`${lang}`]: actualInput,
      "en": queryEn,
    },
    response: {
      [`${lang}`]: smartSearchMessage,
      "en": smartSearchMessageEn,
    },
    resultCount,
    uiVehicleCount,
    responseTime: results.responseTime,
    statusCode: null,
    hasError: displayHasError,
    error: results.error,
    // apiResponse,
    openaiEvaluation,
    facets: resultsFacets,
    uiSelectedFiltersKV,
    uiFacetComparison,
  };
}

export async function setupContextAndPage(browser?: Browser): Promise<Page> {
  const country = COUNTRY || "KR";
  const env = ENVIRONMENT || "PROD";  
  let httpCredentials;
  
  if (ENVIRONMENT === "INT") {
    if (
      process.env.PROJECT === "DCP" &&
      process.env.DCP_USER_INT &&
      process.env.DCP_PASS_INT
    ) {
      httpCredentials = {
        username: process.env.DCP_USER_INT,
        password: process.env.DCP_PASS_INT,
      };
    } else if (process.env.AEM_USER_INT && process.env.AEM_PASS_INT) {
      httpCredentials = {
        username: process.env.AEM_USER_INT,
        password: process.env.AEM_PASS_INT,
      };
    }
  } else if (
    ENVIRONMENT === "PREPROD" &&
    process.env.AEM_USER_PREPROD &&
    process.env.AEM_PASS_PREPROD
  ) {
    httpCredentials = {
      username: process.env.AEM_USER_PREPROD,
      password: process.env.AEM_PASS_PREPROD,
    };
  }
  const cdpUrl = process.env.PLAYWRIGHT_CDP_URL || process.env.CDP_URL;
  let context;
  if (cdpUrl) {
    console.log(`Connecting to existing browser via CDP: ${cdpUrl}`);
    const attachedBrowser = await chromium.connectOverCDP(cdpUrl);
    const existingContexts = attachedBrowser.contexts();
    context =
      existingContexts.length > 0
        ? existingContexts[0]
        : await attachedBrowser.newContext({
            viewport: { width: 1920, height: 1080 },
          });
    if (httpCredentials) {
      console.warn(
        "httpCredentials cannot be applied when attaching to an existing persistent context. Proceeding without them."
      );
    }
  } else {
    if (!browser) {
      throw new Error(
        "Browser fixture is required when PLAYWRIGHT_CDP_URL is not set."
      );
    }
    const isHeadlessMode =
      process.env.PLAYWRIGHT_EFFECTIVE_HEADLESS === "true";
    context = await browser.newContext({
      viewport: isHeadlessMode ? { width: 1920, height: 1080 } : null,
      deviceScaleFactor: undefined,
      ...(httpCredentials ? { httpCredentials } : {}),
    });
  }
  const page = await context.newPage();

  // Intercept and override the response payload only if OVERRIDE_CONFIG_FILE is set to 'true'
  if (process.env.OVERRIDE_CONFIG_FILE === 'true') {
    await page.route(
      (urlObj: URL) => {
        const url = urlObj.toString();
        // Use the value from the 'country' variable for the config file match
        const countryCode = country.toLowerCase();
        const configRegex = new RegExp(`config_${countryCode}\\.json$`, 'i');
        return (
          url.includes('emh-dcps-mrktplc-vehicles-configuration') &&
          configRegex.test(url)
        );
      },
      async (route) => {
        const response = await route.fetch();
        const originalPayload = await response.json();

        // Modify the payload
        const modifiedPayload = {
          ...originalPayload,
          srp: {
            ...originalPayload.srp,
            enableSmartSearch: true,
            availableCategories: Array.isArray(
              originalPayload.srp.availableCategories
            )
              ? [
                  {
                    ...originalPayload.srp.availableCategories[0],
                    enableSmartSearch: true,
                  },
                  ...originalPayload.srp.availableCategories.slice(1),
                ]
              : originalPayload.srp.availableCategories,
          },
        };

        // Fulfill the route with the modified payload
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(modifiedPayload),
        });
      }
    );
  }

  // Dynamically select URL file based on PROJECT
  let urlFilePath = "./tests/data/emh-urls.json";
  if (process.env.PROJECT === "DCP") {
    urlFilePath = "./tests/data/dcp-urls.json";
  } else if (process.env.PROJECT === "EMH") {
    urlFilePath = "./tests/data/emh-urls.json";
  }
  const urlsFile = await fs.readFile(urlFilePath, "utf-8");
  const urls = JSON.parse(urlsFile);
  let url = urls[country]?.[env];
  if (!url) {
    // fallback to Korea PROD if not found
    url =
      urls["KR"]?.["PROD"] ||
      "https://www.mercedes-benz.co.kr/passengercars/buy/new-car/search-results.html";
  }
  // Adjust path for PRODUCT
  if (PRODUCT === "NCOS") {
    url = url.replace(/\/used-car\//, "/new-car/");
  } else if (PRODUCT === "UCOS") {
    url = url.replace(/\/new-car\//, "/used-car/");
  }
  await page.goto(url);
  await Promise.all([
    handleCookieBanner(page),
    handlePostalCodePopUp(page)
  ]);
  return page;
}

export async function handleCookieBanner(page: Page): Promise<void> {
  try {
    await page
      .locator(".cmm-cookie-banner__content")
      .waitFor();
    await page.click(".button--accept-all");
    console.debug("[DEBUG] Cookie banner accepted.");
  } catch (e) {
    console.debug("[DEBUG] Cookie banner not visible, continuing execution...");
  }
}

export async function handlePostalCodePopUp(page: Page): Promise<void> {
  try {
    const trigger = page.locator('[data-test-id="header-integration-item-emh-region-picker"]');
    await trigger.waitFor({ state: "visible", timeout: 30000 }).catch(() => false);
    if (!await trigger.isVisible().catch(() => false)) {
      console.debug("[DEBUG] Region picker trigger not visible, skipping postal code pop-up handling.");
      return;
    }

    const popup = page.locator('[data-test-id="region-picker-module-flyout"]');
    const regionPicker = popup.locator("dh-io-emh-region-picker");

    const country = COUNTRY || "KR";
    const addressesFile = await fs.readFile(
      "./tests/data/emh-addresses.json",
      "utf-8"
    );
    const addresses = JSON.parse(addressesFile);
    const postalCode = addresses[country]?.postalCode;

    if (!postalCode) {
      console.debug(
        `[DEBUG] No postal code configured for country '${country}', skipping region picker submission.`
      );
      return;
    }

    const postalCodeInput = popup
      .getByRole("textbox")
      .or(popup.getByRole("spinbutton"))
      .or(
        popup.locator(
          'input[aria-invalid], input[inputmode], input[type="text"], input[type="number"]'
        )
      )
      .first();
    const submitButton = popup.locator(".region-picker-content__submit-button");

    if (await trigger.isVisible({ timeout: 10000 }).catch(() => false)) {
      const isExpanded = await trigger.getAttribute("aria-expanded").catch(() => null);
      if (isExpanded !== "true") {
        await trigger.click().catch((e) => {
          console.debug(`[DEBUG] Trigger click failed: ${e?.message || e}`);
        });
      }
    }

    await popup.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await regionPicker.waitFor({ state: "attached", timeout: 10000 }).catch(() => {});
    await postalCodeInput.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await postalCodeInput.fill("").catch(() => {});
    await postalCodeInput.fill(postalCode).catch(() => {});
    await submitButton.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await submitButton.click().catch(() => {});
  } catch (e: any) {
    if (e?.message?.includes("Target page, context or browser has been closed")) {
      console.debug("[DEBUG] Page closed during postal code pop-up handling, continuing...");
    } else {
      console.debug(
        `[DEBUG] Postal code pop-up handling skipped: ${e instanceof Error ? e.message : e}`
      );
    }
  }
}

export async function performUISmartSearchAndGetResults(
  page: Page,
  query: any = "",
  submitDisabled: boolean = false
): Promise<UiSearchResult> {
  const env = process.env.ENVIRONMENT || "INT";
  const searchButton = page.locator(
    ".smart-search__input.wb-input wb7-input-action div[data-on='contrast'] button"
  );
  console.debug("[DEBUG] Waiting for search button to be visible...");
  await searchButton.waitFor({ state: "visible" });
  for (let j = 0; j < 10; j++) {
    const enabled = await searchButton.isEnabled();
    console.debug(
      `[DEBUG] Search button enabled: ${enabled} (attempt ${j + 1}/10)`
    );
    if (enabled) break;
    await page.waitForTimeout(1000);
  }

  const actualInput = query?.value ?? query;
  const input = page.locator(
    "wb7-input.smart-search__input wb7-grey-box input"
  );
  console.debug(`[DEBUG] Filling input with: '${actualInput}'`);
  await input.fill(" ");
  await input.fill(actualInput);

  if (submitDisabled) {
    const isDisabled = !(await searchButton.isEnabled());
    let notClickable = false;
    try {
      await searchButton.click({ trial: true, timeout: 1000 });
    } catch (e) {
      notClickable = true;
    }
    console.debug(
      `[DEBUG] Submit disabled check: isDisabled=${isDisabled}, notClickable=${notClickable}`
    );
    if (isDisabled && notClickable) {
      console.debug("[DEBUG] PASSED: Submit Button Disabled");
      return {
        query: query,
        results: "[Script] PASSED: Submit Button Disabled",
        responseTime: 0,
        error: undefined,
      };
    } else {
      console.debug("[DEBUG] FAILED: Submit Button Enabled");
      return {
        query: query,
        results: "[Script] FAILED: Submit Button Enabled",
        responseTime: 0,
        error: "Submit button was enabled when it should be disabled",
      };
    }
  }

  const endpoint =
    process.env.API_ENDPOINT_LOCAL === "true"
      ? "http://localhost:8080/api/v2/search"
      : env?.toUpperCase() === "PROD"
      ? "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql"
      : env?.toUpperCase() === "INT"
      ? "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql"
      : "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";

  let apiResponsePayload: any[] = [];
  let responseCaptured = false;
  let responseCapturedPromiseResolve: (() => void) | null = null;
  const responseCapturedPromise = new Promise<void>((resolve) => {
    responseCapturedPromiseResolve = resolve;
  });
  const responseListener = async (response: any) => {
    try {
      if (
        response.url().includes(endpoint) &&
        response.request().method() === "POST"
      ) {
        // console.info("[DEBUG] API response received from endpoint:", endpoint);
        apiResponsePayload = await response.json();
        responseCaptured = true;
        if (responseCapturedPromiseResolve) responseCapturedPromiseResolve();
      }
    } catch (e) {
      console.warn("[DEBUG] Failed to capture API response payload:", e);
    }
  };
  page.on("response", responseListener);

  if (await searchButton.isVisible()) await searchButton.click();

  let retries = 0;
  let resultText = "";
  const startTime = Date.now();
  const successResultLocator = page.locator(".smart-search__bubble p");
  const errorResultLocator = page.locator(".smart-search__notification.wbx-notification--error .wbx-notification__content");
  while (retries < 3) {
    try {
      console.debug(
        `[DEBUG] Waiting for results to be visible (attempt ${
          retries + 1
        }/3)...`
      );
      await successResultLocator.waitFor({ state: "visible", timeout: 10000 }).catch(() => false);
      if (await successResultLocator.isVisible()) {
        resultText = await successResultLocator.innerText();
        break;
      }

      const errorVisible = await errorResultLocator
        .isVisible()
        .catch(() => false);
      if (errorVisible) {
        resultText = await errorResultLocator.innerText();
        console.warn(`[DEBUG] UI showing internal error message: '${resultText}'`);
        break;
      }      
    } catch (e) {
      console.info(`[DEBUG] Error waiting for results: ${e}`);
      retries++;
      console.debug(
        `[DEBUG] Retrying search button click (attempt ${retries + 1}/3)...`
      );
      if (await searchButton.isVisible().catch(() => false)) {
        await searchButton.click();
      }
    }
  }

  const responseTime = Date.now() - startTime;
  const uiSelectedFiltersKV = await extractUiSelectedFilters(page);
  // Wait for responseListener to capture a response (max 30s)
  if (!responseCaptured) {
    try {
      await Promise.race([
        responseCapturedPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for API response")), 30000)),
      ]);
    } catch (e) {
      return {
        query: query,
        results: {
          resultText,
          responseData: null,
          uiSelectedFiltersKV,
        },
        responseTime,
        error: "Failed to capture API response within timeout",
      };
    }
  }
  return {
    query: query,
    results: {
      resultText,
      responseData: apiResponsePayload,
      uiSelectedFiltersKV,
    },
    responseTime,
    error: retries === 3 ? "Failed to retrieve results after 3 attempts" : undefined,
  };
}
