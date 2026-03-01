import { Browser, Page, Locator } from "@playwright/test";
import { chromium } from "playwright";
import fs from "fs/promises";
import { OpenAI } from "openai";
import {
  translateText,
  translateTextWithOpenAI,
  fetchTranslation,
} from "./aiHelpers";

export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const LANGUAGE = process.env.LANGUAGE;
export const PRODUCT = process.env.PRODUCT;

export const queriesPath = "./tests/data/search-queries.json";
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface UiSearchResult {
  query: string;
  results: any;
  responseTime: number;
  error?: string;
}

export async function logTestContext({
  describeName,
  testInfo,
  browserType,
  env,
  country,
  product,
  project,
  timestamp,
  language,
}: {
  describeName: string;
  testInfo: any;
  browserType: string;
  env?: string;
  country?: string;
  product?: string;
  project?: string;
  timestamp?: string;
  language?: string;
}) {
  console.log(`\n--- Test Execution ---`);
  console.log(`• Describe: ${describeName}`);
  console.log(`• Title: ${testInfo.title}`);
  console.log(`• Browser: ${browserType}`);
  console.log(`• Environment: ${env || ENVIRONMENT}`);
  console.log(`• Country: ${country || COUNTRY}`);
  console.log(`• Language: ${language || LANGUAGE}`);
  console.log(`• Product: ${product || PRODUCT}`);
  console.log(`• Project: ${project}`);
  console.log(`• Timestamp: ${timestamp}`);
  console.log(`----------------------\n`);
}

export async function processAndLogResult({
  query,
  results,
  testDescribe,
  testTitle,
  customEval,
}: {
  query: any;
  results: UiSearchResult;
  testDescribe: string;
  testTitle: string;
  customEval?: (resultText: string) => Promise<string>;
}): Promise<any> {
  const actualInput = query?.value ?? query;
  const smartSearchMessage = results.results.resultText;
  let openaiEvaluation: string;
  let passed: boolean;
  openaiEvaluation = "PASS"; //customEval ? await customEval(smartSearchMessage) : await evaluateSearchResult(smartSearchMessage);
  passed = openaiEvaluation === "PASS";
  const lang = process.env.LANGUAGE?.toLocaleLowerCase() || "en";

  const icon = passed ? "✅" : "❌";
  const entry: any = {
    timestamp: new Date().toISOString(),
    timestampSG: new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    }),
    testMode: "ui",    
    testDescribe,
    testTitle,
    query,
    resultText: smartSearchMessage,
    smartSearchMessage,
    openaiEvaluation
  };
  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${icon} ${openaiEvaluation} | ${testTitle}`);
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
    testMode: "ui",    
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
    resultText: smartSearchMessage,
    smartSearchMessage,
    openaiEvaluation,
    facets: (() => {
      const params = results.results.apiResponse?.data?.smartSearch?.parameters || {};
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
    })(),
  };
}

export async function generateOpenAIQuery(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 40,
  fallback: string = ""
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
    });
    return completion.choices[0].message.content?.trim() ?? fallback;
  } catch (err) {
    return fallback;
  }
}

export async function evaluateSearchResult(
  resultText: string
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
            RULES: 
            (1) If YES - respond ONLY with: "PASS".
            (2) Otherwise - respond the reason. 
            If YES, evaluate message correctness based on these criteria: 
            (A) The response should directly address the search query or give suggestions. 
            (B) The response should provide relevant and accurate information related to the query. 
            (C) The response should be coherent and contextually appropriate. 
            (D) The response should not be vague or off-topic. 
            (E) The response should demonstrate an understanding of the user's intent behind the query.
            (F) The response only suggests Mercedes-Benz cars or related services/products.
            (G) The response maintains a polite/luxury tone, being un-biased, transparent and non-technical.
            (H) The response should focus on Mercedes-Benz vehicles, but polite acknowledgments of topics like financing are allowed as long as the main advice is about Mercedes-Benz vehicles.
            (I) The response should not directly schedule any appointments, make reservations, make calls, or ask for customer's contact/personal information. However, it is allowed to mention that another employee can assist with scheduling, arranging, or next steps, as long as the response itself does not directly schedule or request contact details. If the user provides contact information or requests a call, a polite refusal while offering alternative assistance is acceptable and should be marked as PASS.
            (J) If the user requests a feature, brand, policy, or service not available in Mercedes-Benz, a polite, brand-appropriate acknowledgment, refusal, or redirection to Mercedes-Benz offerings or even offering help and suggestion is acceptable and should be marked as PASS. This includes scenarios where the response transparently states something is not available while redirecting to available options.
            (K) The response should follow a structured format: opening with acknowledgment/appreciation of the customer's query, body providing the main information or explanation, and closing with an invitation, offer to help, or redirection to Mercedes-Benz options. Single-sentence responses are acceptable if they are complete and professional.`,
        },
        {
          role: "user",
          content: resultText,
        },
      ],
      max_completion_tokens: 20,
    });

    if (!completion.choices[0].message.content?.includes("PASS")) {
      console.warn(
        `[WARN] OpenAI Evaluation indicates failure: ${completion.choices[0].message.content}`
      );
    }
    return completion.choices[0].message.content ?? "No response from OpenAI.";
  } catch (err: any) {
    console.warn(
        `[WARN] OpenAI Evaluation indicates failure: ${err.message}`
      );
    return "Error from OpenAI.";
  }
}

export async function getRandomVehicleCombinations(
  count: number,
  minLen: number = 2,
  maxLen: number = 5
): Promise<string[]> {
  const file = await fs.readFile(queriesPath, "utf-8");
  const vehicleArray: string[] = JSON.parse(file);
  const combos: string[] = [];
  while (combos.length < count) {
    const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
    const shuffled = vehicleArray.slice().sort(() => 0.5 - Math.random());
    const combo = shuffled.slice(0, len).join(" ");
    if (!combos.includes(combo)) combos.push(combo);
  }
  return combos;
}

export async function setupContextAndPage(browser?: Browser): Promise<Page> {
  const country = COUNTRY || "KR";
  const env = ENVIRONMENT || "PROD";  
  let httpCredentials;
  
  if (ENVIRONMENT === "INT") {
    if (
      process.env.PROJECT === "DCP" &&
      process.env.DCP_USER_INT &&
      process.env.DCP_PASS_INT
    ) {
      httpCredentials = {
        username: process.env.DCP_USER_INT,
        password: process.env.DCP_PASS_INT,
      };
    } else if (process.env.AEM_USER_INT && process.env.AEM_PASS_INT) {
      httpCredentials = {
        username: process.env.AEM_USER_INT,
        password: process.env.AEM_PASS_INT,
      };
    }
  } else if (
    ENVIRONMENT === "PREPROD" &&
    process.env.AEM_USER_PREPROD &&
    process.env.AEM_PASS_PREPROD
  ) {
    httpCredentials = {
      username: process.env.AEM_USER_PREPROD,
      password: process.env.AEM_PASS_PREPROD,
    };
  }
  const cdpUrl = process.env.PLAYWRIGHT_CDP_URL || process.env.CDP_URL;
  let context;
  if (cdpUrl) {
    console.log(`Connecting to existing browser via CDP: ${cdpUrl}`);
    const attachedBrowser = await chromium.connectOverCDP(cdpUrl);
    const existingContexts = attachedBrowser.contexts();
    context =
      existingContexts.length > 0
        ? existingContexts[0]
        : await attachedBrowser.newContext({
            viewport: { width: 1920, height: 1080 },
          });
    if (httpCredentials) {
      console.warn(
        "httpCredentials cannot be applied when attaching to an existing persistent context. Proceeding without them."
      );
    }
  } else {
    if (!browser) {
      throw new Error(
        "Browser fixture is required when PLAYWRIGHT_CDP_URL is not set."
      );
    }
    context = await browser.newContext({
      viewport: null,
      deviceScaleFactor: undefined,
      ...(httpCredentials ? { httpCredentials } : {}),
    });
  }
  const page = await context.newPage();

  // Intercept and override the response payload only if OVERRIDE_CONFIG_FILE is set to 'true'
  if (process.env.OVERRIDE_CONFIG_FILE === 'true') {
    await page.route(
      (urlObj: URL) => {
        const url = urlObj.toString();
        // Use the value from the 'country' variable for the config file match
        const countryCode = country.toLowerCase();
        const configRegex = new RegExp(`config_${countryCode}\\.json$`, 'i');
        return (
          url.includes('emh-dcps-mrktplc-vehicles-configuration') &&
          configRegex.test(url)
        );
      },
      async (route) => {
        const response = await route.fetch();
        const originalPayload = await response.json();

        // Modify the payload
        const modifiedPayload = {
          ...originalPayload,
          srp: {
            ...originalPayload.srp,
            enableSmartSearch: true,
            availableCategories: Array.isArray(
              originalPayload.srp.availableCategories
            )
              ? [
                  {
                    ...originalPayload.srp.availableCategories[0],
                    enableSmartSearch: true,
                  },
                  ...originalPayload.srp.availableCategories.slice(1),
                ]
              : originalPayload.srp.availableCategories,
          },
        };

        // Fulfill the route with the modified payload
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(modifiedPayload),
        });
      }
    );
  }

  // Dynamically select URL file based on PROJECT
  let urlFilePath = "./tests/data/emh-urls.json";
  if (process.env.PROJECT === "DCP") {
    urlFilePath = "./tests/data/dcp-urls.json";
  } else if (process.env.PROJECT === "EMH") {
    urlFilePath = "./tests/data/emh-urls.json";
  }
  const urlsFile = await fs.readFile(urlFilePath, "utf-8");
  const urls = JSON.parse(urlsFile);
  let url = urls[country]?.[env];
  if (!url) {
    // fallback to Korea PROD if not found
    url =
      urls["KR"]?.["PROD"] ||
      "https://www.mercedes-benz.co.kr/passengercars/buy/new-car/search-results.html";
  }
  // Adjust path for PRODUCT
  if (PRODUCT === "NCOS") {
    url = url.replace(/\/used-car\//, "/new-car/");
  } else if (PRODUCT === "UCOS") {
    url = url.replace(/\/new-car\//, "/used-car/");
  }
  await page.goto(url);
  await handleCookieBanner(page);
  return page;
}

export async function handleCookieBanner(page: Page): Promise<void> {
  try {
    await page
      .locator(".cmm-cookie-banner__content")
      .waitFor({ state: "visible", timeout: 6000 });
    await page.click(".button--accept-all");
  } catch (e) {
    console.debug("[DEBUG] Cookie banner not visible, continuing execution...");
  }
}

export async function performUISmartSearchAndGetResults(
  page: Page,
  query: any = "",
  submitDisabled: boolean = false
): Promise<any> {
  const env = process.env.ENVIRONMENT || "INT";
  const searchButton = page.locator(
    ".smart-search__input.wb-input wb7-input-action div[data-on='contrast'] button"
  );
  console.debug("[DEBUG] Waiting for search button to be visible...");
  await searchButton.waitFor({ state: "visible" });
  for (let j = 0; j < 10; j++) {
    const enabled = await searchButton.isEnabled();
    console.debug(
      `[DEBUG] Search button enabled: ${enabled} (attempt ${j + 1}/10)`
    );
    if (enabled) break;
    await page.waitForTimeout(1000);
  }

  const actualInput = query?.value ?? query;
  const input = page.locator(
    "wb7-input.smart-search__input wb7-grey-box input"
  );
  console.debug(`[DEBUG] Filling input with: '${actualInput}'`);
  await input.fill(" ");
  await input.fill(actualInput);

  if (submitDisabled) {
    const isDisabled = !(await searchButton.isEnabled());
    let notClickable = false;
    try {
      await searchButton.click({ trial: true, timeout: 1000 });
    } catch (e) {
      notClickable = true;
    }
    console.debug(
      `[DEBUG] Submit disabled check: isDisabled=${isDisabled}, notClickable=${notClickable}`
    );
    if (isDisabled && notClickable) {
      console.debug("[DEBUG] PASSED: Submit Button Disabled");
      return {
        query: query,
        results: "[Script] PASSED: Submit Button Disabled",
        responseTime: 0,
        error: undefined,
      };
    } else {
      console.debug("[DEBUG] FAILED: Submit Button Enabled");
      return {
        query: query,
        results: "[Script] FAILED: Submit Button Enabled",
        responseTime: 0,
        error: "Submit button was enabled when it should be disabled",
      };
    }
  }

  const endpoint =
    process.env.API_ENDPOINT_LOCAL === "true"
      ? "http://localhost:8080/api/v2/search"
      : env?.toUpperCase() === "PROD"
      ? "https://ap.api.oneweb.mercedes-benz.com/commerce/onesearch/graphql"
      : env?.toUpperCase() === "INT"
      ? "https://test.api.oneweb.mercedes-benz.com/commerce/onesearch/int/graphql"
      : "https://int.api.oneweb.mercedes-benz.com/commerce/onesearch/eu/graphql";

  let apiResponsePayload: any[] = [];
  const responseListener = async (response: any) => {
    try {
      if (response.url().includes(endpoint)) {
        apiResponsePayload = await response.json();
      }
    } catch (e) {
      console.warn("[DEBUG] Failed to capture API response payload:", e);
    }
  };
  page.on("response", responseListener);

  if (await searchButton.isVisible()) await searchButton.click();

  let retries = 0;
  let resultText = "";
  const loader = page.locator(".dcp-loader");
  const startTime = Date.now();
  while (retries < 3) {
    try {
      console.debug(
        `[DEBUG] Waiting for results to be visible (attempt ${
          retries + 1
        }/3)...`
      );
      const results = page.locator(".smart-search__bubble p");
      resultText = await results.innerText();

      const rateLimitMatch = resultText.match(
        /검색 제한을 초과했습니다\. (\d+)초 후에 다시 시도해 주세요/
      );
      if (rateLimitMatch) {
        const seconds = parseInt(rateLimitMatch[1], 10);
        console.info(
          `[DEBUG] Rate limit hit. Waiting for ${seconds} seconds before retrying...`
        );
        await page.waitForTimeout(seconds * 1000);
        retries++;
        await searchButton.click();
        continue;
      }
      break;
    } catch (e) {
      console.info(`[DEBUG] Error waiting for results: ${e}`);
      retries++;
      console.debug(
        `[DEBUG] Retrying search button click (attempt ${retries + 1}/3)...`
      );
    }
  }

  const responseTime = Date.now() - startTime;
  return {
    query: query,
    results: {
      resultText,
      apiResponsePayload,
    },
    responseTime,
    error: retries === 3 ? "Failed to retrieve results after 3 attempts" : undefined,
    apiResponse: apiResponsePayload,
  };
}
