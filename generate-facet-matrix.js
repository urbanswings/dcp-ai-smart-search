const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const promptEngine = require("./tests/utils/promptEngineHelper");
const { getOpenAIClient } = require("./lib/openaiClient");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const rootDir = process.cwd();
const sourcePath = path.resolve(
  rootDir,
  process.env.MATRIX_SOURCE || "tests/data/emh-api-response.json",
);
const outputPath = path.resolve(
  rootDir,
  process.env.MATRIX_OUTPUT || "tests/data/generated-facet-matrix-suite.json",
);
const completeOutputPath = path.resolve(
  rootDir,
  process.env.COMPLETE_OUTPUT ||
    "tests/data/generated-facet-complete-suite.json",
);
const aiPromptsPath = path.resolve(rootDir, "tests/data/ai-query-prompts.json");

const FACET_ORDER = [
  "bodyType",
  "fuelType",
  "color",
  "stockType",
  "brand",
  "seats",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function titleCaseFromToken(value) {
  return String(value)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getFacetValues(facets, facetKey) {
  const values = facets?.[facetKey]?.values;
  if (!Array.isArray(values)) {
    return [];
  }
  const extracted = values
    .map((entry) => entry?.value)
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).toUpperCase() !== "UNDEFINED",
    );
  return [...new Set(extracted)];
}

function isOpaqueValue(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{7,}$/i.test(normalized);
}

function getFacetListEntries(facets, facetKey) {
  const values = facets?.[facetKey]?.values;
  if (!Array.isArray(values)) {
    return [];
  }

  const out = [];
  const seen = new Set();
  for (const entry of values) {
    const rawValue = entry?.value;
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    if (String(rawValue).toUpperCase() === "UNDEFINED") {
      continue;
    }

    const formattedValue = entry?.formattedValue || String(rawValue);
    if (!entry?.formattedValue && isOpaqueValue(rawValue)) {
      continue;
    }

    const key = `${String(rawValue)}::${String(formattedValue)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    out.push({
      rawValue,
      formattedValue: String(formattedValue).trim(),
    });
  }
  return out;
}

function getFacetRange(facets, facetKey) {
  const values = facets?.[facetKey]?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return null;
  }
  const min = Number(values.min);
  const max = Number(values.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }
  return { min, max };
}

function formatNumberForQuery(value) {
  return Math.round(Number(value)).toLocaleString("en-US");
}

function getCompleteDisplayValue(facetKey, formattedValue, rawValue) {
  if (facetKey === "bodyType") {
    return toQueryLabel(facetKey, rawValue);
  }
  return String(formattedValue || rawValue);
}

function fallbackCompleteQuery(facetKey, formattedValue, rawValue) {
  if (facetKey === "modelIdentifier") {
    return `list me all ${formattedValue}`;
  }
  if (facetKey === "upholstery") {
    return `i'm interested in ${formattedValue} interior`;
  }
  if (facetKey === "price") {
    return `vehicles around price of $${formatNumberForQuery(rawValue)}`;
  }
  if (facetKey === "monthlyRate") {
    return `vehicles around monthly rate of $${formatNumberForQuery(rawValue)}`;
  }
  if (facetKey === "color") {
    return `show me ${formattedValue.toLowerCase()} cars`;
  }
  if (facetKey === "fuelType") {
    return `show me ${formattedValue.toLowerCase()} cars`;
  }
  if (facetKey === "bodyType") {
    return `show me ${toQueryLabel(facetKey, rawValue)}`;
  }
  if (facetKey === "brand") {
    return `list me all ${formattedValue}`;
  }
  if (facetKey === "seats") {
    return `show me ${formattedValue}-seater vehicles`;
  }
  return `show me vehicles with ${facetDisplayName(facetKey)} ${formattedValue}`;
}

function addCompleteQuery(
  queryMap,
  query,
  facetKey,
  filterValue,
  shouldFilter,
) {
  if (queryMap.has(query)) {
    return;
  }
  queryMap.set(query, {
    value: query,
    facet: facetKey,
    filterValue: String(filterValue),
    shouldRecommend: true,
    shouldFilter,
  });
  console.log("===============================");
  console.log(`[complete-generator] filter: ${facetKey} : ${filterValue}`);
  console.log(`[complete-generator] query: ${query}`);
  console.log("===============================");
}

function loadCompletePromptConfig() {
  try {
    const promptData = JSON.parse(fs.readFileSync(aiPromptsPath, "utf8"));
    return promptData?.["Sanity Test"]?.["By Filter Facets (complete)"] || {};
  } catch {
    return {};
  }
}

function buildCompleteFilterText(facetKey, formattedValue, rawValue) {
  if (facetKey === "price") {
    return `filter category 'price' with value of '${formatNumberForQuery(rawValue)}'`;
  }
  return `filter category '${facetDisplayName(facetKey)}' with value of '${formattedValue}'`;
}

function createCompleteValueHints(facetKey, valueLabel) {
  const facetName = facetDisplayName(facetKey);
  return [
    `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and answers the requested ${facetName} filter intent.`,
    `Respond with "PASS" if the response clearly acknowledges or applies the requested ${facetName} value: ${valueLabel}.`,
    `If the response ignores or contradicts the requested ${facetName} value (${valueLabel}), respond with "FAIL: missing or incorrect ${facetName} value (${valueLabel})".`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "FAIL: off-topic or unsafe response".`,
  ];
}

function toCompleteHintValueLabel(facetKey, formattedValue, rawValue) {
  if (["bodyType", "fuelType", "color"].includes(facetKey)) {
    return toHintLabel(facetKey, rawValue);
  }
  return String(formattedValue || rawValue);
}

function createCompleteRangeHints(facetKey, numericValue) {
  const facetName = facetDisplayName(facetKey);
  const rounded = Math.round(Number(numericValue));
  return [
    `Respond with "PASS" if the response stays in Mercedes-Benz automotive context and answers the requested ${facetName} range intent.`,
    `Respond with "PASS" if the response references vehicles around ${facetName} ${rounded} (exact number not required).`,
    `If the response ignores the requested ${facetName} target (${rounded}) or provides clearly unrelated values, respond with "FAIL: missing or incorrect ${facetName} target (${rounded})".`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "FAIL: off-topic or unsafe response".`,
  ];
}

async function buildComplete(data) {
  const facets = data?.data?.search?.facets || {};
  const queryMap = new Map();
  const informativeHintsByQuery = {};
  const promptConfig = loadCompletePromptConfig();
  const aiContext = promptEngine.createPromptContext();

  for (const facetKey of Object.keys(facets)) {
    const listEntries = getFacetListEntries(facets, facetKey);
    for (const entry of listEntries) {
      const displayValue = getCompleteDisplayValue(
        facetKey,
        entry.formattedValue,
        entry.rawValue,
      );
      const query = await promptEngine.generateQueryWithVariation(
        getOpenAIClient(),
        facetKey,
        displayValue,
        entry.rawValue,
        promptConfig.systemPrompt,
        promptConfig.userPromptTemplate,
        facetDisplayName,
        aiContext,
        {
          language: process.env.LANGUAGE || "en",
          fallbackFn: fallbackCompleteQuery,
          filterTextFn: buildCompleteFilterText,
          maxTokens: promptConfig.maxTokens,
        },
      );
      addCompleteQuery(
        queryMap,
        query,
        facetKey,
        displayValue,
        {
          include: [{ [facetKey]: [entry.rawValue] }],
          exclude: [],
          strict: true,
        },
      );
      informativeHintsByQuery[query] = createCompleteValueHints(
        facetKey,
        toCompleteHintValueLabel(
          facetKey,
          entry.formattedValue,
          entry.rawValue,
        ),
      );
    }

    const range = getFacetRange(facets, facetKey);
    if (range) {
      const points = [
        range.min,
        Math.round((range.min + range.max) / 2),
        range.max,
      ];
      const uniquePoints = [...new Set(points)];
      for (const value of uniquePoints) {
        const query = await promptEngine.generateQueryWithVariation(
          getOpenAIClient(),
          facetKey,
          String(value),
          value,
          promptConfig.systemPrompt,
          promptConfig.userPromptTemplate,
          facetDisplayName,
          aiContext,
          {
            language: process.env.LANGUAGE || "en",
            fallbackFn: fallbackCompleteQuery,
            filterTextFn: buildCompleteFilterText,
            maxTokens: promptConfig.maxTokens,
          },
        );
        addCompleteQuery(queryMap, query, facetKey, value, {
          include: [{ [facetKey]: [value] }],
          exclude: [],
          strict: true,
        });
        informativeHintsByQuery[query] = createCompleteRangeHints(
          facetKey,
          value,
        );
      }
    }
  }

  const queries = Array.from(queryMap.values());

  return {
    generatedAt: new Date().toISOString(),
    sourcePath: path.relative(rootDir, sourcePath),
    queryCount: queries.length,
    regressionQueries: queries,
    informativeHintsByQuery,
  };
}

function toQueryLabel(facetKey, value) {
  if (facetKey === "bodyType") {
    const map = {
      LIMOUSINE: "sedans",
      SUV_OFFROADER: "SUVs",
      HATCHBACK: "hatchbacks",
      COUPE: "coupes",
      CABRIO_ROADSTER: "cabriolets",
      PEOPLE_CARRIER: "MPV",
    };
    return (
      map[String(value)] ||
      `${titleCaseFromToken(value)} vehicles`.toLowerCase()
    );
  }

  if (facetKey === "fuelType") {
    const map = {
      DIESEL: "diesel cars",
      ELECTRIC: "electric cars",
      PETROL: "petrol cars",
      PETROL_ELECTRIC_PLUGIN_HYBRID: "plug-in hybrid cars",
    };
    return (
      map[String(value)] || `${titleCaseFromToken(value)} cars`.toLowerCase()
    );
  }

  if (facetKey === "color") {
    const token = String(value).replace(/^PAINT_COLOR_/, "");
    return `${token.toLowerCase()} cars`;
  }

  if (facetKey === "stockType") {
    const map = {
      AVAILABLE: "available vehicles",
      IN_PIPELINE: "in-pipeline vehicles",
    };
    return (
      map[String(value)] ||
      `${titleCaseFromToken(value)} vehicles`.toLowerCase()
    );
  }

  if (facetKey === "brand") {
    return String(value);
  }

  if (facetKey === "seats") {
    return `${value}-seater vehicles`;
  }

  return titleCaseFromToken(value);
}

function toHintLabel(facetKey, value) {
  if (facetKey === "color") {
    const token = String(value).replace(/^PAINT_COLOR_/, "");
    return token.toLowerCase();
  }
  if (facetKey === "fuelType") {
    const map = {
      DIESEL: "diesel cars",
      ELECTRIC: "electric cars",
      PETROL: "petrol cars",
      PETROL_ELECTRIC_PLUGIN_HYBRID: "plug-in hybrid cars",
    };
    return map[String(value)] || String(value).toLowerCase().replace(/_/g, " ");
  }
  if (facetKey === "bodyType") {
    const map = {
      LIMOUSINE: "sedans",
      SUV_OFFROADER: "SUVs",
      HATCHBACK: "hatchbacks",
      COUPE: "coupes",
      CABRIO_ROADSTER: "cabriolets",
      PEOPLE_CARRIER: "MPV",
    };
    return map[String(value)] || String(value).toLowerCase().replace(/_/g, " ");
  }
  return String(value);
}

function facetDisplayName(facetKey) {
  const names = {
    bodyType: "body type",
    fuelType: "fuel type",
    color: "color",
    stockType: "stock type",
    brand: "brand",
    seats: "seat count",
    modelIdentifier: "model",
    motorization: "variant",
  };
  return names[facetKey] || facetKey;
}

function createExclusionHints(facetKey, excludedValue, allowedValues) {
  const facetName = facetDisplayName(facetKey);
  const excludedText = toHintLabel(facetKey, excludedValue);
  const allowedText = allowedValues
    .map((v) => toHintLabel(facetKey, v))
    .join(", ");
  return [
    `Respond with \"PASS\" if the response stays in Mercedes-Benz automotive context and recommends vehicles for this exclusion intent.`,
    `Respond with \"PASS\" when the requested ${facetName} exclusion is respected: exclude ${excludedText}.`,
    `Respond with \"PASS\" when any mentioned ${facetName} values align with the allowed inventory set: ${allowedText}.`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "FAIL: off-topic or unsafe response".`,
    `If the response includes the excluded ${facetName} value (${excludedText}) as part of recommendations, respond with "FAIL: included excluded ${facetName} (${excludedText})".`,
  ];
}

function createInclusionHints(facetKey, a, b) {
  const facetName = facetDisplayName(facetKey);
  const aText = toHintLabel(facetKey, a);
  const bText = toHintLabel(facetKey, b);
  return [
    `Respond with \"PASS\" if the response stays in Mercedes-Benz automotive context and gives recommendations for this multi-value intent.`,
    `Respond with \"PASS\" if the response addresses both requested ${facetName} values: ${aText} and ${bText}.`,
    `Respond with \"PASS\" if the response is concise but still explicitly references both requested ${facetName} values, optionally with result counts.`,
    `If one of the requested ${facetName} values is ignored, respond with "FAIL: missing ${facetName} value" and specify which value (${aText} or ${bText}) was not addressed.`,
    `If the response is off-topic, unsafe, or refuses without a valid safety reason, respond with "FAIL: off-topic or unsafe response".`,
  ];
}

function pairwise(values) {
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      out.push([values[i], values[j]]);
    }
  }
  return out;
}

function buildMatrix(data) {
  const facets = data?.data?.search?.facets || {};

  const regressionQueries = [];
  const informativeHintsByQuery = {};

  for (const facetKey of FACET_ORDER) {
    const values = getFacetValues(facets, facetKey);
    if (values.length === 0) {
      continue;
    }

    for (const excludedValue of values) {
      const allowedValues = values.filter((value) => value !== excludedValue);
      if (allowedValues.length === 0) {
        continue;
      }
      const query = `all vehicles except ${toQueryLabel(facetKey, excludedValue)}`;
      regressionQueries.push({
        value: query,
        shouldRecommend: true,
        shouldFilter: {
          include: [{ [facetKey]: allowedValues }],
          exclude: [],
          strict: false,
        },
      });
      informativeHintsByQuery[query] = createExclusionHints(
        facetKey,
        excludedValue,
        allowedValues,
      );
    }

    for (const [a, b] of pairwise(values)) {
      const left = toQueryLabel(facetKey, a);
      const right = toQueryLabel(facetKey, b);
      const andQuery = `show me only ${left} and ${right}`;
      const orQuery = `show me only ${left} or ${right}`;

      regressionQueries.push(
        {
          value: andQuery,
          shouldRecommend: true,
          shouldFilter: {
            include: [{ [facetKey]: [a, b] }],
            exclude: [],
            strict: false,
          },
        },
        {
          value: orQuery,
          shouldRecommend: true,
          shouldFilter: {
            include: [{ [facetKey]: [a, b] }],
            exclude: [],
            strict: false,
          },
        },
      );
      informativeHintsByQuery[andQuery] = createInclusionHints(facetKey, a, b);
      informativeHintsByQuery[orQuery] = createInclusionHints(facetKey, a, b);
    }
  }

  const dedupedMap = new Map();
  for (const query of regressionQueries) {
    if (!dedupedMap.has(query.value)) {
      dedupedMap.set(query.value, query);
    }
  }
  const dedupedQueries = Array.from(dedupedMap.values());

  return {
    generatedAt: new Date().toISOString(),
    sourcePath: path.relative(rootDir, sourcePath),
    queryCount: dedupedQueries.length,
    regressionQueries: dedupedQueries,
    informativeHintsByQuery,
  };
}

async function main() {
  const sourceData = readJson(sourcePath);
  const generated = buildMatrix(sourceData);
  const generatedComplete = await buildComplete(sourceData);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(generated, null, 2)}\n`,
    "utf8",
  );
  fs.mkdirSync(path.dirname(completeOutputPath), { recursive: true });
  fs.writeFileSync(
    completeOutputPath,
    `${JSON.stringify(generatedComplete, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `[matrix-generator] source: ${path.relative(rootDir, sourcePath)}`,
  );
  console.log(
    `[matrix-generator] output: ${path.relative(rootDir, outputPath)}`,
  );
  console.log(`[matrix-generator] queries: ${generated.queryCount}`);
  console.log(
    `[complete-generator] output: ${path.relative(rootDir, completeOutputPath)}`,
  );
  console.log(`[complete-generator] queries: ${generatedComplete.queryCount}`);
}

main().catch((error) => {
  console.error(`[generator] failed: ${error?.message || error}`);
  process.exitCode = 1;
});
