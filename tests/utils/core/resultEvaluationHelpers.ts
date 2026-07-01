import fs from "fs";
import path from "path";
import {
  evaluateSearchResult,
  fetchTranslation,
  openaiChatCompletion,
} from "../query/aiHelpers";
import facetsMasterData from "../../data/facets-master-data.json";
import { normalizeFacetToken } from "../facets/facetAssertionHelpers";
import { isLanguageConsistencyAccepted } from "./shared";
import { extractVehicleTotalCountFromMessage } from "./vehicleCountHelpers";

export type ResultStatus = "PASS" | "FAIL" | "SKIP";

export interface FailureState {
  openaiEvaluation: string;
  hasError: boolean;
}

export interface TranslatedResultText {
  queryEn: any;
  smartSearchMessageEn: string;
}

const EMH_API_RESPONSE_PATH = path.resolve(
  __dirname,
  "../../data/emh-api-response.json",
);

let normalizedEmhApiResponseCache: string | null | undefined;

function getNormalizedEmhApiResponse(): string | null {
  if (normalizedEmhApiResponseCache !== undefined) {
    return normalizedEmhApiResponseCache;
  }

  try {
    if (!fs.existsSync(EMH_API_RESPONSE_PATH)) {
      normalizedEmhApiResponseCache = null;
      return normalizedEmhApiResponseCache;
    }

    normalizedEmhApiResponseCache = normalizeFacetToken(
      fs.readFileSync(EMH_API_RESPONSE_PATH, "utf-8"),
    );
  } catch {
    normalizedEmhApiResponseCache = null;
  }

  return normalizedEmhApiResponseCache;
}

function isMotorizationFoundInEmhApiResponse(motorization: string): boolean {
  const normalizedMotorization = normalizeFacetToken(motorization);
  const normalizedEmhApiResponse = getNormalizedEmhApiResponse();

  return Boolean(
    normalizedMotorization &&
      normalizedEmhApiResponse?.includes(normalizedMotorization),
  );
}

function normalizeMotorizationDisplayValue(value: string): string {
  return value.replace(/\s+KR$/i, "").trim();
}

function getMotorizationCandidateValues(): string[] {
  const candidates = new Set<string>();
  const motorizationValues = (facetsMasterData as any)?.motorization?.values;
  const modelDesignationValues = (facetsMasterData as any)?.modelDesignation
    ?.values;

  if (Array.isArray(modelDesignationValues)) {
    for (const item of modelDesignationValues) {
      const formattedValue = normalizeMotorizationDisplayValue(
        String(item?.formattedValue || "").trim(),
      );
      if (formattedValue) {
        candidates.add(formattedValue);
      }
    }
  }

  if (Array.isArray(motorizationValues)) {
    for (const item of motorizationValues) {
      const value = normalizeMotorizationDisplayValue(
        String(item?.value || "").trim(),
      );
      if (value) {
        candidates.add(value);
      }
    }
  }

  return Array.from(candidates);
}

export function extractMotorizationFromSmartSearchMessage(
  smartSearchMessage: string,
): string[] {
  const normalizedMessage = normalizeFacetToken(smartSearchMessage || "");
  if (!normalizedMessage) {
    return [];
  }

  const motorizationValues = getMotorizationCandidateValues();
  if (motorizationValues.length === 0) {
    return [];
  }

  const matches = motorizationValues
    .map((value: string) => ({
      value,
      normalizedValue: normalizeFacetToken(value),
    }))
    .filter(({ normalizedValue }) => {
      return (
        normalizedValue && normalizedMessage.includes(normalizedValue)
      );
    })
    .sort((a, b) => {
      const indexDiff =
        normalizedMessage.indexOf(a.normalizedValue) -
        normalizedMessage.indexOf(b.normalizedValue);
      if (indexDiff !== 0) {
        return indexDiff;
      }

      const normalizedLengthDiff =
        b.normalizedValue.length - a.normalizedValue.length;
      return normalizedLengthDiff || b.value.length - a.value.length;
    })
    .map(({ value }) => value);

  const selectedMatches: string[] = [];
  const selectedTokens: string[] = [];
  for (const match of matches) {
    const normalizedMatch = normalizeFacetToken(match);
    if (
      selectedTokens.some(
        (token) =>
          token.includes(normalizedMatch) ||
          normalizedMatch.includes(token),
      )
    ) {
      continue;
    }

    selectedMatches.push(match);
    selectedTokens.push(normalizedMatch);
  }

  return selectedMatches;
}

export function getDetectedMotorizationValues(
  resultsFacets: Record<string, any>,
  smartSearchMessage: string,
): string[] {
  if (resultsFacets.motorization !== undefined) {
    return Array.isArray(resultsFacets.motorization)
      ? resultsFacets.motorization
      : [String(resultsFacets.motorization)];
  }

  return extractMotorizationFromSmartSearchMessage(smartSearchMessage);
}

export function isPassEvaluation(
  value: string,
  options: { allowExpectedStatus?: boolean } = {},
): boolean {
  const normalized = (value || "").trim();
  return (
    normalized.toUpperCase() === "PASS" ||
    Boolean(
      options.allowExpectedStatus &&
        normalized.startsWith("Expected status code "),
    )
  );
}

export function addFailureReason(state: FailureState, reason: string): void {
  const normalizedEvaluation = (state.openaiEvaluation || "").trim();
  if (
    !normalizedEvaluation ||
    normalizedEvaluation.toUpperCase() === "PASS"
  ) {
    state.openaiEvaluation = reason;
  } else if (!normalizedEvaluation.includes(reason)) {
    state.openaiEvaluation = `${normalizedEvaluation} | ${reason}`;
  }
  state.hasError = true;
}

export function getSmartSearchResultCount(apiResponse: any): number {
  const searchResults = apiResponse?.data?.smartSearch;
  if (!searchResults) {
    return 0;
  }

  return (
    searchResults.navigation?.totalResults || searchResults.results?.length || 0
  );
}

export function extractSmartSearchParameters(
  apiResponse: any,
): Record<string, any> {
  const params = apiResponse?.data?.smartSearch?.parameters || {};
  const excludeKeys = [
    "contextType",
    "isUcos",
    "limit",
    "sortingType",
    "language",
    "profileId",
    "vehicleCategory",
    "__typename",
    "page",
  ];

  return Object.fromEntries(
    Object.entries(params).filter(([key]) => !excludeKeys.includes(key)),
  );
}

export async function evaluateSmartSearchMessage({
  smartSearchMessage,
  aiEvaluationHints,
  actualInput,
  skipOpenAiEvaluation,
  emptyMessageEvaluation,
}: {
  smartSearchMessage: string;
  aiEvaluationHints: any;
  actualInput: any;
  skipOpenAiEvaluation: boolean;
  emptyMessageEvaluation: string;
}): Promise<string> {
  if (skipOpenAiEvaluation && smartSearchMessage?.trim()) {
    return "PASS";
  }

  if (smartSearchMessage?.trim()) {
    return (
      await evaluateSearchResult(
        smartSearchMessage,
        aiEvaluationHints,
        actualInput,
      )
    )?.trim();
  }

  return emptyMessageEvaluation;
}

export async function validateResponseVehicleCount(
  smartSearchMessage: string,
  resultCount: number,
): Promise<{
  responseVehicleTotalCount: number | null;
  countCheckPassed: boolean;
  failureReason?: string;
}> {
  const responseVehicleTotalCount =
    await extractVehicleTotalCountFromMessage(smartSearchMessage);

  if (
    responseVehicleTotalCount !== null &&
    responseVehicleTotalCount !== resultCount
  ) {
    return {
      responseVehicleTotalCount,
      countCheckPassed: false,
      failureReason: `Response total count mismatch: message says ${responseVehicleTotalCount}, backend resultCount is ${resultCount}`,
    };
  }

  return {
    responseVehicleTotalCount,
    countCheckPassed: true,
  };
}

export async function validateLanguageConsistency(
  actualInput: any,
  smartSearchMessage: string,
): Promise<string | null> {
  let langCheckResult = "YES";
  try {
    const langCompletion = await openaiChatCompletion(
      [
        {
          role: "system",
          content:
            "You are a linguistic expert. Evaluate if the two texts are of the same language.",
        },
        {
          role: "user",
          content: `Text#1: '${actualInput}'\nText#2: '${smartSearchMessage}'\nRespond with 'YES' only if they are the same language, otherwise respond with 2-digit language code of Text#1 and Text#2.`,
        },
      ],
      {
        max_completion_tokens: 50, // Increased from 10 for better reliability with gpt-5-mini
      },
    );
    langCheckResult =
      langCompletion.choices?.[0]?.message?.content?.trim().toUpperCase() ||
      "NO";
  } catch (error: any) {
    console.warn(
      `[WARN] OpenAI language validation skipped: ${error?.message || error}`,
    );
    langCheckResult = "YES";
  }

  if (!isLanguageConsistencyAccepted(langCheckResult)) {

    return `Language Inconsistency - '${langCheckResult}'`;
  }

  return null;
}

export function getCountStatus(
  responseVehicleTotalCount: number | null,
  countCheckPassed: boolean,
): ResultStatus {
  if (responseVehicleTotalCount === null) {
    return "SKIP";
  }
  return countCheckPassed ? "PASS" : "FAIL";
}

export function sectionMarker(status: ResultStatus): string {
  if (status === "PASS") return "✅";
  if (status === "FAIL") return "❌";
  return "➖";
}

export async function translateResultText(
  lang: string,
  actualInput: any,
  smartSearchMessage: string,
): Promise<TranslatedResultText> {
  let queryEn = actualInput;
  let smartSearchMessageEn = smartSearchMessage;

  if (lang !== "en") {
    queryEn = await fetchTranslation(actualInput, "en");
    smartSearchMessageEn = await fetchTranslation(smartSearchMessage, "en");
  }

  return { queryEn, smartSearchMessageEn };
}

export function logResultSummary({
  displayHasError,
  openaiEvaluation,
  testTitle,
  messageStatus,
  countStatus,
  filterStatus,
  actualInput,
  smartSearchMessage,
  translatedText,
  responseVehicleTotalCount,
  resultCount,
  actualFacets,
  resultsFacets,
  uiVehicleCount,
  uiSelectedFiltersKV,
}: {
  displayHasError: boolean;
  openaiEvaluation: string;
  testTitle: string;
  messageStatus: ResultStatus;
  countStatus: ResultStatus;
  filterStatus: ResultStatus;
  actualInput: any;
  smartSearchMessage: string;
  translatedText?: TranslatedResultText;
  responseVehicleTotalCount: number | null;
  resultCount: number;
  actualFacets: any;
  resultsFacets: Record<string, any>;
  uiVehicleCount?: number | null;
  uiSelectedFiltersKV?: Record<string, string[]>;
}): void {
  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `${displayHasError ? "❌ FAIL |" : "✅"} ${openaiEvaluation} | ${testTitle}`,
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${sectionMarker(messageStatus)} Message:`);
  console.log(`• Query:      '${actualInput}'`);
  console.log(`• Response:   '${smartSearchMessage}'`);
  if (
    translatedText &&
    (translatedText.queryEn !== actualInput ||
      translatedText.smartSearchMessageEn !== smartSearchMessage)
  ) {
    console.log("\n");
    console.log(`${sectionMarker(messageStatus)} Message (EN):`);
    console.log(`• Query:      '${translatedText.queryEn}'`);
    console.log(`• Response:   '${translatedText.smartSearchMessageEn}'`);
  }

  console.log("\n");
  console.log(`${sectionMarker(countStatus)} Count:`);
  console.log(
    `• Response:  ${responseVehicleTotalCount === null ? "-" : responseVehicleTotalCount}`,
  );
  console.log(`• Backend:   ${resultCount}`);
  if (uiVehicleCount !== undefined) {
    console.log(
      `• UI:        ${uiVehicleCount === null ? "-" : uiVehicleCount}`,
    );
  }

  console.log("\n");
  console.log(`${sectionMarker(filterStatus)} Filters:`);
  console.log(
    `• Expected:  ${actualFacets === undefined ? "-" : JSON.stringify(actualFacets)}`,
  );
  console.log(`• Actual:    ${JSON.stringify(resultsFacets)}`);
  if (uiSelectedFiltersKV !== undefined) {
    console.log(`• UI:        ${JSON.stringify(uiSelectedFiltersKV)}`);
  }
  const motorizationValues = getDetectedMotorizationValues(
    resultsFacets,
    smartSearchMessage,
  );
  const modelDesignationMatches = motorizationValues.map((motorization) => ({
    motorization,
    found: isMotorizationFoundInEmhApiResponse(motorization),
  }));
  const modelDesignationStatus: ResultStatus =
    motorizationValues.length === 0
      ? "SKIP"
      : modelDesignationMatches.every((match) => match.found)
        ? "PASS"
        : "FAIL";
  console.log(
    `\n${sectionMarker(modelDesignationStatus)} Model Designation:`,
  );
  if (motorizationValues.length === 0) {
    console.log("• -");
  } else {
    const showItemMarkers = modelDesignationStatus === "FAIL";
    for (const match of modelDesignationMatches) {
      const foundMarker = showItemMarkers && match.found ? "✅ " : "";
      console.log(`• ${foundMarker}${match.motorization}`);
    }
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
