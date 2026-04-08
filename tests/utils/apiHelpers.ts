import axios from "axios";
import { fetchTranslation, openaiChatCompletion } from "./aiHelpers";
import { deepEqual, isLanguageConsistencyAccepted } from "./shared";

export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const LANGUAGE = process.env.LANGUAGE;
export const PRODUCT = process.env.PRODUCT;

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
      const salesChannel = getSalesChannel();

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
      const salesChannel = getSalesChannel();

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
    facets?: Record<string, any>
  ): Promise<ApiSearchResult> {
    const startTime = Date.now();
    const project = process.env.PROJECT?.toUpperCase() || "DCP";

    if (project === "EMH") {
      return this.performEmhSearchWithFacets(query, facets, startTime);
    }

    try {
      const countryCode = getCountryCode();
      const locale = getLocale();
      const salesChannel = getSalesChannel();

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
    facets?: Record<string, any>,
    startTime?: number
  ): Promise<ApiSearchResult> {
    const responseStartTime = startTime || Date.now();
    try {
      const env = ENVIRONMENT || "INT";
      const country = getCountryCode();
      const language = country === "IN" ? "en" : LANGUAGE?.toLocaleLowerCase() || "en";
      const product = PRODUCT?.toUpperCase() || "UCOS";
      const salesChannel = getSalesChannel();
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
              country_code: country,
              lang: language,
              request_id: "cf19cf25-90b6-406b-8388-fda1757e94e5",
              sales_channel: salesChannel,
              user_query: actualInput,
              vehicleCategory: "PASSENGER-CARS"            
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
              query: product === "UCOS" 
                ? "query GetSmartSearchResults($isUcos: Boolean = false, $language: String, $limit: Int! = 10, $profileId: String!, $sortingType: String! = \"price-asc\", $contextType: String, $query: String!) {\n  smartSearch(\n    language: $language\n    limit: $limit\n    profileId: $profileId\n    sortingType: $sortingType\n    contextType: $contextType\n    query: $query\n  ) {\n    message\n    parameters {\n      contextType\n      isUcos\n      limit\n      sortingType\n      language\n      profileId\n      vehicleCategory\n      modelIdentifier\n      color\n      upholstery\n      brand\n      fuelType\n      bodyType\n      motorization\n      equipment\n      price {\n        min\n        max\n        __typename\n      }\n      mileage {\n        min\n        max\n        __typename\n      }\n      modelYear {\n        min\n        max\n        __typename\n      }\n      __typename\n    }\n    facets {\n      brand {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      modelIdentifier {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      bodyType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      price {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      monthlyRate {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      campaigns {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      fuelType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      enginePowerHP {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      gearbox {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      modelYear {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      mileage {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      upholstery {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      upholsteryPolish {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      packages {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      lines {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      equipment {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      colorPolish {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      color {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      dealerId {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    navigation {\n      currentLimit\n      currentPage\n      currentSortingCode\n      totalPages\n      totalResults\n      __typename\n    }\n    results {\n      characteristics {\n        stockCategories {\n          code\n          __typename\n        }\n        highlights {\n          label\n          __typename\n        }\n        campaigns {\n          description\n          footnote\n          label\n          __typename\n        }\n        __typename\n      }\n      consignorCompanyId\n      emissionAndConsumption {\n        attributes {\n          displayValue\n          id\n          label\n          mustShowIn\n          unit\n          value\n          __typename\n        }\n        footnotes\n        testProcedure\n        __typename\n      }\n      envkv {\n        co2Classes {\n          primary\n          secondary\n          __typename\n        }\n        __typename\n      }\n      estimatedArrivalDate\n      identification {\n        code\n        commissionNumber\n        dcpProductType\n        dealerId\n        dealerGroupName\n        mpcId\n        variantId\n        vin\n        vxVehicleId\n        allDealers\n        __typename\n      }\n      images {\n        default\n        __typename\n      }\n      productionDate\n      preProductionVehicle\n      stock {\n        stockType\n        __typename\n      }\n      stockCategory\n      technicalInformation {\n        engine {\n          fuelType {\n            ...TechnicalData\n            __typename\n          }\n          power {\n            ...PowerData\n            __typename\n          }\n          __typename\n        }\n        transmission {\n          ...TechnicalData\n          __typename\n        }\n        __typename\n      }\n      usedVehicleData @include(if: $isUcos) {\n        mileage {\n          ...IntegerTechnicalData\n          __typename\n        }\n        firstRegistrationDate\n        vehicleInspection {\n          maintenance\n          __typename\n        }\n        warranty {\n          status\n          unlimitedDistance\n          __typename\n        }\n        __typename\n      }\n      vehicleModel {\n        baumuster\n        bodyType {\n          ...TechnicalData\n          __typename\n        }\n        brand {\n          ...TechnicalData\n          __typename\n        }\n        category {\n          ...TechnicalData\n          __typename\n        }\n        facelift\n        generation\n        modelYear\n        modelYearCode\n        motorization\n        name\n        steeringPosition {\n          ...TechnicalData\n          __typename\n        }\n        typeClass\n        vehicleClass {\n          ...TechnicalData\n          __typename\n        }\n        __typename\n      }\n      wholesale\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment IntegerTechnicalData on IntegerTechnicalData {\n  label\n  formattedValue\n  value\n  unit\n  __typename\n}\n\nfragment PowerData on Power {\n  label\n  formattedValue\n  combustionKw {\n    ...IntegerTechnicalData\n    __typename\n  }\n  combustionHp {\n    ...IntegerTechnicalData\n    __typename\n  }\n  electricKw {\n    ...IntegerTechnicalData\n    __typename\n  }\n  electricHp {\n    ...IntegerTechnicalData\n    __typename\n  }\n  combinedKw {\n    ...IntegerTechnicalData\n    __typename\n  }\n  combinedHp {\n    ...IntegerTechnicalData\n    __typename\n  }\n  __typename\n}\n\nfragment TechnicalData on TechnicalData {\n  label\n  formattedValue\n  value\n  unit\n  __typename\n}"
                : "query GetSmartSearchResults($isUcos: Boolean = false, $language: String, $limit: Int! = 10, $profileId: String!, $sortingType: String! = \"price-asc\", $contextType: String, $query: String!) {\n  smartSearch(\n    language: $language\n    limit: $limit\n    profileId: $profileId\n    sortingType: $sortingType\n    contextType: $contextType\n    query: $query\n  ) {\n    message\n    parameters {\n      contextType\n      isUcos\n      limit\n      sortingType\n      language\n      profileId\n      vehicleCategory\n      modelIdentifier\n      color\n      upholstery\n      brand\n      fuelType\n      bodyType\n      motorization\n      equipment\n      price {\n        min\n        max\n        __typename\n      }\n      mileage {\n        min\n        max\n        __typename\n      }\n      modelYear {\n        min\n        max\n        __typename\n      }\n      __typename\n    }\n    facets {\n      brand {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      modelIdentifier {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      motorization {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      bodyType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      stockType {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      price {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      monthlyRate {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      campaigns {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      fuelType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      enginePowerHP {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      driveType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      gearbox {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      modelYear {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      upholstery {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      packages {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      lines {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      equipment {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      color {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      seats {\n        ... on NumberCountFacet {\n          values {\n            value\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      payload {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      maximumWeight {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n            __typename\n          }\n          facetType\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    navigation {\n      currentLimit\n      currentPage\n      currentSortingCode\n      totalPages\n      totalResults\n      __typename\n    }\n    results {\n      characteristics {\n        stockCategories {\n          code\n          __typename\n        }\n        highlights {\n          label\n          __typename\n        }\n        campaigns {\n          description\n          footnote\n          label\n          __typename\n        }\n        __typename\n      }\n      consignorCompanyId\n      emissionAndConsumption {\n        attributes {\n          displayValue\n          id\n          label\n          mustShowIn\n          unit\n          value\n          __typename\n        }\n        footnotes\n        testProcedure\n        __typename\n      }\n      envkv {\n        co2Classes {\n          primary\n          secondary\n          __typename\n        }\n        __typename\n      }\n      estimatedArrivalDate\n      identification {\n        code\n        commissionNumber\n        dcpProductType\n        dealerId\n        dealerGroupName\n        mpcId\n        variantId\n        vin\n        vxVehicleId\n        allDealers\n        __typename\n      }\n      images {\n        default\n        __typename\n      }\n      productionDate\n      preProductionVehicle\n      stock {\n        stockType\n        __typename\n      }\n      stockCategory\n      technicalInformation {\n        engine {\n          fuelType {\n            ...TechnicalData\n            __typename\n          }\n          power {\n            ...PowerData\n            __typename\n          }\n          __typename\n        }\n        transmission {\n          ...TechnicalData\n          __typename\n        }\n        __typename\n      }\n      usedVehicleData @include(if: $isUcos) {\n        mileage {\n          ...IntegerTechnicalData\n          __typename\n        }\n        firstRegistrationDate\n        vehicleInspection {\n          maintenance\n          __typename\n        }\n        warranty {\n          status\n          unlimitedDistance\n          __typename\n        }\n        __typename\n      }\n      vehicleModel {\n        baumuster\n        bodyType {\n          ...TechnicalData\n          __typename\n        }\n        brand {\n          ...TechnicalData\n          __typename\n        }\n        category {\n          ...TechnicalData\n          __typename\n        }\n        facelift\n        generation\n        modelYear\n        modelYearCode\n        motorization\n        name\n        steeringPosition {\n          ...TechnicalData\n          __typename\n        }\n        typeClass\n        vehicleClass {\n          ...TechnicalData\n          __typename\n        }\n        __typename\n      }\n      wholesale\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment IntegerTechnicalData on IntegerTechnicalData {\n  label\n  formattedValue\n  value\n  unit\n  __typename\n}\n\nfragment PowerData on Power {\n  label\n  formattedValue\n  combustionKw {\n    ...IntegerTechnicalData\n    __typename\n  }\n  combustionHp {\n    ...IntegerTechnicalData\n    __typename\n  }\n  electricKw {\n    ...IntegerTechnicalData\n    __typename\n  }\n  electricHp {\n    ...IntegerTechnicalData\n    __typename\n  }\n  combinedKw {\n    ...IntegerTechnicalData\n    __typename\n  }\n  combinedHp {\n    ...IntegerTechnicalData\n    __typename\n  }\n  __typename\n}\n\nfragment TechnicalData on TechnicalData {\n  label\n  formattedValue\n  value\n  unit\n  __typename\n}"
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

      // Handle different response structures for local endpoint
      if (process.env.API_ENDPOINT_LOCAL === "true") {
        const endpoint = "http://localhost:8080/api/v2/search/proxy";
        const payload = {
          operationName: "GetSearchResults",
          variables: responseData.search.variables || {},
          query: responseData.search.query || query
        };
        const response = await axios.post(endpoint, payload, {
          timeout: 30000,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "AI-Smart-Search-Test/1.0",
          },
        });
        let data = response.data;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch (e) {
            // If parsing fails, keep as string
          }
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
              parameters: responseData.search.variables,
              message: responseData.messageToUser,
              facets: data.data.search.facets,
              navigation: data.data.search.navigation,
              results: data.data.search.results,
            },
          }
        };

        return {
          query,
          results: { 
            resultText: responseData.messageToUser,
            responseData: normalizedData
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
          }
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

export function getSalesChannel(): string {
  return process.env.PRODUCT?.toUpperCase() === "NCOS"
    ? "first_hand"
    : "second_hand";
}

export async function performApiSmartSearchAndGetResults(
  query: any = "",
  facets?: Record<string, any>
): Promise<ApiSearchResult> {
  const apiClient = new SearchApiClient();

  if (facets) return await apiClient.performSearchWithFacets(query, facets);

  return await apiClient.performSearch(query);
}

export async function fetchEmhApiResponse(): Promise<any> {
  const env = ENVIRONMENT || "INT";
  const country = COUNTRY || "TR";
  const product = PRODUCT || "NCOS";
  const language = country === "IN" ? "EN" : country === "TR" ? "TR" : LANGUAGE || "TR";

  try {
    const apiUrl =
      process.env.API_ENDPOINT_LOCAL === "true"
        ? "http://localhost:8080/api/v2/search/proxy"
        : env?.toUpperCase() === "PROD"
        ? "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql"
        : env?.toUpperCase() === "INT"
        ? "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql"
        : "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";
    
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
        vehicleCategory: "PASSENGER-CARS",
      },
      query:
        'query GetSearchResults($isUcos: Boolean = false, $language: String, $limit: Int! = 10, $profileId: String!, $sortingType: String! = "price-asc", $contextType: ContextType! = B2C, $page: Int! = 0, $productCode: String, $variantId: String, $vehicleCategory: String!, $brand: [String!], $modelIdentifier: [VehicleClass!], $motorization: [String!], $bodyType: [BodyType!], $stockType: [StockItemState!], $price: ValueRange, $monthlyRate: ValueRange, $campaigns: [String!], $fuelType: [FuelTypeHarmonized!], $enginePowerHP: IntRange, $driveType: [TypeOfPropulsion!], $gearbox: [TransmissionCategory!], $modelYear: IntRange, $upholstery: [String!], $packages: [String!], $lines: [String!], $equipment: [String!], $color: [String!], $generation: [Generation!], $seats: [Int!], $payload: IntRange, $maximumWeight: IntRange) {\n  search(\n    language: $language\n    limit: $limit\n    profileId: $profileId\n    sortingType: $sortingType\n    contextType: $contextType\n    page: $page\n    productCode: $productCode\n    variantId: $variantId\n    vehicleCategory: $vehicleCategory\n    brand: $brand\n    modelIdentifier: $modelIdentifier\n    motorization: $motorization\n    bodyType: $bodyType\n    stockType: $stockType\n    price: $price\n    monthlyRate: $monthlyRate\n    campaigns: $campaigns\n    fuelType: $fuelType\n    enginePowerHP: $enginePowerHP\n    driveType: $driveType\n    gearbox: $gearbox\n    modelYear: $modelYear\n    upholstery: $upholstery\n    packages: $packages\n    lines: $lines\n    equipment: $equipment\n    color: $color\n    generation: $generation\n    seats: $seats\n    payload: $payload\n    maximumWeight: $maximumWeight\n  ) {\n    facets {\n      brand {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      modelIdentifier {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      motorization {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n      bodyType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      stockType {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n      price {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      monthlyRate {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      campaigns {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      fuelType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      enginePowerHP {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      driveType {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      gearbox {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      modelYear {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      upholstery {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      packages {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      lines {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      equipment {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      color {\n        ... on FormattedValueFacet {\n          values {\n            label\n            formattedValue\n            value\n            count\n          }\n          facetType\n        }\n      }\n      generation {\n        ... on SimpleCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n      seats {\n        ... on NumberCountFacet {\n          values {\n            value\n            count\n          }\n          facetType\n        }\n      }\n      payload {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n      maximumWeight {\n        ... on RangeFacet {\n          values {\n            min\n            max\n            count\n          }\n          facetType\n        }\n      }\n    }\n    navigation {\n      currentLimit\n      currentPage\n      currentSortingCode\n      totalPages\n      totalResults\n    }\n    results {\n      characteristics {\n        stockCategories {\n          code\n        }\n        highlights {\n          label\n        }\n        campaigns {\n          description\n          footnote\n          label\n        }\n      }\n      consignorCompanyId\n      emissionAndConsumption {\n        attributes {\n          displayValue\n          id\n          label\n          mustShowIn\n          unit\n          value\n        }\n        footnotes\n        testProcedure\n      }\n      envkv {\n        co2Classes {\n          primary\n          secondary\n        }\n      }\n      estimatedArrivalDate\n      identification {\n        code\n        commissionNumber\n        dcpProductType\n        dealerId\n        dealerGroupName\n        mpcId\n        variantId\n        vin\n        vxVehicleId\n        allDealers\n      }\n      images {\n        default\n      }\n      productionDate\n      preProductionVehicle\n      stock {\n        stockType\n      }\n      stockCategory\n      technicalInformation {\n        engine {\n          fuelType {\n            ...TechnicalData\n          }\n          power {\n            ...PowerData\n          }\n        }\n        transmission {\n          ...TechnicalData\n        }\n      }\n      usedVehicleData @include(if: $isUcos) {\n        mileage {\n          ...IntegerTechnicalData\n        }\n        firstRegistrationDate\n        vehicleInspection {\n          maintenance\n        }\n        warranty {\n          status\n          unlimitedDistance\n        }\n      }\n      vehicleModel {\n        baumuster\n        bodyType {\n          ...TechnicalData\n        }\n        brand {\n          ...TechnicalData\n        }\n        category {\n          ...TechnicalData\n        }\n        facelift\n        generation\n        modelYear\n        modelYearCode\n        motorization\n        name\n        steeringPosition {\n          ...TechnicalData\n        }\n        typeClass\n        vehicleClass {\n          ...TechnicalData\n        }\n      }\n      wholesale\n    }\n  }\n}\n\nfragment IntegerTechnicalData on IntegerTechnicalData {\n  label\n  formattedValue\n  value\n  unit\n}\n\nfragment PowerData on Power {\n  label\n  formattedValue\n  combustionKw {\n    ...IntegerTechnicalData\n  }\n  combustionHp {\n    ...IntegerTechnicalData\n  }\n  electricKw {\n    ...IntegerTechnicalData\n  }\n  electricHp {\n    ...IntegerTechnicalData\n  }\n  combinedKw {\n    ...IntegerTechnicalData\n  }\n  combinedHp {\n    ...IntegerTechnicalData\n  }\n}\n\nfragment TechnicalData on TechnicalData {\n  label\n  formattedValue\n  value\n  unit\n}',
    };

    if (process.env.API_ENDPOINT_LOCAL === "true") {
      (graphqlPayload.variables as any) = {
        "contextType": "B2C",
        "isUcos": false,
        "limit": 12,
        "page": 0,
        "sortingType": "price-asc",
        "language": "en",
        "profileId": "SG-NEW_VEHICLES",
        "vehicleCategory": "PASSENGER-CARS",
        "modelIdentifier": null,
        "color": null,
        "upholstery": null,
        "brand": null,
        "fuelType": null,
        "bodyType": null,
        "equipment": null,
        "motorization": null,
        "price": null,
        "mileage": null,
        "modelYear": null,
        "enginePowerHP": null,
        "enginePowerKW": null
      };
      (graphqlPayload.query as any) = 'query GetSearchResults($baumuster4: String, $bodyType: [BodyType!], $brand: [String!], $buildType: [String!], $campaigns: [String!], $color: [String!], $colorName: [String!], $colorPolish: [String!], $contextType: ContextType! = B2C, $dealerId: [String!], $dealerFittedOptions: [String!], $driveType: [TypeOfPropulsion!], $enginePowerHP: IntRange, $enginePowerKW: IntRange, $equipment: [String!], $estimatedArrivalDate: DateRange, $facelift: Int, $firstRegistrationDate: DateRange, $fuelType: [FuelTypeHarmonized!], $gearbox: [TransmissionCategory!], $generation: [Generation!], $isUcos: Boolean = false, $language: String, $lines: [String!], $limit: Int! = 10, $loadspaceHeight: IntRange, $loadspaceLength: IntRange, $loadspaceVolume: IntRange, $loadspaceWidth: IntRange, $maximumWeight: IntRange, $mileage: IntRange, $modelDesignation: [String!], $modelIdentifier: [VehicleClass!], $modelYear: IntRange, $monthlyRate: ValueRange, $motorization: [String!], $packages: [String!], $page: Int! = 0, $payload: IntRange, $price: ValueRange, $productCode: String, $productionDate: DateRange, $profileId: String!, $registrationType: [String!], $seats: [Int!], $sortingType: String! = "price-asc", $stockCategories: [String!], $stockType: [StockItemState!], $torque: IntRange, $typeClass: [String!], $ucNumber: String, $upholstery: [String!], $upholsteryName: [String!], $upholsteryPolish: [String!], $variantId: String, $vehicleCategory: String!, $vehicleHeight: IntRange, $wheelbase: IntRange) {\n  search(\n    baumuster4: $baumuster4\n    bodyType: $bodyType\n    brand: $brand\n    buildType: $buildType\n    campaigns: $campaigns\n    color: $color\n    colorName: $colorName\n    colorPolish: $colorPolish\n    contextType: $contextType\n    dealerId: $dealerId\n    dealerFittedOptions: $dealerFittedOptions\n    driveType: $driveType\n    enginePowerHP: $enginePowerHP\n    enginePowerKW: $enginePowerKW\n    equipment: $equipment\n    estimatedArrivalDate: $estimatedArrivalDate\n    facelift: $facelift\n    firstRegistrationDate: $firstRegistrationDate\n    fuelType: $fuelType\n    gearbox: $gearbox\n    generation: $generation\n    language: $language\n    lines: $lines\n    limit: $limit\n    loadspaceHeight: $loadspaceHeight\n    loadspaceLength: $loadspaceLength\n    loadspaceVolume: $loadspaceVolume\n    loadspaceWidth: $loadspaceWidth\n    maximumWeight: $maximumWeight\n    mileage: $mileage\n    modelDesignation: $modelDesignation\n    modelIdentifier: $modelIdentifier\n    modelYear: $modelYear\n    monthlyRate: $monthlyRate\n    motorization: $motorization\n    packages: $packages\n    page: $page\n    payload: $payload\n    price: $price\n    productCode: $productCode\n    productionDate: $productionDate\n    profileId: $profileId\n    registrationType: $registrationType\n    seats: $seats\n    sortingType: $sortingType\n    stockCategories: $stockCategories\n    stockType: $stockType\n    torque: $torque\n    typeClass: $typeClass\n    ucNumber: $ucNumber\n    upholstery: $upholstery\n    upholsteryName: $upholsteryName\n    upholsteryPolish: $upholsteryPolish\n    variantId: $variantId\n    vehicleCategory: $vehicleCategory\n    vehicleHeight: $vehicleHeight\n    wheelbase: $wheelbase\n  ) {\n    facets { bodyType { ...FormattedValueFacet } brand { ...FormattedValueFacet } buildType { ...SimpleCountFacet } campaigns { ...FormattedValueFacet } color { ...FormattedValueFacet } colorName { ...FormattedValueFacet } colorPolish { ...FormattedValueFacet } dealerFittedOptions { ...FormattedValueFacet } dealerId { ...SimpleCountFacet } driveType { ...FormattedValueFacet } enginePowerHP { ...RangeFacet } enginePowerKW { ...RangeFacet } equipment { ...FormattedValueFacet } estimatedArrivalDate { ...DateRangeFacet } fuelType { ...FormattedValueFacet } gearbox { ...FormattedValueFacet } generation { ...SimpleCountFacet } lines { ...FormattedValueFacet } loadspaceHeight { ...RangeFacet } loadspaceLength { ...RangeFacet } loadspaceVolume { ...RangeFacet } loadspaceWidth { ...RangeFacet } maximumWeight { ...RangeFacet } modelDesignation { ...FormattedValueFacet } modelIdentifier { ...FormattedValueFacet } modelYear { ...RangeFacet } monthlyRate { ...RangeFacet } motorization { ...SimpleCountFacet } packages { ...FormattedValueFacet } payload { ...RangeFacet } price { ...RangeFacet } productionDate { ...DateRangeFacet } registrationType { ...FormattedValueFacet } seats { ...NumberCountFacet } stockType { ...SimpleCountFacet } torque { ...RangeFacet } upholstery { ...FormattedValueFacet } upholsteryName { ...FormattedValueFacet } upholsteryPolish { ...FormattedValueFacet } vehicleHeight { ...RangeFacet } wheelbase { ...RangeFacet } mileage @include(if: $isUcos) { ...RangeFacet } firstRegistrationDate @include(if: $isUcos) { ...DateRangeFacet } stockCategories @include(if: $isUcos) { ...FormattedValueFacet } } navigation { currentLimit currentPage currentSortingCode totalPages totalResults } results { characteristics { stockCategories { code } highlights { label } campaigns { description footnote label } } consignorCompanyId emissionAndConsumption { attributes { displayValue id label mustShowIn unit value } footnotes testProcedure } envkv { co2Classes { primary secondary } } estimatedArrivalDate identification { code commissionNumber dcpProductType dealerId dealerGroupName mpcId variantId vin vxVehicleId } images { default } productionDate preProductionVehicle stock { stockType } stockCategory technicalInformation { engine { fuelType { ...TechnicalData } power { ...PowerData } } transmission { ...TechnicalData } } usedVehicleData @include(if: $isUcos) { mileage { ...IntegerTechnicalData } firstRegistrationDate vehicleInspection { maintenance } warranty { status unlimitedDistance } } vehicleModel { baumuster bodyType { ...TechnicalData } brand { ...TechnicalData } category { ...TechnicalData } facelift generation modelYear modelYearCode motorization name steeringPosition { ...TechnicalData } typeClass vehicleClass { ...TechnicalData } } wholesale } } }\n\nfragment DateRangeFacet on DateRangeFacet { values { min max count } facetType }\nfragment FormattedValueFacet on FormattedValueFacet { values { label formattedValue value count } facetType }\nfragment IntegerTechnicalData on IntegerTechnicalData { label formattedValue value unit }\nfragment PowerData on Power { label formattedValue combustionKw { ...IntegerTechnicalData } combustionHp { ...IntegerTechnicalData } electricKw { ...IntegerTechnicalData } electricHp { ...IntegerTechnicalData } combinedKw { ...IntegerTechnicalData } combinedHp { ...IntegerTechnicalData } }\nfragment RangeFacet on RangeFacet { values { min max count } facetType }\nfragment NumberCountFacet on NumberCountFacet { values { value count } facetType }\nfragment SimpleCountFacet on SimpleCountFacet { values { value count } facetType }\nfragment TechnicalData on TechnicalData { label formattedValue value unit }';
    }

    const response = await axios.post(apiUrl, graphqlPayload, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.X_API_KEY || "",
      },
    });

    if (response.data.errors?.length > 0) {
      console.warn(`EMH API responded with status ${response.data.errors[0].message}`);
      return null;
    }

    console.log("Successfully fetched EMH API response");
    return response.data;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.warn("Failed to fetch EMH API response:", errorMessage);
    return null;
  }
}

export async function fetchDcpApiResponse(): Promise<any> {
  const env = ENVIRONMENT || "INT";
  const country = COUNTRY || "KR";
  const product = PRODUCT || "UCOS";

  try {
    const envPrefix = env === "INT" ? "shop-int" : "shop";
    const apiUrl = `https://${envPrefix}.mercedes-benz.com/dcpoto-api/dcp-api/v2/dcp-mp-${country.toLowerCase()}/products/search?query=%3Arelevance%3AuseProductType%3A${product}%3AallCategories%3Adcp-mp-${country.toLowerCase()}-vehicles&currentPage=0&pageSize=12&fields=FULL&lang=ko`;

    const graphqlPayload = {};

    const response = await axios.get(apiUrl);

    if (response.data.errors?.length > 0) {
      console.warn(`DCP API responded with status ${response.data.errors[0].message}`);
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

function normalizeFacetToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]/g, "");
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

function compareSelectedFiltersWithFacetsByExpectedValue(
  expectedValue: string,
  facets: Record<string, any>
): {
  matches: boolean;
  missingFacetValues: string[];
} {
  const normalizedExpected = normalizeFacetToken(expectedValue || "");
  if (!normalizedExpected) {
    return {
      matches: false,
      missingFacetValues: ["empty-expected-filter-value"],
    };
  }

  const expectedCandidates = buildFacetCandidateTokens(expectedValue);
  const backendEquipmentValues = Array.isArray(facets?.equipment)
    ? facets.equipment.map((value: any) => String(value))
    : [];
  const backendTokens = new Set(
    backendEquipmentValues.flatMap((value: string) =>
      buildFacetCandidateTokens(value)
    )
  );

  const matchesBackend = expectedCandidates.some(
    (candidate) =>
      backendTokens.has(candidate) ||
      Array.from(backendTokens).some(
        (token) => token.length >= 10 && candidate.startsWith(token)
      )
  );

  return {
    matches: matchesBackend,
    missingFacetValues: matchesBackend
      ? []
      : [`be:equipment missing '${expectedValue}'`],
  };
}

export async function processAndLogApiResult({
  query,
  results,
  testDescribe,
  testTitle,
  customEval,
  expectedStatusCode,
}: {
  query: any;
  results: ApiSearchResult;
  testDescribe: string;
  testTitle: string;
  customEval?: (resultData: any) => Promise<string>;
  expectedStatusCode?: number;
}): Promise<any> {
  const { evaluateSearchResult } = await import("./aiHelpers");
  const testFacets = process.env.TEST_FACETS === "true";
  const actualInput = query?.value ?? query;
  const actualFacets = query?.shouldFilter;
  const aiEvaluationHints = query?.aiEvaluationHints;
  const smartSearchMessage = results.results?.resultText || "";
  const apiResponse = results.results?.responseData;
  const resultsFacets = (() => {
    const params = results.results.responseData?.data?.smartSearch?.parameters || {};
    const excludeKeys = [
      "contextType",
      "isUcos",
      "limit",
      "sortingType",
      "language",
      "profileId",
      "vehicleCategory",
      "__typename"
    ];
    return Object.fromEntries(
      Object.entries(params).filter(([key]) => !excludeKeys.includes(key))
    );
  })();
  let openaiEvaluation = "No results to evaluate";
  let resultCount = 0;
  let hasError = false;
  let uiFacetComparison: {
    matches: boolean;
    missingFacetValues: string[];
  } | null = null;
  const lang = LANGUAGE?.toLocaleLowerCase() || "en";  
  const addFailureReason = (reason: string) => {
    const normalizedEvaluation = (openaiEvaluation || "").trim();
    if (!normalizedEvaluation || normalizedEvaluation.toUpperCase() === "PASS") {
      openaiEvaluation = reason;
    } else if (!normalizedEvaluation.includes(reason)) {
      openaiEvaluation = `${normalizedEvaluation} | ${reason}`;
    }
    hasError = true;
  };

  // Check if status code matches expectation (if provided)
  if (expectedStatusCode && results.statusCode !== expectedStatusCode) {
    addFailureReason(
      `Status Code Mismatch: Expected ${expectedStatusCode}, got ${results.statusCode}`
    );
  } else if (expectedStatusCode && results.statusCode === expectedStatusCode) {
    // If we have an expected status code and it matches, treat as success regardless of error
    openaiEvaluation = `Expected status code ${expectedStatusCode} received as expected`;
    hasError = false;

    // If there are also results to evaluate, include that information
    if (results.results) {
      const searchResults = apiResponse.data.smartSearch;
      const smartSearchResponse = results.results.resultText;

      if (searchResults) {
        resultCount =
          searchResults.results?.length ||
          searchResults.navigation?.totalResults ||
          0;
      }

      // Basic check to see if payload is empty (could be due to errors or unexpected response structure)
      if (resultCount === 0) {
        addFailureReason("Payload is zero");
      }

      if (customEval) {
        openaiEvaluation = await customEval(results.results);
      } else {
        openaiEvaluation = await evaluateSearchResult(
          smartSearchResponse,
          aiEvaluationHints,
          query?.value ?? query
        );
      }      
    }
  } else if ((results.error || results.results?.errors) && results.statusCode !== 400) {
    // Check for non-400 errors (400 is now treated as valid response with message_to_user)
    addFailureReason(
      `API Error: ${results.results?.errors
        ?.map((err: any) => err.message)
        .join("; ")}`
    );
  } else if (results.results) {
    // Handle the new Smart Search + Actual Search response structure
    const searchResults =
      process.env.API_ENDPOINT_LOCAL === "true"
        ? apiResponse?.searchResults
        : apiResponse?.data?.smartSearch;
    const smartSearchResponse = results.results.resultText;

    if (searchResults) {
      resultCount =
        searchResults.results?.length ||
        searchResults.navigation?.totalResults ||
        0;
    }

    // Basic check to see if payload is empty (could be due to errors or unexpected response structure)
    if (resultCount === 0) {
      addFailureReason("Payload is zero");
    }

    if (customEval) {
      openaiEvaluation = await customEval(results.results);
    } else {
      openaiEvaluation = await evaluateSearchResult(
        smartSearchResponse,
        aiEvaluationHints,
        query?.value ?? query
      );
    }    
  }

  // Facets check (BE vs test-data)
  if (testFacets && actualFacets && !deepEqual(resultsFacets, actualFacets, ["__typename"])) {
    addFailureReason(
      `Facets mismatch: expected ${JSON.stringify(actualFacets)}, got ${JSON.stringify(resultsFacets)}`
    );
  }

  // Facets check (Query vs UI vs BE)
  const facetMismatches: string[] = [];
  const isFacetEquipmentOnly = Object.keys(resultsFacets).length > 1 && resultsFacets.equipment;
  if (isFacetEquipmentOnly) {
    const apiEquipmentFacets: Array<{ formattedValue: string; value: string }> =
      apiResponse?.data?.smartSearch?.facets?.equipment?.values ?? [];
    const equipmentCodeToName = new Map<string, string>(
      apiEquipmentFacets.map((f) => [f.value, f.formattedValue])
    );
    const resolvedEquipment = (resultsFacets.equipment as string[]).map(
      (code: string) => equipmentCodeToName.get(code) ?? code
    );
    resultsFacets.equipment = resolvedEquipment;
  }
  if (query?.facet === 'equipment') {
    uiFacetComparison = compareSelectedFiltersWithFacetsByExpectedValue(
      query.filterValue,
      resultsFacets
    );
  }
  if (uiFacetComparison && !uiFacetComparison.matches) {
    facetMismatches.push(
      `Filters Mismatch: missing ${JSON.stringify(
        uiFacetComparison.missingFacetValues
      )}, beFacets ${JSON.stringify(resultsFacets)}`
    );
  }
  if (facetMismatches.length > 0) {
    addFailureReason(facetMismatches.join(" | "));
  }

  // Validate language consistency between query and response using OpenAI
  let langCheckResult = "YES";
  try {
    const langCompletion = await openaiChatCompletion([
      { role: "system", content: "You are a linguistic expert. Evaluate if the two texts are of the same language." },
      { role: "user", content: `Text#1: '${actualInput}'\nText#2: '${smartSearchMessage}'\nRespond with 'YES' only if they are the same language, otherwise respond with 2-digit language code of Text#1 and Text#2.` }
    ], {
      max_tokens: 10,
      temperature: 0.2
    });
    langCheckResult = langCompletion.choices?.[0]?.message?.content?.trim().toUpperCase() || "NO";
  } catch (error: any) {
    console.warn(`[WARN] OpenAI language validation skipped: ${error?.message || error}`);
    // Skip validation if OpenAI is unavailable (quota/network issues)
    langCheckResult = "YES";
  }
  if (!isLanguageConsistencyAccepted(langCheckResult)) {
    console.debug("[DEBUG] Language consistency check: FAIL");
    addFailureReason(`Language Inconsistency - '${langCheckResult}'`);
  }

  const normalizedEvaluation = (openaiEvaluation || "").trim();
  const evaluationPassed =
    normalizedEvaluation.toUpperCase() === "PASS" ||
    normalizedEvaluation.startsWith("Expected status code ");
  const displayHasError = hasError || !evaluationPassed;

  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${displayHasError ? "❌ FAIL |" : "✅"} ${openaiEvaluation} | ${testTitle}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Query:         '${actualInput}'`);
  console.log(`Response:      '${smartSearchMessage}'`);
  let queryEn = actualInput;
  let smartSearchMessageEn = smartSearchMessage;
  if (lang !== "en") {
    queryEn = await fetchTranslation(actualInput, "en");
    smartSearchMessageEn = await fetchTranslation(
      smartSearchMessage,
      "en"
    );
    console.log(`Query (EN):    '${queryEn}'`);
    console.log(`Response (EN): '${smartSearchMessageEn}'`);
  }
  console.log("\n");

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
      "en": queryEn,
    },
    response: {
      [`${lang}`]: smartSearchMessage,
      "en": smartSearchMessageEn,
    },
    resultCount,
    responseTime: results.responseTime,
    statusCode: results.statusCode,
    hasError: displayHasError,
    error: results.error,
    // apiResponse,
    openaiEvaluation: openaiEvaluation,
    facets: resultsFacets,
  };
}

export function addResponseListener(
  page: any,
  callback: (response: any) => void
): void {
  page.on("response", async (response: any) => {
    try {
      callback(response);
    } catch (error) {
      console.warn("Error in response listener:", error);
    }
  });
}
