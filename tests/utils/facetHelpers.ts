import fs from "fs/promises";
import path from "path";
import { generateOpenAIQuery } from "./aiHelpers";

export interface SimplifiedFacet {
  code: string;
  type: "range" | "list";
  min?: number;
  max?: number;
  values?: Array<{ code: string; name: string }>;
  displayName?: string;
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
  project: string
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
            facetData.displayName = key;
          } else if (value?.values && Array.isArray(value.values)) {
            facetData.facetDisplayType = "LIST";
            facetData.values = value.values.map((v: any) => ({
              code: v.value || v.formattedValue,
              name: v.formattedValue || v.value || v.label,
            }));
            facetData.displayName = key;
          }

          return facetData;
        });
    } else {
      // DCP response structure: data.facets
      rawFacets = (dcpApiResponse.data.facets || []).filter((facet: any) => !skipFacetCodes.includes(facet.code));
    }

    console.log(`Successfully fetched ${rawFacets.length} raw facets from API`);

    // Convert raw facets to simplified format (same logic as facetToJson.js)
    function extractSimpleValues(values: any[]) {
      if (!Array.isArray(values)) return [];
      return values
        .map((v: any) => {
          if (v.code && v.name) {
            return { code: v.code, name: v.name };
          }
          if (Array.isArray(v.values)) {
            return v.values
              .map((inner: any) => ({ code: inner.code, name: inner.name }))
              .filter((x: any) => x.code && x.name);
          }
          return null;
        })
        .flat()
        .filter((x: any) => x && x.code && x.name);
    }

    facets = rawFacets
      .map((facet: any) => {
        const { code, min, max, values, displayName, facetDisplayType } = facet;
        let type;
        if (facetDisplayType === "SLIDER") {
          type = "range";
          const parsedMin = parseFloat(Number(min).toFixed(1));
          const parsedMax = parseFloat(Number(max).toFixed(1));
          // Skip if min or max are invalid or equal
          if (isNaN(parsedMin) || isNaN(parsedMax) || parsedMin === parsedMax) {
            return null;
          }
          return { code, type, min: parsedMin, max: parsedMax, displayName };
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
    maxTokens: number;
    fallback: string;
  }
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
      aiPromptData.maxTokens,
      aiPromptData.fallback
    );

    console.log("\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Generated query for facet '${facet.code}'`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Query:       '${query}'`);
    console.log(`filterValue: '${filterValue}'`);
    console.log(`filterText:  '${filterText}'`);
    console.log("\n");

    return { value: query, facet: facet.code, filterText, filterValue };
  });

  const queries = (await Promise.all(queryPromises)).filter(Boolean);
  return queries as Array<{
    value: string;
    facet: string;
    filterText: string;
    filterValue: string;
  }>;
}
