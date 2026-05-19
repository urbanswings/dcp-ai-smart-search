import fs from "fs/promises";
import path from "path";
import { generateOpenAIQuery } from "./aiHelpers";
import { FixedQueryCase } from "./queryHelpers";

const REGRESSION_DESCRIPTION_PATH = path.join(__dirname, "../regression.desciption.txt");
const REGRESSION_TESTDATA_PATH = path.join(__dirname, "../data/regression.testdata.json");
const REGRESSION_RUN_SUMMARY_PATH = path.join(__dirname, "../data/regression.run-summary.json");
const EMH_API_RESPONSE_PATH = path.join(__dirname, "../data/emh-api-response.json");
const INTERMITTENCY_QUERIES_PATH = path.join(__dirname, "../data/intermittency-queries.json");

const SYSTEM_PROMPT = `You are a test-case engineer for a Mercedes-Benz vehicle search AI.
Given a plain-text description of a search bug or regression scenario, generate a JSON array of regression test scenarios with evaluation decisions.

Each test case must follow this TypeScript interface:
  {
    value: string;                   // the natural-language search query to test
    shouldRecommend: boolean;        // true if the AI is expected to return vehicle results
    shouldFilter: false | true | {   // false = no filters expected, true = at least one filter (any),
      include: Array<Record<string, string[]>>;  // facet key → expected BE values that MUST be present
      exclude: Array<Record<string, string[]>>;  // facet key → values that must NOT be present
      strict: boolean;               // true = resultsFacets must contain ONLY the include keys
    };
    aiEvaluationHints: {
      value: string[];               // evaluation rules + decision criteria for the AI judge
      overwrite: boolean;            // always true
    };
  }

Rules:
- Generate ALL query phrasings mentioned or implied by the description as separate test cases.
- For phrasing-variation bugs, include every variant mentioned.
- Additionally, generate extra queries to improve coverage: synonyms, different word orders, edge-case phrasings, boundary conditions, and semantically similar but distinctly phrased queries that would expose the same or related bug.
- shouldFilter must reflect what backend filters are expected for that query.
- When specific filter values are expected, use the include/exclude/strict object form.
- Use strict: true only when the query implies ONLY those filters should be applied and nothing else.
- Use strict: false when additional filters may also be present.
- Source of truth for allowed facets and facet values is tests/data/emh-api-response.json.
- Only use facet keys and values that exist in that source-of-truth file.
- If a described expectation uses a facet/value not present in the source-of-truth file, do not invent it; choose the closest valid facet/value or omit that expectation.
- aiEvaluationHints.value must define precise evaluation decision rules based on 'RCA' and 'Test Approach'. This is only to evaluate AI response message, and not UI filtering. Include a rule "Response with failure reason otherwise response with 'PASS' only"
- Include at least one decision rule for recommendation behavior and one for filter correctness (when filters are expected).
- Respond with ONLY a valid JSON array, no markdown, no explanation.

Example shouldFilter for "list sedans only":
  { "include": [{ "bodyType": ["LIMOUSINE"] }], "exclude": [], "strict": true }

Example shouldFilter for "black suvs":
  { "include": [{ "bodyType": ["SUV_OFFROADER"] }, { "color": ["PAINT_COLOR_BLACK"] }], "exclude": [], "strict": true }

Example shouldFilter for "show all except sedan":
  { "include": [], "exclude": [{ "bodyType": ["LIMOUSINE"] }], "strict": false }`;

const ANALYSIS_PROMPT = `You are a QA engineer and search AI specialist for Mercedes-Benz vehicle search.
Given a plain-text description of a search bug or regression scenario, produce:

1. RCA (Root Cause Analysis): A concise explanation of why the bug likely occurs in an AI-powered search system.
2. Test Approach: A short description of how the generated test cases will validate the fix.

Format your response exactly as:

RCA:
<your root cause analysis here>

Test Approach:
<your test approach here>

Be specific to the described scenario. Do not repeat back the description verbatim.`;

const RESULTS_ANALYSIS_PROMPT = `${ANALYSIS_PROMPT}

Now evaluate executed regression test results and provide a run summary.

Output format:
Test Summary:
- Total test entries: <number>
- Passed: <number>
- Failed: <number>
- Main patterns observed: <short bullet list>

Findings:
- <finding 1>
- <finding 2>

Recommendations:
- <action 1>
- <action 2>

Conclusion:
- <PASS or FAIL>

Rules:
- Focus on concrete failures and inconsistencies from the provided test results.
- If results are healthy, still mention residual risks.
- Keep each bullet concise and actionable.`;

async function loadFacetCatalogFromEmhApiResponse(): Promise<string> {
  try {
    const raw = await fs.readFile(EMH_API_RESPONSE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const facets = parsed?.data?.search?.facets;

    if (!facets || typeof facets !== "object") {
      return "";
    }

    const catalog = Object.entries(facets).reduce<Record<string, string[]>>(
      (accumulator, [facetKey, facetValue]) => {
        const values = Array.isArray((facetValue as any)?.values)
          ? (facetValue as any).values
              .map((entry: any) =>
                typeof entry === "string" ? entry : String(entry?.value ?? "").trim()
              )
              .filter(Boolean)
          : [];

        if (values.length > 0) {
          accumulator[facetKey] = Array.from(new Set(values));
        }

        return accumulator;
      },
      {}
    );

    return JSON.stringify(catalog, null, 2);
  } catch (e) {
    console.warn("[regressionHelpers] Failed to load facet catalog from emh-api-response.json:", e);
    return "";
  }
}

export async function loadRegressionQueriesFromDescription(): Promise<FixedQueryCase[]> {
  let description: string;
  try {
    description = await fs.readFile(REGRESSION_DESCRIPTION_PATH, "utf-8");
  } catch (e) {
    console.warn("[regressionHelpers] Could not read regression.desciption.txt:", e);
    return [];
  }

  if (!description.trim()) {
    console.warn("[regressionHelpers] regression.desciption.txt is empty, returning no queries.");
    return [];
  }

  console.log("[regressionHelpers] Generating regression test cases from description...");

  const facetCatalog = await loadFacetCatalogFromEmhApiResponse();

  // Step 1: Generate RCA and test approach from the description
  let analysis = "";
  try {
    analysis = await generateOpenAIQuery(
      ANALYSIS_PROMPT,
      description.trim(),
      /* maxTokens */ 600,
      /* temperature */ 0.3,
      /* fallback */ ""
    );
    if (analysis.trim()) {
      const separator = "\n\n" + "─".repeat(60) + "\n";
      const timestamp = new Date().toISOString();
      const appendBlock = `${separator}[AI Analysis — ${timestamp}]\n\n${analysis.trim()}\n`;
      await fs.appendFile(REGRESSION_DESCRIPTION_PATH, appendBlock, "utf-8");
      console.log("[regressionHelpers] Appended RCA and test approach to regression.desciption.txt");
    }
  } catch (e) {
    console.warn("[regressionHelpers] Failed to generate RCA/test approach:", e);
  }

  // Step 2: Generate test cases using description + analysis as combined input
  const combinedSections = [
    `Bug Description:\n${description.trim()}`,
    analysis.trim(),
    facetCatalog
      ? `Facet Catalog from tests/data/emh-api-response.json:\n${facetCatalog}`
      : "",
  ].filter(Boolean);
  const combinedInput = combinedSections.join("\n\n");

  let raw: string;
  try {
    raw = await generateOpenAIQuery(
      SYSTEM_PROMPT,
      combinedInput,
      /* maxTokens */ 4000,
      /* temperature */ 0.2,
      /* fallback */ "[]"
    );
  } catch (e) {
    console.warn("[regressionHelpers] AI call failed, returning no queries:", e);
    return [];
  }

  try {
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.warn("[regressionHelpers] AI response was not a JSON array:", raw);
      return [];
    }
    console.log(`[regressionHelpers] Generated ${parsed.length} regression test case(s).`);
    await fs.writeFile(REGRESSION_TESTDATA_PATH, JSON.stringify(parsed, null, 2), "utf-8");
    console.log(`[regressionHelpers] Saved test data to: ${REGRESSION_TESTDATA_PATH}`);

    return parsed as FixedQueryCase[];
  } catch (e) {
    console.warn("[regressionHelpers] Failed to parse AI response as JSON:", raw);
    return [];
  }
}

export async function summarizeRegressionRunWithAI(params: {
  allResults: any[];
  outputFileName: string;
  testDescribe: string;
  testTitle: string;
  testType: string;
}): Promise<void> {
  const { allResults, outputFileName, testDescribe, testTitle, testType } = params;
  if (!Array.isArray(allResults) || allResults.length === 0) {
    return;
  }

  const compactResults = allResults.map((r: any) => ({
    testMode: r.testMode,
    query:
      (r?.query && (r.query.en || r.query[Object.keys(r.query)[0]])) ||
      (typeof r?.query === "string" ? r.query : ""),
    hasError: !!r?.hasError,
    openaiEvaluation: r?.openaiEvaluation,
    error: r?.error,
    uiFacetComparison: r?.uiFacetComparison,
    facets: r?.facets,
    resultCount: r?.resultCount,
    uiVehicleCount: r?.uiVehicleCount,
  }));

  const totals = {
    total: compactResults.length,
    failed: compactResults.filter((r) => r.hasError).length,
    passed: compactResults.filter((r) => !r.hasError).length,
  };

  const userPrompt = [
    `Test Describe: ${testDescribe}`,
    `Test Title: ${testTitle}`,
    `Test Type: ${testType}`,
    `Results File: ${outputFileName}`,
    `Totals: ${JSON.stringify(totals)}`,
    "",
    "Results:",
    JSON.stringify(compactResults, null, 2),
  ].join("\n");

  let summary = await generateOpenAIQuery(
    RESULTS_ANALYSIS_PROMPT,
    userPrompt,
    /* maxTokens */ 1200,
    /* temperature */ 0.2,
    /* fallback */ ""
  );

  if (!summary.trim()) {
    return;
  }

  // Ensure conclusion is always present and deterministic.
  if (!/\bConclusion\s*:/i.test(summary)) {
    const status = totals.failed === 0 ? "PASS" : "FAIL";
    summary = `${summary.trim()}\n\nConclusion:\n- ${status}`;
  }

  const timestamp = new Date().toISOString();
  const separator = "\n\n" + "-".repeat(60) + "\n";
  const block = `${separator}[AI Run Findings - ${timestamp}]\n\n${summary.trim()}\n`;

  await fs.appendFile(REGRESSION_DESCRIPTION_PATH, block, "utf-8");
  await fs.writeFile(
    REGRESSION_RUN_SUMMARY_PATH,
    JSON.stringify(
      {
        timestamp,
        testDescribe,
        testTitle,
        testType,
        outputFileName,
        totals,
        summary: summary.trim(),
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("[regressionHelpers] Appended AI run summary/findings to regression.desciption.txt");
  console.log(`[regressionHelpers] Saved AI run summary to: ${REGRESSION_RUN_SUMMARY_PATH}`);
}

/**
 * Loads queries from intermittency-queries.json for repeated-run consistency testing.
 * The file is a JSON array of query strings or FixedQueryCase objects.
 * Example:
 *   ["white family cars", "sedan under 50000", { "value": "black suv", "shouldRecommend": true }]
 */
export async function loadIntermittencyQueries(): Promise<FixedQueryCase[]> {
  let raw: string;
  try {
    raw = await fs.readFile(INTERMITTENCY_QUERIES_PATH, "utf-8");
  } catch (e) {
    console.warn("[regressionHelpers] Could not read intermittency-queries.json:", e);
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn("[regressionHelpers] intermittency-queries.json is not valid JSON:", e);
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.warn("[regressionHelpers] intermittency-queries.json is empty or not an array.");
    return [];
  }

  const queries: FixedQueryCase[] = parsed.map((item: unknown) => {
    if (typeof item === "string") {
      return { value: item } as FixedQueryCase;
    }
    if (typeof item === "object" && item !== null && "value" in item) {
      return item as FixedQueryCase;
    }
    console.warn("[regressionHelpers] Skipping invalid entry in intermittency-queries.json:", item);
    return null;
  }).filter((q): q is FixedQueryCase => q !== null);

  console.log(`[regressionHelpers] Loaded ${queries.length} intermittency query/queries.`);
  return queries;
}
