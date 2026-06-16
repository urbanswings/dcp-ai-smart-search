import { Browser, Page } from "@playwright/test";
import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import {
  evaluateSearchResult,
  fetchTranslation,
  openaiChatCompletion,
} from "./aiHelpers";
import { deepEqual, isLanguageConsistencyAccepted } from "./shared";
import {
  buildFacetValueDisplayMap,
  extractResponseFacets,
  formatExpectedFacetValues,
} from "./facetDisplayHelpers";

export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const LANGUAGE = process.env.LANGUAGE;
export const PRODUCT = process.env.PRODUCT;

const FACETS_MASTER_DATA_PATH = path.resolve(
  __dirname,
  "../data/facets-master-data.json"
);
let facetsMasterDataCache: any | null = null;

async function getFacetsMasterData(): Promise<any> {
  if (facetsMasterDataCache) return facetsMasterDataCache;
  try {
    const content = await fs.readFile(FACETS_MASTER_DATA_PATH, "utf-8");
    facetsMasterDataCache = JSON.parse(content);
  } catch {
    facetsMasterDataCache = {};
  }
  return facetsMasterDataCache;
}

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
    // Re-compose characters so Hangul syllables (e.g. 세단) are preserved
    // before the allow-list regex below.
    .normalize("NFC")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/^paint[_-]?color[_-]?/i, "")
    .replace(/^upholstery[_-]?color[_-]?/i, "")
    .replace(/[^a-z0-9가-힣ぁ-ゖァ-ヺー一-龯]/g, "");
}

// Color name translations for multi-language support
const colorTranslations: Record<string, string> = {
  // Korean transliterations
  "화이트": "white",
  "블랙": "black",
  "그레이": "grey",
  "레드": "red",
  "블루": "blue",
  "실버": "silver",
  "베이지": "beige",
  "브라운": "brown",
  // Korean native
  "흰색": "white",
  "하얀색": "white",
  "검정": "black",
  "검은색": "black",
  "회색": "grey",
  "은색": "silver",
  "빨간색": "red",
  "파란색": "blue",
  // Turkish
  "beyaz": "white",
  "siyah": "black",
  "gri": "grey",
  "gumus": "silver",
  "kirmizi": "red",
  "mavi": "blue",
  "kahverengi": "brown",
  "bej": "beige",
  "gümüş": "silver",
  // Thai native color names
  "ดำ": "black",
  "ขาว": "white",
  "เทา": "grey",
  "เงิน": "silver",
  "แดง": "red",
  "น้ำเงิน": "blue",
  "เขียว": "green",
  "เหลือง": "yellow",
  "น้ำตาล": "brown",
  "เบจ": "beige",
};

function translateColorName(value: string): string {
  const normalized = normalizeFacetToken(value);
  return colorTranslations[normalized] || normalized;
}

function collectPrimitiveFacetValues(value: any): string[] {
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
  "diesel": ["dizel", "디젤", "경유"],
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
  // TR color display names for upholstery/interior
  "bej": ["beige"],
  "beige": ["bej"],
  "kahverengi": ["brown"],
  "brown": ["kahverengi"],
  // KR color/body-type display names -> BE codes
  "세단": ["limousine"],
  "쿠페": ["coupe"],
  "왜건": ["station", "estate"],
  "해치백": ["hatchback", "hatches"],
  // JP body type display names -> BE codes
  "セダン": ["limousine"],
  "クーペ": ["coupe"],
  "ステーションワゴン": ["station", "estate"],
  // KR native color names
  "검정": ["black"],
  "검은색": ["black"],
  "흰색": ["white"],
  "하얀색": ["white"],
  "은색": ["silver", "grey", "gray"],
  "회색": ["grey", "gray"],
  "빨간색": ["red"],
  "파란색": ["blue"],
  // KR color transliterations (from API facets)
  "화이트": ["white"],
  "블랙": ["black"],
  "그레이": ["grey", "gray"],
  "레드": ["red"],
  "블루": ["blue"],
  "실버": ["silver"],
  "베이지": ["beige"],
  "브라운": ["brown"],
  "가솔린": ["petrol"],
  "휘발유": ["petrol"],
  "디젤": ["diesel"],
  "경유": ["diesel"],
  "전기": ["electric"],
  "하이브리드": ["petrolelectricpluginhybrid", "pluginhybridpetrol"],
  // KR body type UI text variants
  "카브리올레로드스터": ["cabrioroadster", "cabrioletroadster"],
  "카브리올레": ["cabrioroadster", "cabrioletroadster"],
  // Thai fuel type translations
  "ดีเซล": ["diesel"],
  "เบนซิน": ["petrol"],
  "ไฟฟ้า": ["electric"],
  "ปลั๊กอินไฮบริด": ["petrolelectricpluginhybrid", "pluginhybridpetrol"],
  "ดีเซล/ไฟฟ้า": ["dieselelectricpluginhybrid"],
  "ดีเซลปลั๊กอินไฮบริด": ["dieselelectricpluginhybrid"],
  // Thai body type translations
  "ลิมูซีน": ["limousine", "sedan", "saloon"],
  "คูเป้": ["coupe"],
  "เอสยูวี": ["suv", "suvoffroader"],
  "คาบริโอเล": ["cabrioroadster", "cabrioletroadster"],
  "รถตู้": ["peoplecarrier"],
  "saloon": ["limousine", "sedan"],
  // Thai transmission type translations
  "อัตโนมัติ": ["automatic"],
  "เกียร์ธรรมดา": ["manual"],
  "ธรรมดา": ["manual"],
};

let runtimeFacetValueAliasMap: Record<string, string[]> = {};

function addAlias(aliasMap: Record<string, string[]>, from: string, to: string): void {
  if (!from || !to || from === to) return;
  if (!aliasMap[from]) aliasMap[from] = [];
  if (!aliasMap[from].includes(to)) {
    aliasMap[from].push(to);
  }
}

function updateRuntimeFacetAliasesFromApiResponse(apiResponse: any): void {
  runtimeFacetValueAliasMap = {};
  const apiFacets = apiResponse?.data?.search?.facets || apiResponse?.data?.smartSearch?.facets || {};

  for (const facet of Object.values(apiFacets) as any[]) {
    const values = facet?.values;
    if (!Array.isArray(values)) continue;

    for (const item of values) {
      if (!item || typeof item !== "object") continue;
      const beValue = typeof item.value === "string" ? item.value : "";
      const formattedValue = typeof item.formattedValue === "string" ? item.formattedValue : "";

      const normalizedBe = normalizeFacetToken(beValue);
      const normalizedFormatted = normalizeFacetToken(formattedValue);
      if (!normalizedBe || !normalizedFormatted) continue;

      addAlias(runtimeFacetValueAliasMap, normalizedFormatted, normalizedBe);
      addAlias(runtimeFacetValueAliasMap, normalizedBe, normalizedFormatted);
    }
  }

  // KR body type values often appear as UI text without formattedValue in facet payload.
  addAlias(runtimeFacetValueAliasMap, "카브리올레로드스터", "cabrioroadster");
  addAlias(runtimeFacetValueAliasMap, "cabrioroadster", "카브리올레로드스터");
}

function buildFacetCandidateTokens(rawValue: string): string[] {
  const candidates = new Set<string>();
  const combinedAliasMap: Record<string, string[]> = {
    ...facetValueAliasMap,
    ...runtimeFacetValueAliasMap,
  };
  const normalizedRaw = normalizeFacetToken(rawValue);
  if (normalizedRaw) {
    candidates.add(normalizedRaw);
    for (const alias of combinedAliasMap[normalizedRaw] || []) {
      candidates.add(alias);
    }
  }

  if (rawValue.includes("_")) {
    const lastToken = rawValue.split("_").pop() || rawValue;
    const normalizedLastToken = normalizeFacetToken(lastToken);
    if (normalizedLastToken) {
      candidates.add(normalizedLastToken);
      for (const alias of combinedAliasMap[normalizedLastToken] || []) {
        candidates.add(alias);
      }
    }
  }

  return Array.from(candidates);
}

function mapUiLabelToFacetKey(label: string): string | null {
  const compactRawLabel = label
    .toLowerCase()
    .replace(/[：:]/g, "")
    .replace(/\s+/g, "");

  const rawLabelMap: Record<string, string> = {
    "바디타입": "bodyType",
    "차체타입": "bodyType",
    "ボディタイプ": "bodyType",
    "연료타입": "fuelType",
    "연료유형": "fuelType",
    "燃料タイプ": "fuelType",
    "모델": "modelIdentifier",
    "모델클래스": "modelIdentifier",
    "모델라인": "modelIdentifier",
    "モデル": "modelIdentifier",
    "브랜드": "brand",
    "ブランド": "brand",
    "색상": "color",
    "色": "color",
    "내장색상": "upholstery",
    "内装色": "upholstery",
    "연식": "modelYear",
    "年式": "modelYear",
    "가격": "price",
    "価格": "price",
    "차량": "brand",
    "옵션사양": "equipment",
    "装備": "equipment",
    // Thai UI label mappings
    "ประเภทรถ": "bodyType",
    "ประเภทเชื้อเพลิง": "fuelType",
    "รุ่น": "modelIdentifier",
    "แบรนด์": "brand",
    "ยี่ห้อ": "brand",
    "สี": "color",
    "สีภายใน": "upholstery",
    "ปีรุ่น": "modelYear",
    "ราคา": "price",
    "อุปกรณ์": "equipment",
    "เกียร์": "gearbox",
    "ระยะทาง": "mileage",
  };

  if (rawLabelMap[compactRawLabel]) {
    return rawLabelMap[compactRawLabel];
  }

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

function mapUiDataTestIdToFacetKey(dataTestId: string | null): string | null {
  if (!dataTestId) {
    return null;
  }

  const normalizedDataTestId = dataTestId.trim();
  // Examples:
  // - emh-selected-filters-tag__upholstery-UPHOLSTERY_COLOR_BEIGE
  // - emh-selected-filters-tag__modelIdentifier-GLS
  // - emh-selected-filters-tag__price
  const match = normalizedDataTestId.match(/tag__([A-Za-z0-9_]+)(?:-|$)/);
  const rawFacetKey = match?.[1] || "";
  if (!rawFacetKey) {
    return null;
  }

  const canonicalFacetKeyMap: Record<string, string> = {
    brand: "brand",
    bodytype: "bodyType",
    modelidentifier: "modelIdentifier",
    motorization: "motorization",
    fueltype: "fuelType",
    color: "color",
    upholstery: "upholstery",
    modelyear: "modelYear",
    price: "price",
    equipment: "equipment",
    availability: "availability",
  };

  const normalizedFacetKey = normalizeFacetToken(rawFacetKey);
  return canonicalFacetKeyMap[normalizedFacetKey] || mapUiLabelToFacetKey(rawFacetKey);
}

type UiSelectedFilterPill = {
  text: string;
  facetKeyHint?: string | null;
};

function parseUiSelectedFiltersToKeyValue(
  uiSelectedFilters: UiSelectedFilterPill[]
): Record<string, string[]> {
  const keyValueFilters: Record<string, string[]> = {};
  const seenValuesByFacetKey: Record<string, Set<string>> = {};

  for (const filterPill of uiSelectedFilters) {
    const cleanText = filterPill.text.replace(/\s+/g, " ").trim();
    const colonIndex = cleanText.search(/[:：]/);
    if (colonIndex < 0) {
      continue;
    }

    const label = cleanText.slice(0, colonIndex).trim();
    let value = cleanText.slice(colonIndex + 1).trim();
    
    // Remove trailing "X" (close button) from the value
    value = value.replace(/\s*X\s*$/i, "").trim();
    // Strip artefact colons produced by the tree-walker joining label+separator text nodes
    value = value.replace(/^[:\s]+|[:\s]+$/g, "").trim();
    
    const mappedFacetKey = mapUiLabelToFacetKey(label);
    const facetKey = filterPill.facetKeyHint || mappedFacetKey;
    if (!facetKey) {
      continue;
    }

    // Always register the key so the empty-key guard in comparison fires.
    if (!keyValueFilters[facetKey]) {
      keyValueFilters[facetKey] = [];
      seenValuesByFacetKey[facetKey] = new Set<string>();
    }

    if (!value) {
      // Pill is present but value is empty (e.g. "Marka :") — key is registered
      // with an empty array so compareUiSelectedFiltersWithFacets skips it.
      continue;
    }

    const normalizedValue = normalizeFacetToken(value);
    if (normalizedValue && seenValuesByFacetKey[facetKey]?.has(normalizedValue)) {
      continue;
    }

    if (normalizedValue) {
      seenValuesByFacetKey[facetKey]?.add(normalizedValue);
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
  uiSelectedFiltersKV: Record<string, string[]>,
  facetKey: string = "equipment"
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

  const backendFacetValues = collectPrimitiveFacetValues(facets?.[facetKey]);
  const uiFacetValues = uiSelectedFiltersKV?.[facetKey] || [];

  const expectedCandidates = buildFacetCandidateTokens(expectedValue);
  const backendTokens = new Set(
    backendFacetValues.flatMap((value) => buildFacetCandidateTokens(value))
  );
  const uiTokens = new Set(
    uiFacetValues.flatMap((value) => buildFacetCandidateTokens(value))
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
    missingFacetValues.push(`be:${facetKey} missing '${expectedValue}'`);
  }
  if (!matchesUi) {
    missingFacetValues.push(`ui:${facetKey} missing '${expectedValue}'`);
  }

  return {
    matches: missingFacetValues.length === 0,
    missingFacetValues,
  };
}

async function extractUiSelectedFilters(page: Page): Promise<Record<string, string[]>> {
  try {
    const resetButtonVisible = await page
      .locator("#emh-selected-filters-reset-button")
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => false);

    const showMoreButton = page.locator('[data-test-id="emh-selected-filters-show-more"]');
    const showMoreVisible = await showMoreButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (showMoreVisible) {
      await showMoreButton.click().catch(() => {});
      console.debug("[DEBUG] Clicked 'Show More' to reveal additional selected filters");
    }

    const selectors = [
      "[data-test-id^='emh-selected-filters-tag__']",
      ".emh-selected-filters__pill",
      ".emh-selected-filters__tag",
      ".selected-filters__pill",
      ".selected-filters__item",
      "[class*='selected-filters'] [class*='pill']",
      "[class*='selected-filters'] [class*='chip']",
      "[class*='selected-filters'] [class*='tag']",
      "[data-testid*='selected-filters']",
      "[id*='selected-filters'] > [class*='tag']",
      "[id*='selected-filters'] > [class*='pill']",
    ];

    let bestParsedResult: Record<string, string[]> = {};
    let bestScore = 0;

    for (const selector of selectors) {
      const pills = page.locator(selector);
      const count = await pills.count().catch(() => 0);
      
      const firstVisible = await pills.first().isVisible({ timeout: 5000 }).catch(() => false);
      if (!firstVisible) {
        continue;
      }

      if (count === 0) {
        continue;
      }

      // Extract each pill's text individually for better accuracy
      const parsedPills: UiSelectedFilterPill[] = [];
      for (let i = 0; i < count; i++) {
        const pill = pills.nth(i);
        const dataTestId = await pill.getAttribute("data-test-id").catch(() => null);
        const facetKeyHint = mapUiDataTestIdToFacetKey(dataTestId);
        const innerText = await pill.innerText().catch(() => "");
        const normalizedInnerText = innerText.replace(/\s+/g, " ").trim();
        
        // If the pill innerText ends with ":" (no value captured), try several
        // alternative sources to find the value: aria-label, data attributes,
        // child elements that may contain the value in a separate node.
        if (/:\s*$/.test(normalizedInnerText)) {
          const recovered: string = await pill.evaluate((el) => {
            // 0. Brand logo: value rendered as <img> — read alt attribute
            const tagImg = el.querySelector(".emh-selected-filters__tag-image");
            if (tagImg) {
              const alt = tagImg.getAttribute("alt") || "";
              if (alt) return alt;
            }
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
          parsedPills.push({
            text:
              normalizedRecovered.length > normalizedInnerText.length
                ? normalizedRecovered
                : innerText,
            facetKeyHint,
          });
        } else {
          parsedPills.push({ text: innerText, facetKeyHint });
        }
      }

      const normalizedPills = parsedPills
        .map((pill) => ({
          text: pill.text.replace(/\s+/g, " ").trim(),
          facetKeyHint: pill.facetKeyHint,
        }))
        .filter((pill) => pill.text.length > 0);

      if (normalizedPills.length > 0) {
        const parsedResult = parseUiSelectedFiltersToKeyValue(normalizedPills);

        const parsedScore = Object.values(parsedResult).reduce(
          (sum, values) => sum + values.length,
          0
        );
        if (parsedScore > bestScore) {
          bestScore = parsedScore;
          bestParsedResult = parsedResult;
        }
      }
    }

    return bestParsedResult;
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
  page,
}: {
  query: any;
  results: UiSearchResult;
  testDescribe: string;
  testTitle: string;
  page: Page;
}): Promise<any> {
  const isPassEvaluation = (value: string): boolean => {
    const normalized = (value || "").trim();
    return normalized.toUpperCase() === "PASS";
  };

  const lang = LANGUAGE?.toLocaleLowerCase() || "en";
  const actualInput = query?.value ?? query;
  const actualFacets = query?.shouldFilter;
  
  if (results.error) {
    console.error(`UI call failed with error: ${results.error}`);
    return {
      testMode: "ui",
      testDescribe,
      testTitle,
      query: {
        [`${lang}`]: actualInput,
      },
      openaiEvaluation: `UI call failed with error: ${results.error}`,
      results: {
        responseResult: "FAIL",
        facetsResult: "FAIL",
      },
      hasError: true,
    };
  }

  const testFacets = process.env.TEST_FACETS === "true";
  const aiEvaluationHints = query?.aiEvaluationHints;
  const smartSearchMessage = results.results.resultText;
  const apiResponse = results.results.responseData;
  updateRuntimeFacetAliasesFromApiResponse(apiResponse);
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
      "__typename",
      "page"
    ];
    return Object.fromEntries(
      Object.entries(params).filter(([key]) => !excludeKeys.includes(key))
    );
  })();
  let openaiEvaluation = "PASS";
  if (smartSearchMessage?.trim()) {
    openaiEvaluation = (
      await evaluateSearchResult(smartSearchMessage, aiEvaluationHints, actualInput)
    )?.trim();
  } else {
    openaiEvaluation = "Empty UI response message";
  }
  let resultCount = 0;
  let hasError = false;
  let responseCheckPassed = true;
  let facetsCheckPassed = true;
  let uiFacetComparison: {
    matches: boolean;
    missingFacetValues: string[];
  } | null = null;
  const addFailureReason = (reason: string) => {
    const normalizedEvaluation = (openaiEvaluation || "").trim();
    if (!normalizedEvaluation || normalizedEvaluation.toUpperCase() === "PASS") {
      openaiEvaluation = reason;
    } else if (!normalizedEvaluation.includes(reason)) {
      openaiEvaluation = `${normalizedEvaluation} | ${reason}`;
    }
    hasError = true;
  };

  if (!smartSearchMessage?.trim()) {
    responseCheckPassed = false;
    addFailureReason("UI response bubble text is empty");
  }

  if (!isPassEvaluation(openaiEvaluation)) {
    responseCheckPassed = false;
  }

  // Handle the new Smart Search + Actual Search response structure
  const searchResults = apiResponse?.data?.smartSearch;
  if (searchResults) {
    resultCount =
      searchResults.navigation?.totalResults ||
      searchResults.results?.length ||
      0;
  } 

  // Extract UI vehicle count if page is provided
  let uiVehicleCount: number | null = null;
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
  if (uiVehicleCount === 0 && resultCount > 0) {
    responseCheckPassed = false;
    addFailureReason("UI is zero");
  }

  // Basic check to see if payload is empty (could be due to errors or unexpected response structure)
  // But skip this check if facets are being validated (empty results can be valid for faceted queries)
  if (resultCount === 0 && !actualFacets) {
    responseCheckPassed = false;
    addFailureReason("Payload is zero");
  } else if (resultCount === 0 && actualFacets) {
    // Skip "Payload is zero" when facets are being validated
  }

  // Facets check (test-data vs BE)  
  if (actualFacets === false) {
    // shouldFilter: false — assert no filters were applied
    if (Object.keys(resultsFacets).length > 0) {
      facetsCheckPassed = false;
      addFailureReason(
        `Expected no filters, but got ${JSON.stringify(resultsFacets)}`
      );
    }
  } else if (actualFacets === true) {
    // shouldFilter: true — assert at least one filter was applied
    if (Object.keys(resultsFacets).length === 0) {
      facetsCheckPassed = false;
      addFailureReason(`Expected at least one filter to be applied, but got none`);
    }
  } else if (testFacets && actualFacets && typeof actualFacets === "object") {
    // New format: { include: [], exclude: [], strict: boolean }
    const include = actualFacets.include || [];
    const exclude = actualFacets.exclude || [];
    const strict = actualFacets.strict ?? false;
    const resultsKeys = Object.keys(resultsFacets);
    const resultsKeysSet = new Set(resultsKeys);
    
    // Flatten include into a set of allowed facet keys for strict mode.
    const includeKeys = new Set<string>();
    for (const filterObj of include) {
      for (const key of Object.keys(filterObj)) {
        includeKeys.add(key);
      }
    }
    
    let facetCheckPassed = true;
    const failureReasons: string[] = [];
    
    // Build UUID-to-semantic-name mapping from API facets for color/upholstery
    const uuidToSemanticMap: Record<string, Record<string, string>> = {};
    const responseData = results.results.responseData?.data || {};
    const facetsData = extractResponseFacets(responseData);
    const masterData = await getFacetsMasterData();
    const facetValueDisplayMap = buildFacetValueDisplayMap(facetsData, masterData || {});
    for (const facetKey of ["color", "upholstery"]) {
      if (facetsData[facetKey]?.values) {
        uuidToSemanticMap[facetKey] = {};
        for (const item of facetsData[facetKey].values) {
          if (item.value && item.formattedValue) {
            // Map UUID to translated semantic name (e.g., "화이트" -> "white")
            const translated = translateColorName(item.formattedValue);
            uuidToSemanticMap[facetKey][item.value.toUpperCase()] = translated.toLowerCase();
          }
        }
      }
    }
    
    // Check: all include key-value pairs must be present in resultsFacets
    for (const filterObj of include) {
      for (const [key, expectedValues] of Object.entries(filterObj)) {
        if (!resultsKeysSet.has(key)) {
          facetCheckPassed = false;
          if (Array.isArray(expectedValues) && expectedValues.length > 0) {
            failureReasons.push(
              `Missing required facet key: ${key} (expected value(s): ${formatExpectedFacetValues(key, expectedValues, facetValueDisplayMap)})`
            );
          } else {
            failureReasons.push(`Missing required facet key: ${key}`);
          }
          continue;
        }
        if (Array.isArray(expectedValues) && expectedValues.length > 0) {
          const actualValues = collectPrimitiveFacetValues(resultsFacets[key]);
          const rawActuals = new Set(
            actualValues.map((value) => String(value).trim().toUpperCase())
          );
          // For color/upholstery, map UUID values to their formattedValue from facets
          const semanticActuals = actualValues.map((v) => {
            const vStr = String(v).toUpperCase();
            if (uuidToSemanticMap[key]?.[vStr]) {
              return uuidToSemanticMap[key][vStr]; // already translated to lowercase
            }
            // If not a UUID, return as-is (translation happens in buildFacetCandidateTokens via aliases)
            return String(v);
          });
          
          // Build candidate tokens for all actual values (includes aliases)
          const actualCandidates = new Set<string>();
          for (const actual of semanticActuals) {
            const candidates = buildFacetCandidateTokens(actual);
            candidates.forEach(c => actualCandidates.add(c.toUpperCase()));
          }
          
          for (const expected of expectedValues) {
            const rawExpected = String(expected).trim().toUpperCase();
            if (rawActuals.has(rawExpected)) {
              continue;
            }

            // For color/upholstery facets, translate expected value first
            const processedExpected = ["color", "upholstery"].includes(key)
              ? translateColorName(String(expected))
              : String(expected);
            // Build candidate tokens for processed expected value (includes aliases)
            const expectedCandidates = buildFacetCandidateTokens(processedExpected);
            const hasMatch = expectedCandidates.some(candidate => 
              actualCandidates.has(candidate.toUpperCase())
            );
            
            if (!hasMatch) {
              facetCheckPassed = false;
              failureReasons.push(`Missing required facet value: ${key}=${expected}`);
            }
          }
        }
      }
    }

    // Check: no exclude key-value pairs should be present in resultsFacets
    for (const filterObj of exclude) {
      for (const [key, excludedValues] of Object.entries(filterObj)) {
        if (!resultsKeysSet.has(key)) continue;
        if (Array.isArray(excludedValues) && excludedValues.length > 0) {
          const actualValues = collectPrimitiveFacetValues(resultsFacets[key]);
          const rawActuals = new Set(
            actualValues.map((value) => String(value).trim().toUpperCase())
          );
          // For color/upholstery, map UUID values to their formattedValue from facets
          const semanticActuals = actualValues.map((v) => {
            const vStr = String(v).toUpperCase();
            if (uuidToSemanticMap[key]?.[vStr]) {
              return uuidToSemanticMap[key][vStr]; // already translated to lowercase
            }
            // If not a UUID, return as-is
            return String(v);
          });
          
          // Build candidate tokens for all actual values (includes aliases)
          const actualCandidates = new Set<string>();
          for (const actual of semanticActuals) {
            const candidates = buildFacetCandidateTokens(actual);
            candidates.forEach(c => actualCandidates.add(c.toUpperCase()));
          }
          
          for (const excluded of excludedValues) {
            const rawExcluded = String(excluded).trim().toUpperCase();
            if (rawActuals.has(rawExcluded)) {
              facetCheckPassed = false;
              failureReasons.push(`Excluded facet value present: ${key}=${excluded}`);
              continue;
            }

            // For color/upholstery facets, translate excluded value first
            const processedExcluded = ["color", "upholstery"].includes(key)
              ? translateColorName(String(excluded))
              : String(excluded);
            // Build candidate tokens for processed excluded value (includes aliases)
            const excludedCandidates = buildFacetCandidateTokens(processedExcluded);
            const hasMatch = excludedCandidates.some(candidate => 
              actualCandidates.has(candidate.toUpperCase())
            );

            if (hasMatch) {
              facetCheckPassed = false;
              failureReasons.push(`Excluded facet value present: ${key}=${excluded}`);
            }
          }
        } else {
          // No specific values listed — treat as key-level exclusion
          facetCheckPassed = false;
          failureReasons.push(`Excluded facet key present: ${key}`);
        }
      }
    }
    
    // Check: if strict mode, resultsFacets should not have any keys outside include
    if (strict) {
      for (const key of resultsKeys) {
        if (!includeKeys.has(key)) {
          facetCheckPassed = false;
          failureReasons.push(`Unexpected facet in strict mode: ${key}`);
        }
      }
    }
    
    if (!facetCheckPassed) {
      facetsCheckPassed = false;
      addFailureReason(`BE Facets check failed: ${failureReasons.join("; ")}`);
    }
  }

  // Facets check (Query vs UI vs BE)
  const facetMismatches: string[] = [];
  if (resultsFacets.equipment || resultsFacets.lines || resultsFacets.packages) {
    const mappableFacets: Array<"equipment" | "lines" | "packages"> = [
      "equipment",
      "lines",
      "packages",
    ];

    for (const facetKey of mappableFacets) {
      if (!Array.isArray(resultsFacets[facetKey])) continue;

      const apiFacetValues: Array<{ formattedValue: string; value: string }> =
        apiResponse?.data?.smartSearch?.facets?.[facetKey]?.values ?? [];
      const codeToName = new Map<string, string>(
        apiFacetValues.map((f) => [f.value, f.formattedValue])
      );

      resultsFacets[facetKey] = (resultsFacets[facetKey] as string[]).map(
        (code: string) => codeToName.get(code) ?? code
      );
    }
  }
  uiFacetComparison = compareUiSelectedFiltersWithFacets(
    resultsFacets,
    uiSelectedFiltersKV
  );
  if (query?.facet === 'equipment' || query?.facet === 'lines' || query?.facet === 'packages') {
    uiFacetComparison = compareUiSelectedFiltersWithFacetsByExpectedValue(
      query.filterValue,
      resultsFacets,
      uiSelectedFiltersKV,
      query.facet
    );
  }
  if (!uiFacetComparison.matches) {
    facetMismatches.push(
      `UI Filters Mismatch: missing ${JSON.stringify(
        uiFacetComparison.missingFacetValues
      )}, uiSelectedFiltersKV ${JSON.stringify(uiSelectedFiltersKV)}, beFacets ${JSON.stringify(resultsFacets)}`
    );
  }
  if (testFacets && facetMismatches.length > 0) {
    facetsCheckPassed = false;
    addFailureReason(facetMismatches.join(" | "));
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
    `BE Facets:     '${JSON.stringify(resultsFacets)}'`
  );
  console.log(
    `UI Facets:    '${JSON.stringify(uiSelectedFiltersKV)}'`
  );
  let queryEn = actualInput;
  let smartSearchMessageEn = smartSearchMessage;
  if (lang !== "en") {
    queryEn = await fetchTranslation(actualInput, "en");
    smartSearchMessageEn = await fetchTranslation(
      smartSearchMessage,
      "en"
    );
    console.log("\n");
    console.log(`Query (EN):    '${queryEn}'`);
    console.log(`Response (EN): '${smartSearchMessageEn}'`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
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
    results: {
      responseResult: responseCheckPassed ? "PASS" : "FAIL",
      facetsResult: facetsCheckPassed ? "PASS" : "FAIL",
    },
    facets: {
      expected: actualFacets,
      actual: resultsFacets,
      ui: uiSelectedFiltersKV,
    },
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
  const language = (LANGUAGE || "EN").toUpperCase();
  const marketUrls = urls[country];
  let url =
    marketUrls?.[env] ||
    marketUrls?.[language]?.[env] ||
    marketUrls?.EN?.[env] ||
    marketUrls?.JP?.[env];
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
      .waitFor({ state: "visible", timeout: 15000 });
    await page.click(".button--accept-all");
    console.debug("[DEBUG] Cookie banner accepted.");
  } catch (e) {
    console.debug("[DEBUG] Cookie banner not visible, continuing execution...");
  }
}

export async function handlePostalCodePopUp(page: Page): Promise<void> {
  try {
    const trigger = page.locator('[data-test-id="header-integration-item-emh-region-picker"]');
    await trigger.waitFor({ state: "visible", timeout: 5000 }).catch(() => false);
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
  try {
    console.debug("[DEBUG] Waiting for search button to be visible...");
    await searchButton.waitFor({ state: "visible", timeout: 15000 });
    for (let j = 0; j < 10; j++) {
      const enabled = await searchButton.isEnabled();
      console.debug(
        `[DEBUG] Search button enabled: ${enabled} (attempt ${j + 1}/10)`
      );
      if (enabled) break;
      await page.waitForTimeout(1000);
    }
  } catch (e: any) {
    console.debug("[DEBUG] Error waiting for search button:", e?.message || e);
  }

  const actualInput = query?.value ?? query;
  const input = page.locator(
    "wb7-input.smart-search__input wb7-grey-box input"
  );
  try {
    console.debug(`[DEBUG] Filling input with: '${actualInput}'`);
    await input.fill(" ");
    await input.fill(actualInput);
  } catch (e: any) {
    console.debug("[DEBUG] Error filling input:", e?.message || e);
  }

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
  let pageClosed = false;
  const startTime = Date.now();
  const successBubbleLocator = page.locator(".smart-search__bubble").first();
  const errorResultLocator = page.locator(".smart-search__notification.wbx-notification--error .wbx-notification__content");
  while (retries < 3 && !pageClosed) {
    try {
      // Check if page is still valid before proceeding
      if (page.isClosed()) {
        console.warn("[DEBUG] Page was closed, cannot proceed with retries");
        pageClosed = true;
        break;
      }

      console.debug(
        `[DEBUG] Waiting for results to be visible (attempt ${
          retries + 1
        }/3)...`
      );
      await successBubbleLocator.waitFor({ state: "visible", timeout: 5000 }).catch(() => false);
      if (await successBubbleLocator.isVisible()) {
        // Prefer message-specific descendants, then fallback to full bubble text.
        let extractedText = await successBubbleLocator
          .locator("p, .smart-search__message, .smart-search__result-message, .wbx-notification__content")
          .first()
          .innerText()
          .catch(() => "");

        if (!extractedText.trim()) {
          extractedText = await successBubbleLocator.innerText().catch(() => "");
        }

        resultText = extractedText.replace(/\s+/g, " ").trim();
        // Remove common CTA/footer labels if they are appended to the extracted text.
        resultText = resultText
          .replace(/\s*(Sonuçları görüntüle|Show results|View results)\s*$/i, "")
          .replace(/\s*(Yapay Zekâ Bilgilendirmesi|AI Disclosure)\s*$/i, "")
          .trim();

        if (resultText) {
          break;
        }
      }

      const errorVisible = await errorResultLocator
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      if (errorVisible) {
        resultText = await errorResultLocator.innerText();
        console.warn(`[DEBUG] UI showing internal error message: '${resultText}'`);
        break;
      }

      // Neither success nor error result visible — increment retries to avoid infinite loop
      retries++;
      if (retries < 3) {
        console.debug(
          `[DEBUG] Results not visible, retrying search button click (attempt ${retries + 1}/3)...`
        );
        await page.waitForTimeout(500); // Brief delay before retry
        if (await searchButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchButton.click();
        }
      }
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      // Check for page-closed errors
      if (errMsg.includes("page") || errMsg.includes("closed") || errMsg.includes("context")) {
        console.warn(`[DEBUG] Page appears to be closed: ${errMsg}`);
        pageClosed = true;
        break;
      }
      console.info(`[DEBUG] Error waiting for results: ${errMsg}`);
      retries++;
      if (retries < 3) {
        console.debug(
          `[DEBUG] Retrying search button click (attempt ${retries + 1}/3)...`
        );
        await page.waitForTimeout(500); // Brief delay before retry
        if (await searchButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchButton.click();
        }
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
      page.off("response", responseListener);
      const errMsg = pageClosed ? "Page was closed during search" : "Failed to capture API response within timeout";
      return {
        query: query,
        results: {
          resultText,
          responseData: null,
          uiSelectedFiltersKV,
        },
        responseTime,
        error: errMsg,
      };
    }
  }
  page.off("response", responseListener);
  
  let errorMsg: string | undefined;
  if (pageClosed) {
    errorMsg = "Page was closed during search";
  } else if (retries === 3) {
    errorMsg = "Failed to retrieve results after 3 attempts";
  }
  
  return {
    query: query,
    results: {
      resultText,
      responseData: apiResponsePayload,
      uiSelectedFiltersKV,
    },
    responseTime,
    error: errorMsg,
  };
}
