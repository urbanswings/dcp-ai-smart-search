import axios from "axios";
import {
  translateText,
  translateTextWithOpenAI,
  fetchTranslation,
} from "./aiHelpers";

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
      const countryCode = process.env.COUNTRY?.toUpperCase() || "KR";
      const locale = (process.env.COUNTRY || "kr").toLowerCase();
      const salesChannel =
        process.env.PRODUCT?.toUpperCase() === "NCOS"
          ? "first_hand"
          : "second_hand";

      const endpoint = `/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`;

      const payload = {
        request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
        user_query: query,
        country_code: countryCode,
        sales_channel: salesChannel,
        lang: "tr",
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
        results: responseData,
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
      const countryCode = process.env.COUNTRY?.toUpperCase() || "KR";
      const locale = (process.env.COUNTRY || "kr").toLowerCase();
      const salesChannel =
        process.env.PRODUCT?.toUpperCase() === "NCOS"
          ? "first_hand"
          : "second_hand";

      const endpoint = `/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`;

      const payload = {
        request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
        user_query: query,
        country_code: countryCode,
        sales_channel: salesChannel,
        lang: "tr",
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
        results: responseData,
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
    facets?: Record<string, any>
  ): Promise<ApiSearchResult> {
    const startTime = Date.now();
    const project = process.env.PROJECT?.toUpperCase() || "DCP";

    if (project === "EMH") {
      return this.performEmhSearchWithFacets(query, facets, startTime);
    }

    try {
      const countryCode = process.env.COUNTRY?.toUpperCase() || "KR";
      const locale = (process.env.COUNTRY || "kr").toLowerCase();
      const salesChannel =
        process.env.PRODUCT?.toUpperCase() === "NCOS"
          ? "first_hand"
          : "second_hand";

      const endpoint = `/dcpoto-api/dcp-api/v2/dcp-mp-${locale}/products/getSmartSearchQuery`;

      const payload = {
        request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
        user_query: query,
        country_code: countryCode,
        sales_channel: salesChannel,
        lang: "tr",
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
        results: responseData,
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
    facets?: Record<string, any>,
    startTime?: number
  ): Promise<ApiSearchResult> {
    const responseStartTime = startTime || Date.now();
    try {
      const env = process.env.ENVIRONMENT || "INT";
      const country = process.env.COUNTRY?.toUpperCase() || "TR";
      const language = process.env.LANGUAGE?.toLocaleLowerCase() || "en";
      const product = process.env.PRODUCT?.toUpperCase() || "UCOS";
      const salesChannel = product === "NCOS" ? "first_hand" : "second_hand";
      const xApiKey = process.env.X_API_KEY;

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
              request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
              user_query: actualInput,
              country_code: country,
              sales_channel: salesChannel,
              lang: language,
            }
          : {
              operationName: "AiSearch",
              variables: {
                isUcos: product === "UCOS",
                language: language,
                limit: 12,
                profileId: `${country}-${
                  product === "UCOS" ? "USED_VEHICLES" : "NEW_VEHICLES"
                }`,
                query: actualInput,
                sortingType: "price-asc",
              },
              query: `query AiSearch($isUcos: Boolean = false, $language: String, $limit: Int! = 10, $profileId: String!, $sortingType: String! = \"price-asc\", $query: String!) {\n  smartSearch(\n    language: $language\n    limit: $limit\n    profileId: $profileId\n    sortingType: $sortingType\n    query: $query\n  ) {\n    message\n    parameters {\n      contextType\n      isUcos\n      limit\n      sortingType\n      language\n      profileId\n      vehicleCategory\n      modelIdentifier\n      color\n      upholstery\n      brand\n      fuelType\n      price {\n        min\n        max\n      }\n      mileage {\n        min\n        max\n      }\n      modelYear {\n        min\n        max\n      }\n    }\n    facets {\n      brand {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      modelIdentifier {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      bodyType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      price {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      monthlyRate {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      campaigns {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      fuelType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      enginePowerHP {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      gearbox {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      modelYear {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      mileage {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      upholstery {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      upholsteryPolish {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      packages {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      lines {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      equipment {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      colorPolish {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      color {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      dealerId {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n    }\n    navigation {\n      currentLimit\n      currentPage\n      currentSortingCode\n      totalPages\n      totalResults\n    }\n    results {\n      characteristics {\n        stockCategories {\n          code\n        }\n        highlights {\n          label\n        }\n        campaigns {\n          description\n          footnote\n          label\n        }\n      }\n      consignorCompanyId\n      emissionAndConsumption {\n        attributes {\n          displayValue\n          id\n          label\n          mustShowIn\n          unit\n          value\n        }\n        footnotes\n        testProcedure\n      }\n      envkv {\n        co2Classes {\n          primary\n          secondary\n        }\n      }\n      estimatedArrivalDate\n      identification {\n        code\n        commissionNumber\n        dcpProductType\n        dealerId\n        dealerGroupName\n        mpcId\n        variantId\n        vin\n        vxVehicleId\n        allDealers\n      }\n      images {\n        default\n      }\n      productionDate\n      preProductionVehicle\n      stock {\n        stockType\n      }\n      stockCategory\n      technicalInformation {\n        engine {\n          fuelType {\n            ...TechnicalData\n          }\n          power {\n            ...PowerData\n          }\n        }\n        transmission {\n          ...TechnicalData\n        }\n      }\n      usedVehicleData @include(if: $isUcos) {\n        mileage {\n          ...IntegerTechnicalData\n        }\n        firstRegistrationDate\n        vehicleInspection {\n          maintenance\n        }\n        warranty {\n          status\n          unlimitedDistance\n        }\n      }\n      vehicleModel {\n        baumuster\n        bodyType {\n          ...TechnicalData\n        }\n        brand {\n          ...TechnicalData\n        }\n        category {\n          ...TechnicalData\n        }\n        facelift\n        generation\n        modelYear\n        modelYearCode\n        motorization\n        name\n        steeringPosition {\n          ...TechnicalData\n        }\n        typeClass\n        vehicleClass {\n          ...TechnicalData\n        }\n      }\n      wholesale\n    }\n  }\n}\n\nfragment IntegerTechnicalData on IntegerTechnicalData {\n  label\n  formattedValue\n  value\n  unit\n}\n\nfragment PowerData on Power {\n  label\n  formattedValue\n  combustionKw {\n    ...IntegerTechnicalData\n  }\n  combustionHp {\n    ...IntegerTechnicalData\n  }\n  electricKw {\n    ...IntegerTechnicalData\n  }\n  electricHp {\n    ...IntegerTechnicalData\n  }\n  combinedKw {\n    ...IntegerTechnicalData\n  }\n  combinedHp {\n    ...IntegerTechnicalData\n  }\n}\n\nfragment TechnicalData on TechnicalData {\n  label\n  formattedValue\n  value\n  unit\n}`,
            };

      const response = await axios.post(endpoint, payload, {
        timeout: 30000,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "AI-Smart-Search-Test/1.0",
          "X-Api-Key": xApiKey,
        },
      });

      const responseTime = Date.now() - responseStartTime;
      let responseData = response.data;

      if (typeof responseData === "string") {
        try {
          responseData = JSON.parse(responseData);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }

      // Handle different response structures based on endpoint
      if (process.env.API_ENDPOINT_LOCAL === "true") {
        // Local endpoint returns: { request_id, messageToUser, search: { operationName, variables, query } }
        // We need to normalize this to match the expected structure
        const normalizedData = {
          smartSearchResponse: {
            message: responseData.messageToUser,
            request_id: responseData.request_id,
          },
          searchResults: responseData.search || null,
        };

        return {
          query,
          results: normalizedData,
          responseTime,
          statusCode: response.status,
        };
      }

      return {
        query,
        results: responseData,
        responseTime,
        statusCode: response.status,
      };
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

export async function performApiSmartSearchAndGetResults(
  query: any = "",
  facets?: Record<string, any>
): Promise<ApiSearchResult> {
  const apiClient = new SearchApiClient();

  if (facets) {
    return await apiClient.performSearchWithFacets(query, facets);
  }

  return await apiClient.performSearch(query);
}

export async function fetchEmhApiResponse(): Promise<any> {
  const env = process.env.ENVIRONMENT || "INT";
  const country = process.env.COUNTRY || "KR";
  const product = process.env.PRODUCT || "UCOS";
  const language = process.env.LANGUAGE || "tr";

  try {
    const apiUrl =
      process.env.API_ENDPOINT_LOCAL === "true"
        ? "http://localhost:8080/api/v2/search"
        : env?.toUpperCase() === "PROD"
        ? "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql"
        : env?.toUpperCase() === "INT"
        ? "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql"
        : "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";

    const graphqlPayload = {
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
        vehicleCategory: "PASSENGER-CARS",
      },
      query:
        'query GetSearchResults($isUcos: Boolean = false, $language: String, $limit: Int! = 10, $profileId: String!, $sortingType: String! = "price-asc", $contextType: ContextType! = B2C, $page: Int! = 0, $productCode: String, $variantId: String, $vehicleCategory: String!, $brand: [String!], $modelIdentifier: [VehicleClass!], $motorization: [String!], $bodyType: [BodyType!], $stockType: [StockItemState!], $price: ValueRange, $monthlyRate: ValueRange, $campaigns: [String!], $fuelType: [FuelTypeHarmonized!], $enginePowerHP: IntRange, $driveType: [TypeOfPropulsion!], $gearbox: [TransmissionCategory!], $modelYear: IntRange, $upholstery: [String!], $packages: [String!], $lines: [String!], $equipment: [String!], $color: [String!], $generation: [Generation!], $seats: [Int!], $payload: IntRange, $maximumWeight: IntRange) {\n  search(\n    language: $language\n    limit: $limit\n    profileId: $profileId\n    sortingType: $sortingType\n    contextType: $contextType\n    page: $page\n    productCode: $productCode\n    variantId: $variantId\n    vehicleCategory: $vehicleCategory\n    brand: $brand\n    modelIdentifier: $modelIdentifier\n    motorization: $motorization\n    bodyType: $bodyType\n    stockType: $stockType\n    price: $price\n    monthlyRate: $monthlyRate\n    campaigns: $campaigns\n    fuelType: $fuelType\n    enginePowerHP: $enginePowerHP\n    driveType: $driveType\n    gearbox: $gearbox\n    modelYear: $modelYear\n    upholstery: $upholstery\n    packages: $packages\n    lines: $lines\n    equipment: $equipment\n    color: $color\n    generation: $generation\n    seats: $seats\n    payload: $payload\n    maximumWeight: $maximumWeight\n  ) {\n    facets {\n      brand {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      modelIdentifier {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      motorization {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n      bodyType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      stockType {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n      price {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      monthlyRate {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      campaigns {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      fuelType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      enginePowerHP {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      driveType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      gearbox {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      modelYear {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      upholstery {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      packages {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      lines {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      equipment {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      color {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      generation {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n      seats {\n        ... on NumberCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n      payload {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      maximumWeight {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n    }\n    navigation {\n      currentLimit\n      currentPage\n      currentSortingCode\n      totalPages\n      totalResults\n    }\n    results {\n      characteristics {\n        stockCategories {\n          code\n        }\n        highlights {\n          label\n        }\n        campaigns {\n          description\n          footnote\n          label\n        }\n      }\n      consignorCompanyId\n      emissionAndConsumption {\n        attributes {\n          displayValue\n          id\n          label\n          mustShowIn\n          unit\n          value\n        }\n        footnotes\n        testProcedure\n      }\n      envkv {\n        co2Classes {\n          primary\n          secondary\n        }\n      }\n      estimatedArrivalDate\n      identification {\n        code\n        commissionNumber\n        dcpProductType\n        dealerId\n        dealerGroupName\n        mpcId\n        variantId\n        vin\n        vxVehicleId\n        allDealers\n      }\n      images {\n        default\n      }\n      productionDate\n      preProductionVehicle\n      stock {\n        stockType\n      }\n      stockCategory\n      technicalInformation {\n        engine {\n          fuelType {\n            ...TechnicalData\n          }\n          power {\n            ...PowerData\n          }\n        }\n        transmission {\n          ...TechnicalData\n        }\n      }\n      usedVehicleData @include(if: $isUcos) {\n        mileage {\n          ...IntegerTechnicalData\n        }\n        firstRegistrationDate\n        vehicleInspection {\n          maintenance\n        }\n        warranty {\n          status\n          unlimitedDistance\n        }\n      }\n      vehicleModel {\n        baumuster\n        bodyType {\n          ...TechnicalData\n        }\n        brand {\n          ...TechnicalData\n        }\n        category {\n          ...TechnicalData\n        }\n        facelift\n        generation\n        modelYear\n        modelYearCode\n        motorization\n        name\n        steeringPosition {\n          ...TechnicalData\n        }\n        typeClass\n        vehicleClass {\n          ...TechnicalData\n        }\n      }\n      wholesale\n    }\n  }\n}\n\nfragment IntegerTechnicalData on IntegerTechnicalData {\n  label\n  formattedValue\n  value\n  unit\n}\n\nfragment PowerData on Power {\n  label\n  formattedValue\n  combustionKw {\n    ...IntegerTechnicalData\n  }\n  combustionHp {\n    ...IntegerTechnicalData\n  }\n  electricKw {\n    ...IntegerTechnicalData\n  }\n  electricHp {\n    ...IntegerTechnicalData\n  }\n  combinedKw {\n    ...IntegerTechnicalData\n  }\n  combinedHp {\n    ...IntegerTechnicalData\n  }\n}\n\nfragment TechnicalData on TechnicalData {\n  label\n  formattedValue\n  value\n  unit\n}',
    };

    const response = await axios.post(apiUrl, graphqlPayload, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.X_API_KEY || "",
      },
    });

    if (response.data.errors?.length > 0) {
      throw new Error(
        `EMH API responded with status ${response.data.errors[0].message}`
      );
    }

    console.log("Successfully fetched EMH API response");
    return response.data;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch EMH API response:", errorMessage);
    throw error;
  }
}

export async function fetchDcpApiResponse(): Promise<any> {
  const env = process.env.ENVIRONMENT || "INT";
  const country = process.env.COUNTRY || "KR";
  const product = process.env.PRODUCT || "UCOS";

  try {
    const envPrefix = env === "INT" ? "shop-int" : "shop";
    const apiUrl = `https://${envPrefix}.mercedes-benz.com/dcpoto-api/dcp-api/v2/dcp-mp-${country.toLowerCase()}/products/search?query=%3Arelevance%3AuseProductType%3A${product}%3AallCategories%3Adcp-mp-${country.toLowerCase()}-vehicles&currentPage=0&pageSize=12&fields=FULL&lang=ko`;

    const graphqlPayload = {};

    const response = await axios.get(apiUrl);

    if (response.data.errors?.length > 0) {
      throw new Error(
        `DCP API responded with status ${response.data.errors[0].message}`
      );
    }

    console.log("Successfully fetched DCP API response");
    return response.data;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch DCP API response:", errorMessage);
    throw error;
  }
}

export async function processAndLogApiResult({
  query,
  result,
  testDescribe,
  testTitle,
  customEval,
  expectedStatusCode,
}: {
  query: any;
  result: ApiSearchResult;
  testDescribe: string;
  testTitle: string;
  customEval?: (resultData: any) => Promise<string>;
  expectedStatusCode?: number;
}): Promise<any> {
  const { evaluateSearchResult } = await import("./testHelpers");

  let evaluation = "No results to evaluate";
  let resultCount = 0;
  let hasError = false;

  // Check if status code matches expectation (if provided)
  if (expectedStatusCode && result.statusCode !== expectedStatusCode) {
    evaluation = `Status Code Mismatch: Expected ${expectedStatusCode}, got ${result.statusCode}`;
    hasError = true;
  } else if (expectedStatusCode && result.statusCode === expectedStatusCode) {
    // If we have an expected status code and it matches, treat as success regardless of error
    evaluation = `Expected status code ${expectedStatusCode} received as expected`;
    hasError = false;

    // If there are also results to evaluate, include that information
    if (result.results) {
      const searchResults = result.results.searchResults;
      const smartSearchResponse = result.results.smartSearchResponse;

      if (searchResults) {
        resultCount =
          searchResults.products?.length ||
          searchResults.pagination?.totalNumberOfResults ||
          searchResults.hits?.length ||
          searchResults.data?.length ||
          0;
      }

      const projectEnv = process.env.PROJECT?.toUpperCase();
      const aiMessageForEval =
        (projectEnv === "EMH"
          ? smartSearchResponse?.message
          : smartSearchResponse?.message_to_user) || "";

      if (customEval) {
        evaluation = await customEval(result.results);
      } else {
        evaluation = await evaluateSearchResult(aiMessageForEval);
      }

      hasError = evaluation !== "PASS";
    }
  } else if (
    (result.error || result.results.errors) &&
    result.statusCode !== 400
  ) {
    // Check for non-400 errors (400 is now treated as valid response with message_to_user)
    // evaluation = `API Error: ${result.error}`;
    evaluation = `API Error: ${result.results.errors
      .map((err: any) => err.message)
      .join("; ")}`;
    hasError = true;
  } else if (result.results) {
    // Handle the new Smart Search + Actual Search response structure
    const searchResults = result.results.data.smartSearch; //result.results.searchResults;
    const smartSearchResponse = result.results.data.smartSearch; //result.results.smartSearchResponse;

    // Extract result count from the actual search results
    if (searchResults) {
      resultCount =
        searchResults.results?.length ||
        searchResults.navigation?.totalResults ||
        0;
    } else {
      // If no search results, it means smart search failed or returned no URL
      resultCount = 0;
    }

    const projectEnv = process.env.PROJECT?.toUpperCase();
    const aiMessageForEval =
      (projectEnv === "EMH"
        ? smartSearchResponse?.message
        : smartSearchResponse?.message_to_user) || "";

    if (customEval) {
      evaluation = await customEval(result.results);
    } else {
      evaluation = await evaluateSearchResult(aiMessageForEval);
    }

    hasError = evaluation !== "PASS";
  }

  const entry = {
    timestamp: new Date().toISOString(),
    timestampSG: new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    }),
    testMode: "api",
    testDescribe,
    testTitle,
    query,
    resultCount,
    responseTime: result.responseTime,
    statusCode: result.statusCode,
    hasError,
    error: result.error,
    apiResults: result.results,
    openaiEvaluation: evaluation,
  };

  // Format output to match UI test format
  const icon = hasError ? "❌" : "✅";
  const lang = process.env.LANGUAGE?.toLocaleLowerCase() || "en";
  const projectEnv = process.env.PROJECT?.toUpperCase();
  const actualInput = query?.value ?? query;
  const smartSearchMessage =
    projectEnv === "EMH"
      ? result.results?.data?.smartSearch?.message ||
        result.results?.message_to_user ||
        "No message available"
      : result.results?.data?.smartSearch?.message ||
        result.results?.message_to_user ||
        "No message available";

  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${icon} ${evaluation} | ${testTitle}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Query:         '${actualInput}'`);
  console.log(`Response:      '${smartSearchMessage}'`);
  if (lang !== "en") {
    const queryEn = await fetchTranslation(actualInput, "en");
    const smartSearchMessageEn = await fetchTranslation(
      smartSearchMessage,
      "en"
    );
    console.log(`Query (EN):    '${queryEn}'`);
    console.log(`Response (EN): '${smartSearchMessageEn}'`);
  }
  console.log("\n");

  return entry;
}

export function addResponseListener(
  page: any,
  callback: (response: any) => void
): void {
  page.on("response", async (response: any) => {
    try {
      callback(response);
    } catch (error) {
      console.error("Error in response listener:", error);
    }
  });
}
