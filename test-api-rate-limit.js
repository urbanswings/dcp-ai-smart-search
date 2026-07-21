#!/usr/bin/env node
require("dotenv/config");

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DEFAULT_ENDPOINT =
  "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";

const DEFAULT_PAYLOAD = {
  operationName: "GetSearchResults",
  variables: {
    isUcos: false,
    limit: 12,
    sortingType: "price-asc",
    contextType: "B2C",
    page: 0,
    language: "ja",
    profileId: "JP-NEW_VEHICLES",
    vehicleCategory: "PASSENGER-CARS",
  },
  query: `query GetSearchResults($brand: [String!], $modelIdentifier: [VehicleClass!], $motorization: [String!], $bodyType: [BodyType!], $stockType: [StockItemState!], $price: ValueRange, $monthlyRate: ValueRange, $campaigns: [String!], $fuelType: [FuelTypeHarmonized!], $wltpRangeTotalAllIndividual: ValueRange, $chargeTimeDCHigh: ValueRange, $energyContent: ValueRange, $upholstery: [String!], $upholsteryPolish: [String!], $lines: [String!], $equipment: [String!], $colorPolish: [String!], $color: [String!], $dealerId: [String!], $isUcos: Boolean = false, $language: String, $limit: Int! = 10, $profileId: String!, $sortingType: String! = "price-asc", $contextType: ContextType! = B2C, $page: Int! = 0, $productCode: String, $variantId: String, $vehicleCategory: String!) {
  search(
    brand: $brand
    modelIdentifier: $modelIdentifier
    motorization: $motorization
    bodyType: $bodyType
    stockType: $stockType
    price: $price
    monthlyRate: $monthlyRate
    campaigns: $campaigns
    fuelType: $fuelType
    wltpRangeTotalAllIndividual: $wltpRangeTotalAllIndividual
    chargeTimeDCHigh: $chargeTimeDCHigh
    energyContent: $energyContent
    upholstery: $upholstery
    upholsteryPolish: $upholsteryPolish
    lines: $lines
    equipment: $equipment
    colorPolish: $colorPolish
    color: $color
    dealerId: $dealerId
    language: $language
    limit: $limit
    profileId: $profileId
    sortingType: $sortingType
    contextType: $contextType
    page: $page
    productCode: $productCode
    variantId: $variantId
    vehicleCategory: $vehicleCategory
  ) {
    facets {
      brand {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      modelIdentifier {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      motorization {
        ... on SimpleCountFacet {
          values {
            value
            count
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      bodyType {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      stockType {
        ... on SimpleCountFacet {
          values {
            value
            count
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      price {
        ... on RangeFacet {
          values {
            min
            max
            count
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      monthlyRate {
        ... on RangeFacet {
          values {
            min
            max
            count
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      campaigns {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      fuelType {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      wltpRangeTotalAllIndividual {
        ... on RangeFacet {
          values {
            min
            max
            count
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      chargeTimeDCHigh {
        ... on RangeFacet {
          values {
            min
            max
            count
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      energyContent {
        ... on RangeFacet {
          values {
            min
            max
            count
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      upholstery {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      upholsteryPolish {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      lines {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      equipment {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      colorPolish {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      color {
        ... on FormattedValueFacet {
          values {
            label
            formattedValue
            value
            count
            tags
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      dealerId {
        ... on SimpleCountFacet {
          values {
            value
            count
            __typename
          }
          facetType
          __typename
        }
        __typename
      }
      __typename
    }
    navigation {
      currentLimit
      currentPage
      currentSortingCode
      totalPages
      totalResults
      __typename
    }
    results {
      characteristics {
        stockCategories {
          code
          __typename
        }
        highlights {
          label
          __typename
        }
        campaigns {
          description
          footnote
          label
          __typename
        }
        __typename
      }
      consignorCompanyId
      dealer {
        addressGlobalLanguage
        addressLocalLanguage
        category
        companyId
        nameGlobalLanguage
        nameLocalLanguage
        outletId
        __typename
      }
      emissionAndConsumption {
        attributes {
          displayValue
          id
          label
          mustShowIn
          unit
          value
          __typename
        }
        footnotes
        testProcedure
        __typename
      }
      envkv {
        co2Classes {
          primary
          secondary
          __typename
        }
        __typename
      }
      estimatedArrivalDate
      identification {
        code
        commissionNumber
        dcpProductType
        dealerId
        dealerGroupName
        mpcId
        variantId
        vin
        vxVehicleId
        allDealers
        __typename
      }
      images {
        default
        __typename
      }
      productionDate
      preProductionVehicle
      stock {
        stockType
        __typename
      }
      stockCategory
      technicalInformation {
        engine {
          fuelType {
            ...TechnicalData
            __typename
          }
          power {
            ...PowerData
            __typename
          }
          __typename
        }
        transmission {
          ...TechnicalData
          __typename
        }
        __typename
      }
      usedVehicleData @include(if: $isUcos) {
        mileage {
          ...IntegerTechnicalData
          __typename
        }
        firstRegistrationDate
        vehicleInspection {
          maintenance
          __typename
        }
        warranty {
          status
          unlimitedDistance
          __typename
        }
        __typename
      }
      vehicleModel {
        baumuster
        bodyType {
          ...TechnicalData
          __typename
        }
        brand {
          ...TechnicalData
          __typename
        }
        category {
          ...TechnicalData
          __typename
        }
        facelift
        generation
        modelYear
        modelYearCode
        motorization
        name
        steeringPosition {
          ...TechnicalData
          __typename
        }
        typeClass
        vehicleClass {
          ...TechnicalData
          __typename
        }
        __typename
      }
      wholesale
      __typename
    }
    __typename
  }
}

fragment IntegerTechnicalData on IntegerTechnicalData {
  label
  formattedValue
  value
  unit
  __typename
}

fragment PowerData on Power {
  label
  formattedValue
  combustionKw {
    ...IntegerTechnicalData
    __typename
  }
  combustionHp {
    ...IntegerTechnicalData
    __typename
  }
  electricKw {
    ...IntegerTechnicalData
    __typename
  }
  electricHp {
    ...IntegerTechnicalData
    __typename
  }
  combinedKw {
    ...IntegerTechnicalData
    __typename
  }
  combinedHp {
    ...IntegerTechnicalData
    __typename
  }
  __typename
}

fragment TechnicalData on TechnicalData {
  label
  formattedValue
  value
  unit
  __typename
}`,
};

function printHelp() {
  console.log(`Usage:
  node test-api-rate-limit.js [options]

Options:
  --endpoint <url>         API endpoint (default: INT oneSearch GraphQL)
  --callsPerSec <number>   Max call launch rate per second (default: unlimited)
  --requests <number>      Total requests to send (default: 100)
  --concurrency <number>   Parallel requests in-flight (default: 10)
  --timeoutMs <number>     Request timeout in ms (default: 15000)
  --delayMs <number>       Delay between each request launch in ms (default: 0)
  --xApiKey <key>          X-API-KEY header (fallback: env X_API_KEY)
  --payloadFile <path>     Read request payload JSON from file
  --out <path>             Write detailed run output JSON to file
  --failOnRateLimit        Exit with code 2 if 429/503 is observed
  --help                   Show this help

Examples:
  npm run test:api-rate-limit
  npm run test:api-rate-limit -- --totalCalls 200 --simultaneous 25 --callsPerSec 20 --failOnRateLimit
  npm run test:api-rate-limit -- --xApiKey "$X_API_KEY" --payloadFile ./payload.json
`);
}

function parseArgs(argv) {
  const args = {
    endpoint: DEFAULT_ENDPOINT,
    totalCalls: 100,
    simultaneous: 10,
    callsPerSec: 0,
    timeoutMs: 15000,
    delayMs: 0,
    xApiKey: process.env.X_API_KEY || "",
    payloadFile: "",
    out: "",
    failOnRateLimit: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--failOnRateLimit") args.failOnRateLimit = true;
    else if (token === "--endpoint") args.endpoint = argv[++i];
    else if (token === "--requests" || token === "--totalCalls") {
      args.totalCalls = Number(argv[++i]);
    } else if (token === "--concurrency" || token === "--simultaneous") {
      args.simultaneous = Number(argv[++i]);
    } else if (token === "--callsPerSec") {
      args.callsPerSec = Number(argv[++i]);
    }
    else if (token === "--timeoutMs") args.timeoutMs = Number(argv[++i]);
    else if (token === "--delayMs") args.delayMs = Number(argv[++i]);
    else if (token === "--xApiKey") args.xApiKey = argv[++i];
    else if (token === "--payloadFile") args.payloadFile = argv[++i];
    else if (token === "--out") args.out = argv[++i];
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (!Number.isInteger(args.totalCalls) || args.totalCalls <= 0) {
    throw new Error("--totalCalls/--requests must be a positive integer");
  }
  if (!Number.isInteger(args.simultaneous) || args.simultaneous <= 0) {
    throw new Error("--simultaneous/--concurrency must be a positive integer");
  }
  if (!Number.isFinite(args.callsPerSec) || args.callsPerSec < 0) {
    throw new Error("--callsPerSec must be zero or a positive number");
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error("--timeoutMs must be a positive number");
  }
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
    throw new Error("--delayMs must be zero or positive");
  }

  return args;
}

function quantile(values, q) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDefaultOutPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("results", "json", "rate-limit", `rate-limit-${timestamp}.json`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  const payload = args.payloadFile
    ? JSON.parse(fs.readFileSync(args.payloadFile, "utf8"))
    : DEFAULT_PAYLOAD;

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (args.xApiKey) {
    headers["x-api-key"] = args.xApiKey;
  }

  const results = [];
  const statusCounts = {};
  let launched = 0;

  console.log("Starting API rate-limit test...");
  console.log(`Endpoint: ${args.endpoint}`);
  console.log(
    `Plan: totalCalls=${args.totalCalls}, simultaneous=${args.simultaneous}, callsPerSec=${args.callsPerSec || "unlimited"}, timeoutMs=${args.timeoutMs}, delayMs=${args.delayMs}`,
  );

  function printRequestLog(entry) {
    const statusLabel = entry.status === null ? "NETWORK_ERROR" : entry.status;
    const gqlLabel = entry.hasGraphQlErrors
      ? ` gqlErrors=${entry.graphQlErrorCount}`
      : "";
    const networkLabel = entry.networkError ? ` error=\"${entry.networkError}\"` : "";

    console.log(
      `[req ${String(entry.requestNumber).padStart(3, "0")}/${args.totalCalls}] status=${statusLabel} durationMs=${entry.durationMs}${gqlLabel}${networkLabel}`,
    );
  }

  const launchIntervalMs =
    args.callsPerSec > 0 ? Math.ceil(1000 / args.callsPerSec) : 0;
  let nextAllowedLaunchAt = Date.now();

  async function waitForLaunchSlot() {
    if (launchIntervalMs <= 0) return;

    const now = Date.now();
    const scheduled = Math.max(now, nextAllowedLaunchAt);
    nextAllowedLaunchAt = scheduled + launchIntervalMs;
    const waitMs = scheduled - now;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  async function runOne(requestNumber) {
    const startedAt = Date.now();
    const startedIso = new Date(startedAt).toISOString();

    try {
      const response = await axios.post(args.endpoint, payload, {
        headers,
        timeout: args.timeoutMs,
        validateStatus: () => true,
      });

      const durationMs = Date.now() - startedAt;
      const status = response.status;
      const statusKey = String(status);
      statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;

      results.push({
        requestNumber,
        startedAt: startedIso,
        durationMs,
        status,
        hasGraphQlErrors: Array.isArray(response.data?.errors) && response.data.errors.length > 0,
        graphQlErrorCount: Array.isArray(response.data?.errors) ? response.data.errors.length : 0,
      });

      printRequestLog(results[results.length - 1]);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const statusKey = "NETWORK_ERROR";
      statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;

      results.push({
        requestNumber,
        startedAt: startedIso,
        durationMs,
        status: null,
        hasGraphQlErrors: false,
        graphQlErrorCount: 0,
        networkError: error.message,
      });

      printRequestLog(results[results.length - 1]);
    }
  }

  async function worker() {
    while (true) {
      const current = launched;
      if (current >= args.totalCalls) break;
      launched += 1;
      await waitForLaunchSlot();
      if (args.delayMs > 0) await sleep(args.delayMs);
      await runOne(current + 1);
    }
  }

  const startedAt = Date.now();
  const workers = Array.from(
    { length: Math.min(args.simultaneous, args.totalCalls) },
    () => worker(),
  );
  await Promise.all(workers);
  const totalDurationMs = Date.now() - startedAt;

  const latencies = results.map((r) => r.durationMs);
  const rateLimited = (statusCounts["429"] || 0) + (statusCounts["503"] || 0);

  const summary = {
    endpoint: args.endpoint,
    requests: args.totalCalls,
    totalCalls: args.totalCalls,
    concurrency: args.simultaneous,
    simultaneous: args.simultaneous,
    callsPerSec: args.callsPerSec,
    timeoutMs: args.timeoutMs,
    delayMs: args.delayMs,
    usedXApiKey: Boolean(args.xApiKey),
    startedAt: new Date(startedAt).toISOString(),
    totalDurationMs,
    throughputRps: Number((args.totalCalls / Math.max(totalDurationMs / 1000, 0.001)).toFixed(2)),
    statusCounts,
    latencyMs: {
      min: Math.min(...latencies),
      p50: quantile(latencies, 0.5),
      p95: quantile(latencies, 0.95),
      max: Math.max(...latencies),
      average: Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)),
    },
    rateLimitSignals: {
      status429: statusCounts["429"] || 0,
      status503: statusCounts["503"] || 0,
      total: rateLimited,
    },
  };

  const outPath = args.out || buildDefaultOutPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ summary, results }, null, 2),
    "utf8",
  );

  console.log("API Rate Limit Test Summary");
  console.log("===========================");
  console.log(`Endpoint:       ${summary.endpoint}`);
  console.log(`Total calls:    ${summary.totalCalls}`);
  console.log(`Simultaneous:   ${summary.simultaneous}`);
  console.log(`Calls/sec:      ${summary.callsPerSec || "unlimited"}`);
  console.log(`Total time:     ${summary.totalDurationMs} ms`);
  console.log(`Throughput:     ${summary.throughputRps} req/s`);
  console.log(`Status counts:  ${JSON.stringify(summary.statusCounts)}`);
  console.log(
    `Latency (ms):   min=${summary.latencyMs.min}, p50=${summary.latencyMs.p50}, p95=${summary.latencyMs.p95}, max=${summary.latencyMs.max}, avg=${summary.latencyMs.average}`,
  );
  console.log(
    `Rate limit sig: 429=${summary.rateLimitSignals.status429}, 503=${summary.rateLimitSignals.status503}`,
  );
  console.log(`Saved output:   ${outPath}`);

  if (args.failOnRateLimit && rateLimited > 0) {
    console.error("Rate-limit signal detected and --failOnRateLimit enabled.");
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("Failed to run API rate-limit test:", error.message);
  process.exitCode = 1;
});
