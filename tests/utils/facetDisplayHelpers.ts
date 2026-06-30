export function extractResponseFacets(responseData: any): Record<string, any> {
  return (
    responseData?.smartSearch?.facets || responseData?.search?.facets || {}
  );
}

export function buildFacetValueDisplayMap(
  facetsData: Record<string, any>,
  masterData: Record<string, any>,
): Record<string, Record<string, string>> {
  const facetValueDisplayMap: Record<string, Record<string, string>> = {};

  const addValues = (source: Record<string, any>, overwrite: boolean) => {
    for (const [facetKey, facetPayload] of Object.entries(source || {})) {
      const values = (facetPayload as any)?.values;
      if (!Array.isArray(values)) continue;
      if (!facetValueDisplayMap[facetKey]) {
        facetValueDisplayMap[facetKey] = {};
      }
      for (const item of values) {
        if (!item?.value || !item?.formattedValue) continue;
        const normalizedKey = String(item.value).trim().toUpperCase();
        if (overwrite || !facetValueDisplayMap[facetKey][normalizedKey]) {
          facetValueDisplayMap[facetKey][normalizedKey] = String(
            item.formattedValue,
          );
        }
      }
    }
  };

  addValues(masterData, false);
  addValues(facetsData, true);

  return facetValueDisplayMap;
}

export function formatExpectedFacetValues(
  facetKey: string,
  values: any[],
  facetValueDisplayMap: Record<string, Record<string, string>>,
): string {
  return values
    .map((value) => {
      const raw = String(value).trim();
      return facetValueDisplayMap[facetKey]?.[raw.toUpperCase()] || raw;
    })
    .join(", ");
}
