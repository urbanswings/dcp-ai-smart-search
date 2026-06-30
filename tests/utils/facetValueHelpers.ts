export interface FacetValueEntry {
  rawValue: string;
  formattedValue: string;
}

export function extractFacetValuesFromData(
  sourceData: any,
  facetKey: string,
): FacetValueEntry[] {
  const facetValues =
    sourceData?.data?.search?.facets?.[facetKey]?.values ||
    sourceData?.[facetKey]?.values;
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
    if (!rawValue || rawValue.toUpperCase() === "UNDEFINED") {
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

    values.push({
      rawValue,
      formattedValue: formattedValue || rawValue,
    });
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
