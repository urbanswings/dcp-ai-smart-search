import { Page } from "@playwright/test";
import {
  collectPrimitiveFacetValues,
  normalizeFacetToken,
} from "../facets/facetAssertionHelpers";

function isOpaqueFacetValue(facetKey: string, rawValue: string): boolean {
  return (
    ["upholstery", "color"].includes(facetKey) &&
    /^[0-9a-f]{8,}$/i.test(rawValue)
  );
}

const facetValueAliasMap: Record<string, string[]> = {
  limousine: ["sedan"],
  sedan: ["limousine"],
  suv: ["suvoffroader"],
  suvoffroader: ["suv"],
  suvaraziaraci: ["suv", "suvoffroader"],
  suvaraziarac: ["suv", "suvoffroader"],
  cabrioroadster: ["cabrioletroadster", "kabriyo", "cabriolet"],
  cabrioletroadster: ["cabrioroadster", "kabriyo", "cabriolet"],
  kabriyo: ["cabrioroadster", "cabrioletroadster"],
  amggt: ["mercedesamggt"],
  mercedesamggt: ["amggt"],
  a: ["aclass", "aserisi"],
  aclass: ["a", "aserisi"],
  aserisi: ["a", "aclass"],
  b: ["bclass", "bserisi"],
  bclass: ["b", "bserisi"],
  bserisi: ["b", "bclass"],
  c: ["cclass", "cserisi"],
  cclass: ["c", "cserisi"],
  cserisi: ["c", "cclass"],
  e: ["eclass", "eserisi"],
  eclass: ["e", "eserisi"],
  eserisi: ["e", "eclass"],
  g: ["gclass", "gserisi"],
  gclass: ["g", "gserisi"],
  gserisi: ["g", "gclass"],
  s: ["sclass", "sserisi"],
  sclass: ["s", "sserisi"],
  sserisi: ["s", "sclass"],
  hatchback: ["hatches"],
  hatches: ["hatchback"],
  peoplecarrier: ["peoplemovers", "mpvs"],
  peoplemovers: ["peoplecarrier", "mpvs"],
  mpvs: ["peoplecarrier", "peoplemovers"],
  station: ["estate"],
  estate: ["station"],
  pluginhybridpetrol: ["petrolelectricpluginhybrid"],
  petrolelectricpluginhybrid: ["pluginhybridpetrol"],
  benzin: ["petrol"],
  petrol: ["benzin"],
  dizel: ["diesel"],
  diesel: ["dizel", "디젤", "경유"],
  elektrik: ["electric"],
  electric: ["elektrik"],
  hibrit: ["petrolelectricpluginhybrid", "pluginhybridpetrol"],
  benzinlipluginhibrit: ["petrolelectricpluginhybrid", "pluginhybridpetrol"],
  mercedesbenz: ["mercedes"],
  mercedes: ["mercedesbenz"],
  siyah: ["black"],
  black: ["siyah"],
  beyaz: ["white"],
  white: ["beyaz"],
  gumus: ["silver", "grey", "gray"],
  silver: ["gumus"],
  gri: ["grey", "gray", "silver"],
  grey: ["gri", "gray"],
  gray: ["gri", "grey"],
  kirmizi: ["red"],
  red: ["kirmizi"],
  mavi: ["blue"],
  blue: ["mavi"],
  yesil: ["green"],
  green: ["yesil"],
  bej: ["beige"],
  beige: ["bej"],
  kahverengi: ["brown"],
  brown: ["kahverengi"],
  세단: ["limousine"],
  쿠페: ["coupe"],
  왜건: ["station", "estate"],
  해치백: ["hatchback", "hatches"],
  セダン: ["limousine"],
  クーペ: ["coupe"],
  ステーションワゴン: ["station", "estate"],
  검정: ["black"],
  검은색: ["black"],
  흰색: ["white"],
  하얀색: ["white"],
  은색: ["silver", "grey", "gray"],
  회색: ["grey", "gray"],
  빨간색: ["red"],
  파란색: ["blue"],
  화이트: ["white"],
  블랙: ["black"],
  그레이: ["grey", "gray"],
  레드: ["red"],
  블루: ["blue"],
  실버: ["silver"],
  베이지: ["beige"],
  브라운: ["brown"],
  가솔린: ["petrol"],
  휘발유: ["petrol"],
  디젤: ["diesel"],
  경유: ["diesel"],
  전기: ["electric"],
  하이브리드: ["petrolelectricpluginhybrid", "pluginhybridpetrol"],
  카브리올레로드스터: ["cabrioroadster", "cabrioletroadster"],
  카브리올레: ["cabrioroadster", "cabrioletroadster"],
  ดีเซล: ["diesel"],
  เบนซิน: ["petrol"],
  ไฟฟ้า: ["electric"],
  ปลั๊กอินไฮบริด: ["petrolelectricpluginhybrid", "pluginhybridpetrol"],
  "ดีเซล/ไฟฟ้า": ["dieselelectricpluginhybrid"],
  ดีเซลปลั๊กอินไฮบริด: ["dieselelectricpluginhybrid"],
  ลิมูซีน: ["limousine", "sedan", "saloon"],
  คูเป้: ["coupe"],
  เอสยูวี: ["suv", "suvoffroader"],
  คาบริโอเล: ["cabrioroadster", "cabrioletroadster"],
  รถตู้: ["peoplecarrier"],
  saloon: ["limousine", "sedan"],
  อัตโนมัติ: ["automatic"],
  เกียร์ธรรมดา: ["manual"],
  ธรรมดา: ["manual"],
};

let runtimeFacetValueAliasMap: Record<string, string[]> = {};

function addAlias(
  aliasMap: Record<string, string[]>,
  from: string,
  to: string,
): void {
  if (!from || !to || from === to) return;
  if (!aliasMap[from]) aliasMap[from] = [];
  if (!aliasMap[from].includes(to)) {
    aliasMap[from].push(to);
  }
}

export function updateRuntimeFacetAliasesFromApiResponse(apiResponse: any): void {
  runtimeFacetValueAliasMap = {};
  const apiFacets =
    apiResponse?.data?.search?.facets ||
    apiResponse?.data?.smartSearch?.facets ||
    {};

  for (const facet of Object.values(apiFacets) as any[]) {
    const values = facet?.values;
    if (!Array.isArray(values)) continue;

    for (const item of values) {
      if (!item || typeof item !== "object") continue;
      const beValue = typeof item.value === "string" ? item.value : "";
      const formattedValue =
        typeof item.formattedValue === "string" ? item.formattedValue : "";

      const normalizedBe = normalizeFacetToken(beValue);
      const normalizedFormatted = normalizeFacetToken(formattedValue);
      if (!normalizedBe || !normalizedFormatted) continue;

      addAlias(runtimeFacetValueAliasMap, normalizedFormatted, normalizedBe);
      addAlias(runtimeFacetValueAliasMap, normalizedBe, normalizedFormatted);
    }
  }

  addAlias(runtimeFacetValueAliasMap, "카브리올레로드스터", "cabrioroadster");
  addAlias(runtimeFacetValueAliasMap, "cabrioroadster", "카브리올레로드스터");
}

export function buildFacetCandidateTokens(rawValue: string): string[] {
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
    "바디 타입": "bodyType",
    차체타입: "bodyType",
    ボディタイプ: "bodyType",
    "연료연료 타입타입": "fuelType",
    연료유형: "fuelType",
    燃料タイプ: "fuelType",
    모델: "modelIdentifier",
    모델클래스: "modelIdentifier",
    모델라인: "modelIdentifier",
    モデル: "modelIdentifier",
    브랜드: "brand",
    ブランド: "brand",
    색상: "color",
    色: "color",
    내장색상: "upholstery",
    内装色: "upholstery",
    연식: "modelYear",
    年式: "modelYear",
    가격: "price",
    価格: "price",
    차량: "brand",
    옵션사양: "equipment",
    装備: "equipment",
    ประเภทรถ: "bodyType",
    ประเภทเชื้อเพลิง: "fuelType",
    รุ่น: "modelIdentifier",
    แบรนด์: "brand",
    ยี่ห้อ: "brand",
    สี: "color",
    สีภายใน: "upholstery",
    ปีรุ่น: "modelYear",
    ราคา: "price",
    อุปกรณ์: "equipment",
    เกียร์: "gearbox",
    ระยะทาง: "mileage",
  };

  if (rawLabelMap[compactRawLabel]) {
    return rawLabelMap[compactRawLabel];
  }

  const normalizedLabel = normalizeFacetToken(label);
  const labelMap: Record<string, string> = {
    brand: "brand",
    brandname: "brand",
    body: "bodyType",
    bodystyle: "bodyType",
    bodytype: "bodyType",
    vehicletype: "bodyType",
    model: "modelIdentifier",
    modelvariant: "motorization",
    variant: "motorization",
    varyant: "motorization",
    modelidentifier: "modelIdentifier",
    motorization: "motorization",
    fueltype: "fuelType",
    engine: "fuelType",
    color: "color",
    colour: "color",
    upholstery: "upholstery",
    upholsterycolor: "upholstery",
    upholsterycolour: "upholstery",
    modelyear: "modelYear",
    price: "price",
    totalprice: "price",
    marka: "brand",
    modeladi: "modelIdentifier",
    motor: "motorization",
    yakittipi: "fuelType",
    govdetipi: "bodyType",
    govdeturu: "bodyType",
    renk: "color",
    renkler: "color",
    doseme: "upholstery",
    dosemerenk: "upholstery",
    icdoseme: "upholstery",
    icdosemerenk: "upholstery",
    modelyili: "modelYear",
    fiyat: "price",
    donanim: "equipment",
    equipment: "equipment",
  };

  return labelMap[normalizedLabel] || null;
}

function mapUiDataTestIdToFacetKey(dataTestId: string | null): string | null {
  if (!dataTestId) {
    return null;
  }

  const normalizedDataTestId = dataTestId.trim();
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
  return (
    canonicalFacetKeyMap[normalizedFacetKey] ||
    mapUiLabelToFacetKey(rawFacetKey)
  );
}

type UiSelectedFilterPill = {
  text: string;
  facetKeyHint?: string | null;
};

function parseUiSelectedFiltersToKeyValue(
  uiSelectedFilters: UiSelectedFilterPill[],
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

    value = value.replace(/\s*X\s*$/i, "").trim();
    value = value.replace(/^[:\s]+|[:\s]+$/g, "").trim();

    const mappedFacetKey = mapUiLabelToFacetKey(label);
    const facetKey = filterPill.facetKeyHint || mappedFacetKey;
    if (!facetKey) {
      continue;
    }

    if (!keyValueFilters[facetKey]) {
      keyValueFilters[facetKey] = [];
      seenValuesByFacetKey[facetKey] = new Set<string>();
    }

    if (!value) {
      continue;
    }

    const normalizedValue = normalizeFacetToken(value);
    if (
      normalizedValue &&
      seenValuesByFacetKey[facetKey]?.has(normalizedValue)
    ) {
      continue;
    }

    if (normalizedValue) {
      seenValuesByFacetKey[facetKey]?.add(normalizedValue);
    }

    keyValueFilters[facetKey].push(value);
  }

  return keyValueFilters;
}

export function compareUiSelectedFiltersWithFacets(
  facets: Record<string, any>,
  uiSelectedFiltersKV: Record<string, string[]>,
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
      (candidateKey) => uiSelectedFiltersKV[candidateKey] || [],
    );
    const hasSelectedFacetKey = candidateUiKeys.some((candidateKey) =>
      uiSelectedFacetKeys.has(candidateKey),
    );

    const realUiValues = keySpecificUiValues.filter(
      (v) => v !== ":" && v.trim() !== "",
    );
    if (hasSelectedFacetKey && realUiValues.length === 0) {
      continue;
    }

    const keySpecificUiTokens = new Set(
      realUiValues.flatMap((value) => buildFacetCandidateTokens(value)),
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
            Array.from(keySpecificUiTokens).some(
              (uiToken) =>
                uiToken.length >= 10 && candidate.startsWith(uiToken),
            ),
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

export function compareUiSelectedFiltersWithFacetsByExpectedValue(
  expectedValue: string,
  facets: Record<string, any>,
  uiSelectedFiltersKV: Record<string, string[]>,
  facetKey: string = "equipment",
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
    backendFacetValues.flatMap((value) => buildFacetCandidateTokens(value)),
  );
  const uiTokens = new Set(
    uiFacetValues.flatMap((value) => buildFacetCandidateTokens(value)),
  );

  const matchesTokenSet = (tokens: Set<string>): boolean =>
    expectedCandidates.some(
      (candidate) =>
        tokens.has(candidate) ||
        Array.from(tokens).some(
          (token) => token.length >= 10 && candidate.startsWith(token),
        ),
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

export async function extractUiSelectedFilters(
  page: Page,
): Promise<Record<string, string[]>> {
  try {
    await page
      .locator("#emh-selected-filters-reset-button")
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => false);

    const showMoreButton = page.locator(
      '[data-test-id="emh-selected-filters-show-more"]',
    );
    const showMoreVisible = await showMoreButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (showMoreVisible) {
      await showMoreButton.click().catch(() => {});
      console.debug(
        "[DEBUG] Clicked 'Show More' to reveal additional selected filters",
      );
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

      const firstVisible = await pills
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (!firstVisible) {
        continue;
      }

      if (count === 0) {
        continue;
      }

      const parsedPills: UiSelectedFilterPill[] = [];
      for (let i = 0; i < count; i++) {
        const pill = pills.nth(i);
        const dataTestId = await pill
          .getAttribute("data-test-id")
          .catch(() => null);
        const facetKeyHint = mapUiDataTestIdToFacetKey(dataTestId);
        const innerText = await pill.innerText().catch(() => "");
        const normalizedInnerText = innerText.replace(/\s+/g, " ").trim();

        if (/:\s*$/.test(normalizedInnerText)) {
          const recovered: string = await pill
            .evaluate((el) => {
              const tagImg = el.querySelector(
                ".emh-selected-filters__tag-image",
              );
              if (tagImg) {
                const alt = tagImg.getAttribute("alt") || "";
                if (alt) return alt;
              }

              const ariaLabel = el.getAttribute("aria-label") || "";
              if (ariaLabel) return ariaLabel;

              const dataValue =
                el.getAttribute("data-value") ||
                el.getAttribute("data-label") ||
                "";
              if (dataValue) return dataValue;

              const all = el.querySelectorAll("*");
              for (const child of Array.from(all)) {
                const t = (
                  (child as HTMLElement).innerText ||
                  (child as HTMLElement).textContent ||
                  ""
                ).trim();
                if (
                  t &&
                  !t.includes("\n") &&
                  t !== "×" &&
                  t !== "x" &&
                  t !== "X"
                ) {
                  const colon = t.indexOf(":");
                  if (colon >= 0 && t.slice(colon + 1).trim()) return t;
                }
              }

              const walker = document.createTreeWalker(
                el,
                NodeFilter.SHOW_TEXT,
              );
              const parts: string[] = [];
              let node = walker.nextNode();
              while (node) {
                const t = (node.nodeValue || "").trim();
                if (t && t !== "×" && t !== "x" && t !== "X") parts.push(t);
                node = walker.nextNode();
              }
              return parts.join(" : ");
            })
            .catch(() => "");
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
          0,
        );
        if (parsedScore > bestScore) {
          bestScore = parsedScore;
          bestParsedResult = parsedResult;
        }
      }
    }

    return bestParsedResult;
  } catch (e: any) {
    if (
      e?.message?.includes("Target page, context or browser has been closed")
    ) {
      console.debug(
        "[DEBUG] Page closed during filter extraction, returning empty filters",
      );
    } else {
      console.warn("[DEBUG] Error extracting UI selected filters:", e);
    }
    return {};
  }
}
