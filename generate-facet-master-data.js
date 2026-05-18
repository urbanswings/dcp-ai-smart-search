'use strict';

/**
 * Iterates over all supported EMH markets, calls the EMH GraphQL API for each,
 * and merges any new facet keys/values (delta) into tests/data/facets-master-data.json.
 *
 * Usage:
 *   node generate-facet-master-data.js
 *   ENVIRONMENT=PREPROD node generate-facet-master-data.js
 *   X_API_KEY=<key> node generate-facet-master-data.js
 */

const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');

// Load .env so X_API_KEY and other variables are available without manual export
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// All market + product combinations matching EMH_COUNTRY_QUERIES in apiHelpers.ts
const MARKETS = [
  { country: 'TR', product: 'NCOS', language: 'TR' },
  { country: 'AU', product: 'NCOS', language: 'EN' },
  { country: 'IN', product: 'NCOS', language: 'EN' },
  { country: 'SG', product: 'NCOS', language: 'EN' },
  { country: 'KR', product: 'NCOS', language: 'KO' },
  { country: 'TH', product: 'NCOS', language: 'EN' },
  { country: 'TR', product: 'UCOS', language: 'TR' },
  { country: 'KR', product: 'UCOS', language: 'KO' },
];

const ENV = (process.env.ENVIRONMENT || 'INT').toUpperCase();
const VEHICLE_CATEGORY = process.env.VEHICLE_CATEGORY || 'PASSENGER-CARS';
const FACETS_MASTER_DATA_PATH = path.resolve(__dirname, 'tests/data/facets-master-data.json');

// Comprehensive facets-only GraphQL query covering all known facet fields across markets.
// Using limit:1 to minimise payload — we only need facet metadata, not results.
// Fields absent for a given market/profile will be returned as null and are skipped.
const FACETS_QUERY = `
query GetFacetsOnly(
  $language: String,
  $limit: Int! = 1,
  $profileId: String!,
  $sortingType: String! = "price-asc",
  $contextType: ContextType! = B2C,
  $page: Int! = 0,
  $vehicleCategory: String!
) {
  search(
    language: $language
    limit: $limit
    profileId: $profileId
    sortingType: $sortingType
    contextType: $contextType
    page: $page
    vehicleCategory: $vehicleCategory
  ) {
    facets {
      brand            { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      modelIdentifier  { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      bodyType         { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      fuelType         { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      driveType        { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      gearbox          { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      upholstery       { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      upholsteryPolish { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      packages         { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      lines            { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      equipment        { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      colorPolish      { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      color            { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      campaigns        { ... on FormattedValueFacet { values { label formattedValue value count tags } facetType } }
      stockType        { ... on SimpleCountFacet    { values { value count } facetType } }
      motorization     { ... on SimpleCountFacet    { values { value count } facetType } }
      dealerId         { ... on SimpleCountFacet    { values { value count } facetType } }
      seats            { ... on NumberCountFacet    { values { value count } facetType } }
      price                       { ... on RangeFacet { values { min max count } facetType } }
      monthlyRate                 { ... on RangeFacet { values { min max count } facetType } }
      enginePowerHP               { ... on RangeFacet { values { min max count } facetType } }
      enginePowerKW               { ... on RangeFacet { values { min max count } facetType } }
      wltpRangeTotalAllIndividual { ... on RangeFacet { values { min max count } facetType } }
      chargeTimeDCHigh            { ... on RangeFacet { values { min max count } facetType } }
      energyContent               { ... on RangeFacet { values { min max count } facetType } }
      modelYear                   { ... on RangeFacet { values { min max count } facetType } }
      torque                      { ... on RangeFacet { values { min max count } facetType } }
      loadspaceVolume             { ... on RangeFacet { values { min max count } facetType } }
      loadspaceLength             { ... on RangeFacet { values { min max count } facetType } }
      loadspaceWidth              { ... on RangeFacet { values { min max count } facetType } }
      loadspaceHeight             { ... on RangeFacet { values { min max count } facetType } }
      wheelbase                   { ... on RangeFacet { values { min max count } facetType } }
      vehicleHeight               { ... on RangeFacet { values { min max count } facetType } }
      payload                     { ... on RangeFacet { values { min max count } facetType } }
      maximumWeight               { ... on RangeFacet { values { min max count } facetType } }
      mileage                     { ... on RangeFacet { values { min max count } facetType } }
      firstRegistrationDate       { ... on DateRangeFacet { values { min max count } facetType } }
    }
    navigation { totalResults }
  }
}
`.trim();

// ── helpers matching syncFacetsMasterDataFromEmhResponse in apiHelpers.ts ──────

function stripFacetMetadata(value) {
  if (Array.isArray(value)) {
    return value.map(stripFacetMetadata);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== 'count' && k !== '__typename')
        .map(([k, v]) => [k, stripFacetMetadata(v)])
    );
  }
  return value;
}

function getFacetValueIdentifier(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return `value:${JSON.stringify(value.value)}`;
  }
  return JSON.stringify(value);
}

async function syncFacets(emhApiResponse, marketLanguage) {
  const emhFacets = emhApiResponse && emhApiResponse.data && emhApiResponse.data.search && emhApiResponse.data.search.facets;
  if (!emhFacets || typeof emhFacets !== 'object') {
    return { addedKeys: [], addedValues: [] };
  }
  
  // Only merge values from English-language markets to keep labels consistent in EN
  const isEnglishMarket = marketLanguage === 'EN';
  if (!isEnglishMarket) {
    return { addedKeys: [], addedValues: [] };
  }

  let masterData = {};
  try {
    const masterContent = await fs.readFile(FACETS_MASTER_DATA_PATH, 'utf-8');
    // Guard against empty or whitespace-only files
    if (masterContent && masterContent.trim()) {
      masterData = JSON.parse(masterContent);
    }
    // Otherwise: file is empty, start fresh with {}
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist — start fresh
    } else {
      // JSON parse error or other read error — log and start fresh
      console.error(`Warning: Could not parse ${FACETS_MASTER_DATA_PATH}: ${err.message}. Starting fresh.`);
    }
  }
  const addedKeys = [];
  const addedValues = [];

  for (const [facetKey, rawFacet] of Object.entries(emhFacets)) {
    if (facetKey === '__typename' || !rawFacet || typeof rawFacet !== 'object') {
      continue;
    }

    const sanitizedFacet = stripFacetMetadata(rawFacet);
    const masterFacet = masterData[facetKey];

    if (!masterFacet) {
      masterData[facetKey] = sanitizedFacet;
      addedKeys.push(facetKey);
      continue;
    }

    if (sanitizedFacet.facetType && !masterFacet.facetType) {
      masterFacet.facetType = sanitizedFacet.facetType;
    }

    if (Array.isArray(sanitizedFacet.values)) {
      if (!Array.isArray(masterFacet.values)) {
        masterFacet.values = [];
      }
      const existingIds = new Set(masterFacet.values.map(getFacetValueIdentifier));
      for (const value of sanitizedFacet.values) {
        const id = getFacetValueIdentifier(value);
        if (!existingIds.has(id)) {
          masterFacet.values.push(value);
          existingIds.add(id);
          addedValues.push(
            `${facetKey}:${value && typeof value === 'object' && 'value' in value ? String(value.value) : JSON.stringify(value)}`
          );
        }
      }
    } else if (sanitizedFacet.values && typeof sanitizedFacet.values === 'object' && !masterFacet.values) {
      masterFacet.values = sanitizedFacet.values;
      addedValues.push(`${facetKey}:range`);
    }
  }

  await fs.writeFile(FACETS_MASTER_DATA_PATH, JSON.stringify(masterData, null, 2), 'utf-8');
  return { addedKeys, addedValues };
}

// ── EMH API call ────────────────────────────────────────────────────────────────

function getApiUrl() {
  if (process.env.API_ENDPOINT_LOCAL === 'true') {
    return 'http://localhost:8080/api/v2/search/proxy';
  }
  if (ENV === 'PROD') {
    return 'https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql';
  }
  if (ENV === 'INT') {
    return 'https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql';
  }
  return 'https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql';
}

async function fetchMarket(market) {
  const { country, product, language } = market;
  const profileId = `${country}-${product === 'UCOS' ? 'USED_VEHICLES' : 'NEW_VEHICLES'}`;

  const payload = {
    operationName: 'GetFacetsOnly',
    variables: {
      contextType: 'B2C',
      language,
      limit: 1,
      page: 0,
      profileId,
      sortingType: 'price-asc',
      vehicleCategory: VEHICLE_CATEGORY,
    },
    query: FACETS_QUERY,
  };

  const apiUrl = getApiUrl();
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.API_ENDPOINT_LOCAL !== 'true' && process.env.X_API_KEY) {
    headers['X-Api-Key'] = process.env.X_API_KEY;
  }

  let response;
  try {
    response = await axios.post(apiUrl, payload, { 
      headers, 
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: [(data) => data],  // Return raw text without parsing
    });
  } catch (err) {
    throw new Error(`Axios error: ${err.message}`);
  }

  // Debug: log response status and size
  const respLen = response.data ? String(response.data).length : 0;
  if (respLen === 0 || response.status !== 200) {
    console.error(`\n[DEBUG ${market.country}-${market.product}] status=${response.status} len=${respLen}`);
  }

  // Ensure response.data is properly parsed JSON
  let data = response.data;
  
  // Check HTTP status first
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}: ${typeof data === 'string' ? data.substring(0, 200) : 'non-JSON response'}`);
  }
  
  // Parse JSON from text response
  if (typeof data === 'string') {
    if (!data || data.trim() === '') {
      throw new Error('Empty response body');
    }
    try {
      data = JSON.parse(data);
    } catch (err) {
      // Log first 500 chars to help debug
      const preview = data.substring(0, 500);
      throw new Error(`JSON parse error: ${err.message}. Response preview: ${preview}...`);
    }
  }

  if (data && data.errors && data.errors.length > 0) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }

  return data;
}

// ── main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`generate-facet-master-data  ENV=${ENV}`);
  console.log(`Markets: ${MARKETS.map(m => `${m.country}-${m.product}`).join(', ')}\n`);

  let succeeded = 0;
  let failed = 0;

  for (const market of MARKETS) {
    const key = `${market.country}-${market.product}`;
    process.stdout.write(`[${key}] fetching... `);

    try {
      const data = await fetchMarket(market);
      const { addedKeys, addedValues } = await syncFacets(data, market.language);
      const summary = `+${addedKeys.length} keys, +${addedValues.length} values`;
      console.log(`OK  (${summary})`);
      if (addedKeys.length > 0) console.log(`    new keys: ${addedKeys.join(', ')}`);
      succeeded++;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (err && err.stack) {
        console.log(`FAILED  ${msg}`);
        console.log(err.stack.split('\n').slice(1, 3).join('\n'));
      } else {
        console.log(`FAILED  ${msg}`);
      }
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded}/${MARKETS.length} succeeded, ${failed} failed.`);
  if (failed === 0) {
    console.log('tests/data/facets-master-data.json updated with all market deltas.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
