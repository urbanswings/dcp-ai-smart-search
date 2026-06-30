import axios from "axios";
import fs from "fs/promises";
import http from "http";
import path from "path";
import {
  normalizeFacetToken,
  validateExpectedFacets,
} from "./facetAssertionHelpers";
import {
  GET_SMARTSEARCH_RESULTS_COUNTRY_QUERIES,
  getEmhGraphqlQuery,
} from "./graphqlQueries";
import {
  addFailureReason,
  evaluateSmartSearchMessage,
  extractSmartSearchParameters,
  getCountStatus,
  getSmartSearchResultCount,
  isPassEvaluation,
  logResultSummary,
  translateResultText,
  validateLanguageConsistency,
  validateResponseVehicleCount,
} from "./resultEvaluationHelpers";

export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const LANGUAGE = process.env.LANGUAGE;
export const PRODUCT = process.env.PRODUCT;
export const VEHICLE_CATEGORY = process.env.VEHICLE_CATEGORY;

const FACETS_MASTER_DATA_PATH = path.resolve(
  __dirname,
  "../data/facets-master-data.json",
);

export interface ApiSearchResult {
  query: string;
  results: any;
  responseTime: number;
  statusCode: number;
  error?: string;
}

export interface ApiClient {
  searchEndpoint: string;
  baseURL: string;
  headers: Record<string, string>;
}

export class SearchApiClient {
  private client: any;
  private baseURL: string;

  constructor() {
    const env = process.env.ENVIRONMENT?.toUpperCase();

    // Determine base URL based on environment
    if (env === "PROD" || env === "PRODUCTION") {
      this.baseURL = "https://shop.mercedes-benz.com";
    } else {
      // Default to INT for staging, dev, or any other environment
      this.baseURL = "https://shop-int.mercedes-benz.com";
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        Accept: "application/json",
        "User-Agent": "AI-Smart-Search-Test/1.0",
      },
    });
  }

  async getSmartSearchQuery(query: string): Promise<ApiSearchResult> {
    const startTime = Date.now();
    try {
      const countryCode = getCountryCode();
      const locale = getLocale();
      const languageCode = getLanguageCode();
      const salesChannel = getSalesChannel();

      const endpoint = `/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`;

      const payload = {
        request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
        user_query: query,
        country_code: countryCode,
        sales_channel: salesChannel,
        lang: languageCode,
      };

      const response = await this.client.post(endpoint, payload);

      const responseTime = Date.now() - startTime;

      let responseData = response.data;
      if (typeof responseData === "string") {
        try {
          responseData = JSON.parse(responseData);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }

      return {
        query,
        results: {
          query,
          responseData,
        },
        responseTime,
        statusCode: response.status,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      let errorMessage = error.message || "Unknown API error";

      if (error.response?.data) {
        errorMessage += ` | Response: ${JSON.stringify(error.response.data)}`;
      }

      return {
        query,
        results: null,
        responseTime,
        statusCode: error.response?.status || 0,
        error: errorMessage,
      };
    }
  }

  async performSearch(query: any): Promise<ApiSearchResult> {
    const startTime = Date.now();
    const project = process.env.PROJECT?.toUpperCase() || "DCP";

    if (project === "EMH") {
      return this.performEmhSearchWithFacets(query, undefined, startTime);
    }

    try {
      const countryCode = getCountryCode();
      const locale = getLocale();
      const languageCode = getLanguageCode();
      const salesChannel = getSalesChannel();

      const endpoint = `/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`;

      const payload = {
        request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
        user_query: query,
        country_code: countryCode,
        sales_channel: salesChannel,
        lang: languageCode,
      };

      const response = await this.client.post(endpoint, payload);

      const responseTime = Date.now() - startTime;

      let responseData = response.data;
      if (typeof responseData === "string") {
        try {
          responseData = JSON.parse(responseData);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }

      return {
        query,
        results: {
          query,
          responseData,
        },
        responseTime,
        statusCode: response.status,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      let errorMessage = error.message || "Unknown API error";

      if (error.response?.data) {
        errorMessage += ` | Response: ${JSON.stringify(error.response.data)}`;
      }

      return {
        query,
        results: null,
        responseTime,
        statusCode: error.response?.status || 0,
        error: errorMessage,
      };
    }
  }

  async performSearchWithFacets(
    query: string,
    facets?: Record<string, any>,
  ): Promise<ApiSearchResult> {
    const startTime = Date.now();
    const project = process.env.PROJECT?.toUpperCase() || "DCP";

    if (project === "EMH") {
      return this.performEmhSearchWithFacets(query, facets, startTime);
    }

    try {
      const countryCode = getCountryCode();
      const locale = getLocale();
      const languageCode = getLanguageCode();
      const salesChannel = getSalesChannel();

      const endpoint = `/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`;

      const payload = {
        request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
        user_query: query,
        country_code: countryCode,
        sales_channel: salesChannel,
        lang: languageCode,
        ...(facets && facets),
      };

      const response = await this.client.post(endpoint, payload);

      const responseTime = Date.now() - startTime;

      let responseData = response.data;
      if (typeof responseData === "string") {
        try {
          responseData = JSON.parse(responseData);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }

      return {
        query,
        results: {
          query,
          responseData,
        },
        responseTime,
        statusCode: response.status,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      let errorMessage = error.message || "Unknown API error";

      if (error.response?.data) {
        errorMessage += ` | Response: ${JSON.stringify(error.response.data)}`;
      }

      return {
        query,
        results: null,
        responseTime,
        statusCode: error.response?.status || 0,
        error: errorMessage,
      };
    }
  }

  private async performEmhSearchWithFacets(
    query: any,
    _facets?: Record<string, any>,
    startTime?: number,
  ): Promise<ApiSearchResult> {
    const responseStartTime = startTime || Date.now();
    try {
      const env = ENVIRONMENT || "INT";
      const country = getCountryCode();
      const language = getLanguageCode();
      const product = PRODUCT?.toUpperCase() || "UCOS";
      const salesChannel = getSalesChannel();
      const vehicleCategory =
        VEHICLE_CATEGORY?.toUpperCase() || "PASSENGER-CARS";

      const endpoint =
        process.env.API_ENDPOINT_LOCAL === "true"
          ? "http://localhost:8080/api/v2/search"
          : env?.toUpperCase() === "PROD"
            ? "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql"
            : env?.toUpperCase() === "INT"
              ? "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql"
              : "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";

      const actualInput = query?.value ?? query;
      const payload =
        process.env.API_ENDPOINT_LOCAL === "true"
          ? {
              country_code: country,
              lang: language,
              request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
              sales_channel: salesChannel,
              user_query: actualInput,
              vehicle_category: vehicleCategory,
            }
          : {
              operationName: "GetSmartSearchResults",
              variables: {
                contextType: "B2C",
                isUcos: product === "UCOS",
                language: language,
                limit: 12,
                profileId: `${country}-${
                  product === "UCOS" ? "USED_VEHICLES" : "NEW_VEHICLES"
                }`,
                query: actualInput,
                sortingType: "price-asc",
              },
              query: undefined,
            };

      // Use the appropriate query from the constant based on vehicle type
      const vehicleTypeKey =
        product === "UCOS" ? "USED_VEHICLES" : "NEW_VEHICLES";
      const queryKey = `${country.toUpperCase()}-${vehicleTypeKey}`;

      if (
        process.env.API_ENDPOINT_LOCAL !== "true" &&
        payload &&
        "query" in payload
      ) {
        (payload as any).query =
          GET_SMARTSEARCH_RESULTS_COUNTRY_QUERIES[queryKey] ||
          GET_SMARTSEARCH_RESULTS_COUNTRY_QUERIES["AU-NEW_VEHICLES"];
      }

      const isLocalEndpoint = process.env.API_ENDPOINT_LOCAL === "true";
      const requestConfig = {
        timeout: 40000,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "AI-Smart-Search-Test/1.0",
          ...(isLocalEndpoint && {
            Connection: "close",
          }),
          ...(process.env.API_ENDPOINT_LOCAL !== "true" && {
            "X-Api-Key": process.env.X_API_KEY || "",
          }),
        },
        ...(isLocalEndpoint && {
          httpAgent: new http.Agent({ keepAlive: false }),
        }),
      };

      let response;
      try {
        response = await axios.post(endpoint, payload, requestConfig);
      } catch (error: any) {
        if (isLocalEndpoint && error?.code === "ECONNRESET") {
          response = await axios.post(endpoint, payload, requestConfig);
        } else {
          throw error;
        }
      }

      const responseTime = Date.now() - responseStartTime;
      let responseData = response.data;
      if (typeof responseData === "string") {
        try {
          responseData = JSON.parse(responseData);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }

      // Handle different response structures for local endpoint
      if (process.env.API_ENDPOINT_LOCAL === "true") {
        const endpoint = "http://localhost:8080/api/v2/search/proxy";
        const payload = {
          operationName: "GetSearchResults",
          variables: responseData.search.variables || {},
          query: responseData.search.query || query,
        };
        const response = await axios.post(endpoint, payload, {
          timeout: 30000,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "AI-Smart-Search-Test/1.0",
            Connection: "close",
          },
          httpAgent: new http.Agent({ keepAlive: false }),
        });
        let data = response.data;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch (e) {
            // If parsing fails, keep as string
          }
        }

        if (response.data?.errors) {
          throw new Error(`API Error: ${JSON.stringify(response.data.errors)}`);
        }

        // Local endpoint returns: { request_id, messageToUser, search: { operationName, variables, query } }
        // We need to normalize this to match the expected structure
        const normalizedData = {
          smartSearchResponse: {
            message: responseData.messageToUser,
            request_id: responseData.request_id,
          },
          data: {
            smartSearch: {
              parameters: Object.fromEntries(
                Object.entries(responseData.search.variables || {}).filter(
                  ([_, value]) => value !== null,
                ),
              ),
              message: responseData.messageToUser,
              facets: data.data.search.facets,
              navigation: data.data.search.navigation,
              results: data.data.search.results,
            },
          },
        };

        return {
          query,
          results: {
            resultText: responseData.messageToUser,
            responseData: normalizedData,
          },
          responseTime,
          statusCode: response.status,
        };
      } else {
        const normalizedData = {
          smartSearchResponse: {
            message: responseData.data.smartSearch.message,
            request_id: null,
          },
          data: {
            smartSearch: {
              parameters: responseData.data.smartSearch.parameters,
              message: responseData.data.smartSearch.message,
              facets: responseData.data.smartSearch.facets,
              navigation: responseData.data.smartSearch.navigation,
              results: responseData.data.smartSearch.results,
            },
          },
        };

        return {
          query,
          results: {
            resultText: responseData.data.smartSearch.message,
            responseData: normalizedData,
          },
          responseTime,
          statusCode: response.status,
        };
      }
    } catch (error: any) {
      const responseTime = Date.now() - responseStartTime;
      let errorMessage = error.message || "Unknown API error";

      if (error.response?.data) {
        errorMessage += ` | Response: ${JSON.stringify(error.response.data)}`;
      }

      return {
        query,
        results: null,
        responseTime,
        statusCode: error.response?.status || 0,
        error: errorMessage,
      };
    }
  }
}

export function getCountryCode(): string {
  return process.env.COUNTRY?.toUpperCase() || "KR";
}

export function getLocale(): string {
  return (process.env.COUNTRY || "kr").toLowerCase();
}

export function getLanguageCode(): string {
  const country = getCountryCode();
  const languageByCountry: Record<string, string> = {
    KR: "ko",
    TH: "th",
    TR: "tr",
  };

  return (
    languageByCountry[country] ||
    process.env.LANGUAGE ||
    "en"
  ).toLowerCase();
}

export function getSalesChannel(): string {
  return process.env.PRODUCT?.toUpperCase() === "NCOS"
    ? "first_hand"
    : "second_hand";
}

export async function performApiSmartSearchAndGetResults(
  query: any = "",
  facets?: Record<string, any>,
): Promise<ApiSearchResult> {
  const apiClient = new SearchApiClient();

  if (facets) return await apiClient.performSearchWithFacets(query, facets);

  return await apiClient.performSearch(query);
}

function stripFacetMetadata(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => stripFacetMetadata(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "count" && key !== "__typename")
        .map(([key, nestedValue]) => [key, stripFacetMetadata(nestedValue)]),
    );
  }

  return value;
}

function getFacetValueIdentifier(value: any): string {
  if (value && typeof value === "object" && "value" in value) {
    return `value:${JSON.stringify(value.value)}`;
  }

  return JSON.stringify(value);
}

async function syncFacetsMasterDataFromEmhResponse(
  emhApiResponse: any,
): Promise<{ addedKeys: string[]; addedValues: string[] }> {
  const emhFacets = emhApiResponse?.data?.search?.facets;

  if (!emhFacets || typeof emhFacets !== "object") {
    return { addedKeys: [], addedValues: [] };
  }

  const masterContent = await fs.readFile(FACETS_MASTER_DATA_PATH, "utf-8");
  const masterData = JSON.parse(masterContent);
  const addedKeys: string[] = [];
  const addedValues: string[] = [];

  for (const [facetKey, rawFacet] of Object.entries(emhFacets)) {
    if (
      facetKey === "__typename" ||
      !rawFacet ||
      typeof rawFacet !== "object"
    ) {
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

      const existingIdentifiers = new Set(
        masterFacet.values.map((value: any) => getFacetValueIdentifier(value)),
      );

      for (const value of sanitizedFacet.values) {
        const identifier = getFacetValueIdentifier(value);

        if (existingIdentifiers.has(identifier)) {
          continue;
        }

        masterFacet.values.push(value);
        existingIdentifiers.add(identifier);
        addedValues.push(
          `${facetKey}:${
            value && typeof value === "object" && "value" in value
              ? String(value.value)
              : JSON.stringify(value)
          }`,
        );
      }
    } else if (
      sanitizedFacet.values &&
      typeof sanitizedFacet.values === "object" &&
      !masterFacet.values
    ) {
      masterFacet.values = sanitizedFacet.values;
      addedValues.push(`${facetKey}:range`);
    }
  }

  await fs.writeFile(
    FACETS_MASTER_DATA_PATH,
    JSON.stringify(masterData, null, 2),
    "utf-8",
  );

  return { addedKeys, addedValues };
}

export async function fetchEmhApiResponse(): Promise<any> {
  const env = ENVIRONMENT || "INT";
  const country = process.env.COUNTRY || COUNTRY || "TR";
  const product = PRODUCT || "NCOS";
  const language = getLanguageCode();
  const vehicleCategory = VEHICLE_CATEGORY || "PASSENGER-CARS";

  try {
    const apiUrl =
      process.env.API_ENDPOINT_LOCAL === "true"
        ? "http://localhost:8080/api/v2/search/proxy"
        : env?.toUpperCase() === "PROD"
          ? "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql"
          : env?.toUpperCase() === "INT"
            ? "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql"
            : "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";

    console.log(
      `[EMH API] env=${env} country=${country} product=${product} language=${language} vehicleCategory=${vehicleCategory} endpoint=${apiUrl} xApiKey=${process.env.X_API_KEY ? "set" : "missing"}`,
    );

    let graphqlPayload = {
      operationName: "GetSearchResults",
      variables: {
        contextType: "B2C",
        isUcos: product === "UCOS",
        language: `${language}`,
        limit: 12,
        page: 0,
        profileId: `${country}-${
          product === "UCOS" ? "USED_VEHICLES" : "NEW_VEHICLES"
        }`,
        sortingType: "price-asc",
        vehicleCategory: vehicleCategory,
      },
      query: getEmhGraphqlQuery(country, product),
    };

    if (process.env.API_ENDPOINT_LOCAL === "true") {
      (graphqlPayload.variables as any) = {
        contextType: "B2C",
        isUcos: product === "UCOS",
        limit: 12,
        page: 0,
        sortingType: "price-asc",
        language: `${language}`,
        profileId: `${country}-${
          product === "UCOS" ? "USED_VEHICLES" : "NEW_VEHICLES"
        }`,
        vehicleCategory: vehicleCategory,
        modelIdentifier: null,
        color: null,
        upholstery: null,
        brand: null,
        fuelType: null,
        bodyType: null,
        equipment: null,
        motorization: null,
        price: null,
        mileage: null,
        modelYear: null,
        enginePowerHP: null,
        enginePowerKW: null,
      };
      (graphqlPayload.query as any) =
        'query GetSearchResults($baumuster4: String, $bodyType: [BodyType!], $brand: [String!], $buildType: [String!], $campaigns: [String!], $color: [String!], $colorName: [String!], $colorPolish: [String!], $contextType: ContextType! = B2C, $dealerId: [String!], $dealerFittedOptions: [String!], $driveType: [TypeOfPropulsion!], $enginePowerHP: IntRange, $enginePowerKW: IntRange, $equipment: [String!], $estimatedArrivalDate: DateRange, $facelift: Int, $firstRegistrationDate: DateRange, $fuelType: [FuelTypeHarmonized!], $gearbox: [TransmissionCategory!], $generation: [Generation!], $isUcos: Boolean = false, $language: String, $lines: [String!], $limit: Int! = 10, $loadspaceHeight: IntRange, $loadspaceLength: IntRange, $loadspaceVolume: IntRange, $loadspaceWidth: IntRange, $maximumWeight: IntRange, $mileage: IntRange, $modelDesignation: [String!], $modelIdentifier: [VehicleClass!], $modelYear: IntRange, $monthlyRate: ValueRange, $motorization: [String!], $packages: [String!], $page: Int! = 0, $payload: IntRange, $price: ValueRange, $productCode: String, $productionDate: DateRange, $profileId: String!, $registrationType: [String!], $seats: [Int!], $sortingType: String! = "price-asc", $stockCategories: [String!], $stockType: [StockItemState!], $torque: IntRange, $typeClass: [String!], $ucNumber: String, $upholstery: [String!], $upholsteryName: [String!], $upholsteryPolish: [String!], $variantId: String, $vehicleCategory: String!, $vehicleHeight: IntRange, $wheelbase: IntRange) {\n  search(\n    baumuster4: $baumuster4\n    bodyType: $bodyType\n    brand: $brand\n    buildType: $buildType\n    campaigns: $campaigns\n    color: $color\n    colorName: $colorName\n    colorPolish: $colorPolish\n    contextType: $contextType\n    dealerId: $dealerId\n    dealerFittedOptions: $dealerFittedOptions\n    driveType: $driveType\n    enginePowerHP: $enginePowerHP\n    enginePowerKW: $enginePowerKW\n    equipment: $equipment\n    estimatedArrivalDate: $estimatedArrivalDate\n    facelift: $facelift\n    firstRegistrationDate: $firstRegistrationDate\n    fuelType: $fuelType\n    gearbox: $gearbox\n    generation: $generation\n    language: $language\n    lines: $lines\n    limit: $limit\n    loadspaceHeight: $loadspaceHeight\n    loadspaceLength: $loadspaceLength\n    loadspaceVolume: $loadspaceVolume\n    loadspaceWidth: $loadspaceWidth\n    maximumWeight: $maximumWeight\n    mileage: $mileage\n    modelDesignation: $modelDesignation\n    modelIdentifier: $modelIdentifier\n    modelYear: $modelYear\n    monthlyRate: $monthlyRate\n    motorization: $motorization\n    packages: $packages\n    page: $page\n    payload: $payload\n    price: $price\n    productCode: $productCode\n    productionDate: $productionDate\n    profileId: $profileId\n    registrationType: $registrationType\n    seats: $seats\n    sortingType: $sortingType\n    stockCategories: $stockCategories\n    stockType: $stockType\n    torque: $torque\n    typeClass: $typeClass\n    ucNumber: $ucNumber\n    upholstery: $upholstery\n    upholsteryName: $upholsteryName\n    upholsteryPolish: $upholsteryPolish\n    variantId: $variantId\n    vehicleCategory: $vehicleCategory\n    vehicleHeight: $vehicleHeight\n    wheelbase: $wheelbase\n  ) {\n    facets { bodyType { ...FormattedValueFacet } brand { ...FormattedValueFacet } buildType { ...SimpleCountFacet } campaigns { ...FormattedValueFacet } color { ...FormattedValueFacet } colorName { ...FormattedValueFacet } colorPolish { ...FormattedValueFacet } dealerFittedOptions { ...FormattedValueFacet } dealerId { ...SimpleCountFacet } driveType { ...FormattedValueFacet } enginePowerHP { ...RangeFacet } enginePowerKW { ...RangeFacet } equipment { ...FormattedValueFacet } estimatedArrivalDate { ...DateRangeFacet } fuelType { ...FormattedValueFacet } gearbox { ...FormattedValueFacet } generation { ...SimpleCountFacet } lines { ...FormattedValueFacet } loadspaceHeight { ...RangeFacet } loadspaceLength { ...RangeFacet } loadspaceVolume { ...RangeFacet } loadspaceWidth { ...RangeFacet } maximumWeight { ...RangeFacet } modelDesignation { ...FormattedValueFacet } modelIdentifier { ...FormattedValueFacet } modelYear { ...RangeFacet } monthlyRate { ...RangeFacet } motorization { ...SimpleCountFacet } packages { ...FormattedValueFacet } payload { ...RangeFacet } price { ...RangeFacet } productionDate { ...DateRangeFacet } registrationType { ...FormattedValueFacet } seats { ...NumberCountFacet } stockType { ...SimpleCountFacet } torque { ...RangeFacet } upholstery { ...FormattedValueFacet } upholsteryName { ...FormattedValueFacet } upholsteryPolish { ...FormattedValueFacet } vehicleHeight { ...RangeFacet } wheelbase { ...RangeFacet } mileage @include(if: $isUcos) { ...RangeFacet } firstRegistrationDate @include(if: $isUcos) { ...DateRangeFacet } stockCategories @include(if: $isUcos) { ...FormattedValueFacet } } navigation { currentLimit currentPage currentSortingCode totalPages totalResults } results { characteristics { stockCategories { code } highlights { label } campaigns { description footnote label } } consignorCompanyId emissionAndConsumption { attributes { displayValue id label mustShowIn unit value } footnotes testProcedure } envkv { co2Classes { primary secondary } } estimatedArrivalDate identification { code commissionNumber dcpProductType dealerId dealerGroupName mpcId variantId vin vxVehicleId } images { default } productionDate preProductionVehicle stock { stockType } stockCategory technicalInformation { engine { fuelType { ...TechnicalData } power { ...PowerData } } transmission { ...TechnicalData } } usedVehicleData @include(if: $isUcos) { mileage { ...IntegerTechnicalData } firstRegistrationDate vehicleInspection { maintenance } warranty { status unlimitedDistance } } vehicleModel { baumuster bodyType { ...TechnicalData } brand { ...TechnicalData } category { ...TechnicalData } facelift generation modelYear modelYearCode motorization name steeringPosition { ...TechnicalData } typeClass vehicleClass { ...TechnicalData } } wholesale } } }\n\nfragment DateRangeFacet on DateRangeFacet { values { min max count } facetType }\nfragment FormattedValueFacet on FormattedValueFacet { values { label formattedValue value count } facetType }\nfragment IntegerTechnicalData on IntegerTechnicalData { label formattedValue value unit }\nfragment PowerData on Power { label formattedValue combustionKw { ...IntegerTechnicalData } combustionHp { ...IntegerTechnicalData } electricKw { ...IntegerTechnicalData } electricHp { ...IntegerTechnicalData } combinedKw { ...IntegerTechnicalData } combinedHp { ...IntegerTechnicalData } }\nfragment RangeFacet on RangeFacet { values { min max count } facetType }\nfragment NumberCountFacet on NumberCountFacet { values { value count } facetType }\nfragment SimpleCountFacet on SimpleCountFacet { values { value count } facetType }\nfragment TechnicalData on TechnicalData { label formattedValue value unit }';
    }

    const response = await axios.post(apiUrl, graphqlPayload, {
      headers: {
        "Content-Type": "application/json",
        ...(process.env.API_ENDPOINT_LOCAL !== "true" && {
          "X-Api-Key": process.env.X_API_KEY || "",
        }),
      },
    });

    if (response.data.errors?.length > 0) {
      console.warn(
        `EMH API responded with status ${response.data.errors[0].message}`,
      );
      return null;
    }

    console.log("Successfully fetched EMH API response");

    try {
      const syncSummary = await syncFacetsMasterDataFromEmhResponse(
        response.data,
      );
      console.log(
        `Synced facets master data: ${syncSummary.addedKeys.length} keys, ${syncSummary.addedValues.length} values added`,
      );
    } catch (syncError) {
      const syncErrorMessage =
        syncError instanceof Error ? syncError.message : "Unknown sync error";
      console.warn("Failed to sync facets master data:", syncErrorMessage);
    }

    return response.data;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to fetch EMH API response: ${errorMessage}`);
  }
}

export async function fetchDcpApiResponse(): Promise<any> {
  const env = ENVIRONMENT || "INT";
  const country = COUNTRY || "KR";
  const product = PRODUCT || "UCOS";

  try {
    const envPrefix = env === "INT" ? "shop-int" : "shop";
    const apiUrl = `https://${envPrefix}.mercedes-benz.com/dcpoto-api/dcp-api/v2/dcp-mp-${country.toLowerCase()}/products/search?query=%3Arelevance%3AuseProductType%3A${product}%3AallCategories%3Adcp-mp-${country.toLowerCase()}-vehicles&currentPage=0&pageSize=12&fields=FULL&lang=${encodeURIComponent(getLanguageCode())}`;

    const response = await axios.get(apiUrl);

    if (response.data.errors?.length > 0) {
      console.warn(
        `DCP API responded with status ${response.data.errors[0].message}`,
      );
      return null;
    }

    console.log("Successfully fetched DCP API response");
    return response.data;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.warn("Failed to fetch DCP API response:", errorMessage);
    return null;
  }
}

function buildFacetCandidateTokens(rawValue: string): string[] {
  const normalizedRaw = normalizeFacetToken(rawValue || "");
  const candidates = new Set<string>();
  if (normalizedRaw) {
    candidates.add(normalizedRaw);
  }

  if (rawValue?.includes("_")) {
    const lastToken = rawValue.split("_").pop() || rawValue;
    const normalizedLastToken = normalizeFacetToken(lastToken);
    if (normalizedLastToken) {
      candidates.add(normalizedLastToken);
    }
  }

  return Array.from(candidates);
}

export async function processAndLogApiResult({
  query,
  results,
  testDescribe,
  testTitle,
  expectedStatusCode,
}: {
  query: any;
  results: ApiSearchResult;
  testDescribe: string;
  testTitle: string;
  expectedStatusCode?: number;
}): Promise<any> {
  const lang = (process.env.LANGUAGE || LANGUAGE)?.toLocaleLowerCase() || "en";
  const actualInput = query?.value ?? query;
  const actualFacets = query?.shouldFilter;

  if (results.error) {
    console.error(
      `API call failed with error for '${actualInput}': ${results.error}`,
    );
    return {
      testMode: "api",
      testDescribe,
      testTitle,
      query: {
        [`${lang}`]: actualInput,
      },
      openaiEvaluation: `API call failed with error: ${results.error}`,
      responseResult: "FAIL",
      facetsResult: "FAIL",
      hasError: true,
    };
  }

  const testFacets = process.env.TEST_FACETS === "true";
  const aiEvaluationHints = query?.aiEvaluationHints;
  const skipOpenAiEvaluation = query?.skipOpenAiEvaluation === true;
  const smartSearchMessage = results.results?.resultText || "";
  const apiResponse = results.results?.responseData;
  const resultsFacets = extractSmartSearchParameters(
    results.results.responseData,
  );
  let openaiEvaluation = "No results to evaluate";
  let resultCount = 0;
  let hasError = false;
  let responseCheckPassed = true;
  let facetsCheckPassed = true;
  const beFacetDiagnosticLines: string[] = [];
  const failureReasons: string[] = [];
  const failureState = {
    get openaiEvaluation() {
      return openaiEvaluation;
    },
    set openaiEvaluation(value: string) {
      openaiEvaluation = value;
    },
    get hasError() {
      return hasError;
    },
    set hasError(value: boolean) {
      hasError = value;
    },
  };
  const addApiFailureReason = (reason: string) => {
    addFailureReason(failureState, reason);
  };

  // Check if status code matches expectation (if provided)
  if (expectedStatusCode && results.statusCode !== expectedStatusCode) {
    responseCheckPassed = false;
    addApiFailureReason(
      `Status Code Mismatch: Expected ${expectedStatusCode}, got ${results.statusCode}`,
    );
  } else if (expectedStatusCode && results.statusCode === expectedStatusCode) {
    // If we have an expected status code and it matches, treat as success regardless of error
    openaiEvaluation = `Expected status code ${expectedStatusCode} received as expected`;
    hasError = false;

    // If there are also results to evaluate, include that information
    if (results.results) {
      const smartSearchResponse = results.results.resultText;
      resultCount = getSmartSearchResultCount(apiResponse);

      // Basic check to see if payload is empty (could be due to errors or unexpected response structure)
      if (resultCount === 0) {
        responseCheckPassed = false;
        addApiFailureReason("Payload is zero");
      }

      openaiEvaluation = await evaluateSmartSearchMessage({
        smartSearchMessage: smartSearchResponse,
        aiEvaluationHints,
        actualInput,
        skipOpenAiEvaluation,
        emptyMessageEvaluation: "No results to evaluate",
      });
      if (
        !isPassEvaluation(openaiEvaluation, {
          allowExpectedStatus: true,
        })
      ) {
        responseCheckPassed = false;
      }
    }
  } else if (
    (results.error || results.results?.errors) &&
    results.statusCode !== 400
  ) {
    // Check for non-400 errors (400 is now treated as valid response with message_to_user)
    responseCheckPassed = false;
    addApiFailureReason(
      `API Error: ${results.results?.errors
        ?.map((err: any) => err.message)
        .join("; ")}`,
    );
  } else if (results.results) {
    // Handle the new Smart Search + Actual Search response structure
    resultCount = getSmartSearchResultCount(apiResponse);

    // Basic check to see if payload is empty (could be due to errors or unexpected response structure)
    // But skip this check if facets are being validated (empty results can be valid for faceted queries)
    if (resultCount === 0 && !actualFacets) {
      responseCheckPassed = false;
      addApiFailureReason("Payload is zero");
    } else if (resultCount === 0 && actualFacets) {
      // Skip "Payload is zero" when facets are being validated
    }

    const smartSearchResponse = results.results.resultText;
    openaiEvaluation = await evaluateSmartSearchMessage({
      smartSearchMessage: smartSearchResponse,
      aiEvaluationHints,
      actualInput,
      skipOpenAiEvaluation,
      emptyMessageEvaluation: "No results to evaluate",
    });
    if (
      !isPassEvaluation(openaiEvaluation, {
        allowExpectedStatus: true,
      })
    ) {
      responseCheckPassed = false;
    }
  }

  const countValidation = await validateResponseVehicleCount(
    smartSearchMessage,
    resultCount,
  );
  const responseVehicleTotalCount = countValidation.responseVehicleTotalCount;
  let countCheckPassed = countValidation.countCheckPassed;
  if (!countValidation.countCheckPassed) {
    responseCheckPassed = false;
    addApiFailureReason(countValidation.failureReason || "");
  }

  // Facets check (BE vs test-data)
  if (actualFacets === false) {
    // shouldFilter: false — assert no filters were applied
    beFacetDiagnosticLines.push(
      `Expected Facets: ${JSON.stringify(actualFacets)}`,
    );
    beFacetDiagnosticLines.push(
      `Actual Facets:   ${JSON.stringify(resultsFacets)}`,
    );
    if (Object.keys(resultsFacets).length > 0) {
      facetsCheckPassed = false;
      addApiFailureReason(
        `Expected no filters, but got ${JSON.stringify(resultsFacets)}`,
      );
    }
  } else if (actualFacets === true) {
    // shouldFilter: true — assert at least one filter was applied
    beFacetDiagnosticLines.push(
      `Expected Facets: ${JSON.stringify(actualFacets)}`,
    );
    beFacetDiagnosticLines.push(
      `Actual Facets:   ${JSON.stringify(resultsFacets)}`,
    );
    if (Object.keys(resultsFacets).length === 0) {
      facetsCheckPassed = false;
      addApiFailureReason(
        `Expected at least one filter to be applied, but got none`,
      );
    }
  } else if (testFacets && actualFacets && typeof actualFacets === "object") {
    const facetValidation = await validateExpectedFacets({
      actualFacets,
      resultsFacets,
      responseData: apiResponse?.data || {},
      buildFacetCandidateTokens,
      enforceOnlyExpectedIncludedValues: true,
    });
    beFacetDiagnosticLines.push(
      `Expected Facets: ${JSON.stringify(facetValidation.expectedBeFacets)}`,
    );
    beFacetDiagnosticLines.push(
      `Actual Facets:   ${JSON.stringify(resultsFacets)}`,
    );
    if (!facetValidation.passed) {
      facetsCheckPassed = false;
      failureReasons.push(...facetValidation.failureReasons);
      addApiFailureReason(
        `Facets check failed: ${facetValidation.failureReasons.join("; ")}`,
      );
    }
  }

  const languageFailureReason = await validateLanguageConsistency(
    actualInput,
    smartSearchMessage,
  );
  if (languageFailureReason) {
    responseCheckPassed = false;
    addApiFailureReason(languageFailureReason);
  }

  const normalizedEvaluation = (openaiEvaluation || "").trim();
  const evaluationPassed = isPassEvaluation(normalizedEvaluation, {
    allowExpectedStatus: true,
  });
  const displayHasError = hasError || !evaluationPassed;
  const messageStatus = evaluationPassed ? "PASS" : "FAIL";
  const countStatus = getCountStatus(
    responseVehicleTotalCount,
    countCheckPassed,
  );
  const filterStatus = facetsCheckPassed ? "PASS" : "FAIL";
  const { queryEn, smartSearchMessageEn } = await translateResultText(
    lang,
    actualInput,
    smartSearchMessage,
  );

  logResultSummary({
    displayHasError,
    openaiEvaluation,
    testTitle,
    messageStatus,
    countStatus,
    filterStatus,
    actualInput,
    smartSearchMessage,
    translatedText: { queryEn, smartSearchMessageEn },
    responseVehicleTotalCount,
    resultCount,
    actualFacets,
    resultsFacets,
  });

  return {
    timestamp: new Date().toISOString(),
    timestampSG: new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    }),
    testMode: "api",
    testDescribe,
    testTitle,
    query: {
      [`${lang}`]: actualInput,
      en: queryEn,
    },
    response: {
      [`${lang}`]: smartSearchMessage,
      en: smartSearchMessageEn,
    },
    resultCount,
    responseVehicleTotalCount,
    responseTime: results.responseTime,
    statusCode: results.statusCode,
    hasError: displayHasError,
    error: results.error,
    // apiResponse,
    openaiEvaluation: openaiEvaluation,
    results: {
      responseResult: responseCheckPassed ? "PASS" : "FAIL",
      facetsResult: facetsCheckPassed ? "PASS" : "FAIL",
      countResult:
        responseVehicleTotalCount === null
          ? "SKIP"
          : countCheckPassed
            ? "PASS"
            : "FAIL",
      responseVehicleTotalCount,
      backendResultCount: resultCount,
    },
    facets: {
      expected: actualFacets,
      actual: resultsFacets,
      failureReasons: !facetsCheckPassed ? failureReasons : undefined,
    },
  };
}

export function addResponseListener(
  page: any,
  callback: (response: any) => void,
): void {
  page.on("response", async (response: any) => {
    try {
      callback(response);
    } catch (error) {
      console.warn("Error in response listener:", error);
    }
  });
}
