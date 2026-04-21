const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const sourcePath = path.resolve(rootDir, process.env.MATRIX_SOURCE || "tests/data/emh-api-response.json");
const outputPath = path.resolve(rootDir, process.env.MATRIX_OUTPUT || "tests/data/generated-facet-matrix-suite.json");

const FACET_ORDER = ["bodyType", "fuelType", "color", "stockType", "brand", "seats"];

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
    .filter((value) => value !== undefined && value !== null && String(value).toUpperCase() !== "UNDEFINED");
  return [...new Set(extracted)];
}

function toQueryLabel(facetKey, value) {
  if (facetKey === "bodyType") {
    const map = {
      LIMOUSINE: "sedans",
      SUV_OFFROADER: "SUVs",
      HATCHBACK: "hatchbacks",
      COUPE: "coupes",
      CABRIO_ROADSTER: "cabriolets",
      PEOPLE_CARRIER: "people carriers",
    };
    return map[String(value)] || `${titleCaseFromToken(value)} vehicles`.toLowerCase();
  }

  if (facetKey === "fuelType") {
    const map = {
      DIESEL: "diesel cars",
      ELECTRIC: "electric cars",
      PETROL: "petrol cars",
      PETROL_ELECTRIC_PLUGIN_HYBRID: "plug-in hybrid cars",
    };
    return map[String(value)] || `${titleCaseFromToken(value)} cars`.toLowerCase();
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
    return map[String(value)] || `${titleCaseFromToken(value)} vehicles`.toLowerCase();
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
      PEOPLE_CARRIER: "people carriers",
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
  };
  return names[facetKey] || facetKey;
}

function createExclusionHints(facetKey, excludedValue, allowedValues) {
  const facetName = facetDisplayName(facetKey);
  const excludedText = toHintLabel(facetKey, excludedValue);
  const allowedText = allowedValues.map((v) => toHintLabel(facetKey, v)).join(", ");
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

  const regressionQueryValues = [];
  const shouldFilterMap = {};
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
      regressionQueryValues.push(query);
      shouldFilterMap[query] = { [facetKey]: allowedValues };
      informativeHintsByQuery[query] = createExclusionHints(facetKey, excludedValue, allowedValues);
    }

    for (const [a, b] of pairwise(values)) {
      const left = toQueryLabel(facetKey, a);
      const right = toQueryLabel(facetKey, b);
      const andQuery = `show me only ${left} and ${right}`;
      const orQuery = `show me only ${left} or ${right}`;

      regressionQueryValues.push(andQuery, orQuery);
      shouldFilterMap[andQuery] = { [facetKey]: [a, b] };
      shouldFilterMap[orQuery] = { [facetKey]: [a, b] };
      informativeHintsByQuery[andQuery] = createInclusionHints(facetKey, a, b);
      informativeHintsByQuery[orQuery] = createInclusionHints(facetKey, a, b);
    }
  }

  const dedupedQueries = [...new Set(regressionQueryValues)];

  return {
    generatedAt: new Date().toISOString(),
    sourcePath: path.relative(rootDir, sourcePath),
    queryCount: dedupedQueries.length,
    regressionQueryValues: dedupedQueries,
    shouldFilterMap,
    informativeHintsByQuery,
  };
}

function main() {
  const sourceData = readJson(sourcePath);
  const generated = buildMatrix(sourceData);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(generated, null, 2)}\n`, "utf8");

  console.log(`[matrix-generator] source: ${path.relative(rootDir, sourcePath)}`);
  console.log(`[matrix-generator] output: ${path.relative(rootDir, outputPath)}`);
  console.log(`[matrix-generator] queries: ${generated.queryCount}`);
}

main();
