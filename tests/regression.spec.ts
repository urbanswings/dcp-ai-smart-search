import "dotenv/config";
import { test } from "@playwright/test";
import { runTestsAndSaveResults } from "./utils/shared";
import { performUISmartSearchAndGetResults, processAndLogUiResult, setupContextAndPage } from "./utils/uiHelpers";
import { performApiSmartSearchAndGetResults, processAndLogApiResult } from "./utils/apiHelpers";

const informativeHints = [
  'Respond with "PASS" when the response presents a list of matching Mercedes-Benz vehicles and may use phrasing such as "I found options", "We have a selection of", or "I found vehicles matching your request" or equivalent. These queries are expected to always return results.',
  'Respond with "FAIL" if the response includes any disclaimer of inability, limitation, or mismatch (for example: "no results", "unable to find", "cannot fulfill", "no exact match", "no vehicles available", or similar wording), even if some options are shown afterward.',
  'Respond with "FAIL" if the response applies the wrong filter (for example, filtering by a different body type or color than what was requested), is off-topic, or refuses the request without a valid safety reason. Do not fail merely because tone is generic or polite.',
];

const regressionQueryValues = [
  "i dont like mercedes-benz",
  "recommend some cars",
  "show all suv",
  "list sedans only",
  "white cars",
  "black suvs",
  "show all except sedan",
  "show all body types except sedan"
];

const shouldFilterMap: Record<string, any> = {
  "i dont like mercedes-benz": false,
  "recommend some cars": true,
  "show all suv": { bodyType: ["SUV_OFFROADER"] },
  "list sedans only": { bodyType: ["LIMOUSINE"] },
  "white cars": { color: ["PAINT_COLOR_WHITE"] },
  "black suvs": { bodyType: ["SUV_OFFROADER"], color: ["PAINT_COLOR_BLACK"] },
  "show all except sedan": { bodyType: ["STATION","SUV_OFFROADER","HATCHBACK","CABRIO_ROADSTER","PEOPLE_CARRIER","COUPE"] },
  "show all body types except sedan": { bodyType: ["STATION","SUV_OFFROADER","HATCHBACK","CABRIO_ROADSTER","PEOPLE_CARRIER","COUPE"] },
};

test.describe("Regression Tests", () => {
  const describeName = "Regression Tests";
  test.beforeEach(() => {
    test.skip(!process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required for evaluator regression checks.");
  });

  test("Evaluate Bug Fixes", { tag: ["@regression"] }, async ({ browser }) => {
    const queries = regressionQueryValues.map((value) => ({
      value,
      shouldRecommend: true,
      shouldFilter: shouldFilterMap[value] ?? {},
      aiEvaluationHints: informativeHints?.length ? { value: informativeHints, overwrite: true } : {},
    }));
    await runTestsAndSaveResults({
      queries: queries,
      testDescribe: describeName,
      testTitle: test.info().title,
      testType: "from-regression-list",
      browser,
      setupContextAndPage,
      performUISmartSearchAndGetResults,
      processAndLogUiResult,
      performApiSmartSearchAndGetResults,
      processAndLogApiResult,
    });
  });
});
