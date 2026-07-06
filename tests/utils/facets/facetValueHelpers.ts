export interface FacetValueEntry {
  rawValue: string;
  formattedValue: string;
}

function normalizeFacetValue(value: unknown): string {
  return String(value ?? "").trim();
}

function isInvalidFacetValue(value: string): boolean {
  return !value || value.toUpperCase() === "UNDEFINED";
}

function getFacetValuesNode(sourceData: any, facetKey: string): any {
  return (
    sourceData?.data?.search?.facets?.[facetKey]?.values ||
    sourceData?.[facetKey]?.values
  );
}

function createEntry(rawValue: string, formattedValue?: string): FacetValueEntry {
  return {
    rawValue,
    formattedValue: formattedValue || rawValue,
  };
}

export function extractFacetValuesFromData(
  sourceData: any,
  facetKey: string,
): FacetValueEntry[] {
  const facetValues = getFacetValuesNode(sourceData, facetKey);

  if (
    facetValues &&
    typeof facetValues === "object" &&
    !Array.isArray(facetValues)
  ) {
    const seen = new Set<string>();
    const values: FacetValueEntry[] = [];
    const boundaryCandidates = [facetValues.min, facetValues.max];

    for (const candidate of boundaryCandidates) {
      const rawValue = normalizeFacetValue(candidate);
      if (isInvalidFacetValue(rawValue) || seen.has(rawValue)) {
        continue;
      }
      seen.add(rawValue);
      values.push(createEntry(rawValue));
    }

    return values;
  }

  if (!Array.isArray(facetValues)) {
    return [];
  }

  const seen = new Set<string>();
  const values: FacetValueEntry[] = [];

  for (const entry of facetValues) {
    const raw =
      typeof entry === "string" || typeof entry === "number"
        ? String(entry)
        : String(entry?.value ?? "");
    const rawValue = raw.trim();
    if (isInvalidFacetValue(rawValue)) {
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

    values.push(createEntry(rawValue, formattedValue));
  }

  return values;
}

export function extractMissingFacetValuesFromData(
  facetKey: string,
  masterData: any,
  stockData: any,
): FacetValueEntry[] {
  const allValues = extractFacetValuesFromData(masterData, facetKey);
  const stockValues = new Set(
    extractFacetValuesFromData(stockData, facetKey).map((entry) =>
      String(entry.rawValue).toUpperCase(),
    ),
  );

  // Compare only the internal facet code (`value`). Labels/formatted values are localized per market.
  return allValues.filter((entry) => {
    const normalizedValue = String(entry.rawValue).toUpperCase();
    return !stockValues.has(normalizedValue);
  });
}
