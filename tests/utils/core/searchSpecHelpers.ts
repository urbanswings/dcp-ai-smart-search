function normalizeModelIdentifierMatchValue(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/mercedes[- ]benz/g, "")
    .replace(/mercedes[- ]amg/g, "amg")
    .replace(/mercedes[- ]maybach/g, "maybach")
    .replace(/[^a-z0-9]/g, "");
}

export function getModelIdentifierFilterValueIfInStock(
  keyword: string,
  emhApiResponse: any,
): string | undefined {
  const modelIdentifierValues =
    emhApiResponse?.data?.search?.facets?.modelIdentifier?.values;
  if (!Array.isArray(modelIdentifierValues)) {
    return undefined;
  }

  const normalizedKeyword = normalizeModelIdentifierMatchValue(keyword);
  const normalizedKeywordVariants = [
    normalizedKeyword,
    normalizedKeyword.replace(/^amg/, ""),
    normalizedKeyword.replace(/^maybach/, ""),
  ].filter(Boolean);
  const stockedModelCandidates = modelIdentifierValues
    .filter((model) => Number(model?.count || 0) > 0)
    .flatMap((model) => {
      const modelValue = model?.value ? String(model.value) : undefined;
      if (!modelValue) {
        return [];
      }

      return [model?.formattedValue, model?.value]
        .map((value) => ({
          value: modelValue,
          candidate: normalizeModelIdentifierMatchValue(value),
        }))
        .filter((entry) => entry.candidate);
    });

  const matchingModel = stockedModelCandidates
    .filter(({ candidate }) =>
      normalizedKeywordVariants.some((variant) => {
        if (variant === candidate) {
          return true;
        }

        if (candidate.length === 1) {
          return (
            variant.startsWith(candidate) &&
            /^\d/.test(variant.slice(candidate.length))
          );
        }

        return variant.startsWith(candidate);
      }),
    )
    .sort((a, b) => b.candidate.length - a.candidate.length)[0];

  return matchingModel?.value;
}

export function getModelIdentifierLabel(keyword: string): string {
  return keyword
    .replace(/^Mercedes[- ]Benz\s+/i, "")
    .replace(/^Mercedes[- ]AMG\s+/i, "AMG ")
    .replace(/^Mercedes[- ]Maybach\s+/i, "Maybach ")
    .trim();
}
