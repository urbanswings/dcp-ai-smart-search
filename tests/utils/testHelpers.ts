export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const PRODUCT = process.env.PRODUCT;
import { Browser, Page } from "@playwright/test";
import fs from "fs/promises";
import { OpenAI } from "openai";

export const queriesPath = "./tests/data/search-queries.json";
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function logTestContext({
  describeName,
  testInfo,
  browserType,
  env,
  country,
  product,
  project,
  timestamp
}: {
  describeName: string;
  testInfo: any;
  browserType: string;
  env?: string;
  country?: string;
  product?: string;
  project?: string;
  timestamp?: string;
}) {
  console.log(`\n--- Test Execution ---`);
  console.log(`• Describe: ${describeName}`);
  console.log(`• Title: ${testInfo.title}`);
  console.log(`• Browser: ${browserType}`);
  console.log(`• Environment: ${env}`);
  console.log(`• Country: ${country}`);
  console.log(`• Product: ${product}`);
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
  query: string;
  results: import("@playwright/test").Locator;
  testDescribe: string;
  testTitle: string;
  customEval?: (resultText: string) => Promise<string>;
}) {
  let resultText = await results.innerText();
  let openaiEvaluation: string;
  let passed: boolean;
  openaiEvaluation = customEval
    ? await customEval(resultText)
    : await evaluateSearchResult(resultText);
  if (resultText.includes('[Script] PASSED')) {
    passed = true;
  } else if (resultText.includes('[Script] FAILED')) {
    passed = false;
  } else {
    passed = !/unexpected\/generic/i.test(openaiEvaluation);
  }
  const icon = passed ? "✅" : "❌";
  const entry: any = {
    testDescribe,
    testTitle,
    query,
    resultText,
    openaiEvaluation,
    passed,
    icon,
  };
  console.log(`\n----------- Test Result (${icon}) -----------`);
  console.log(`Test:       '${testTitle}'`);
  console.log(`Input:      '${query}'`);
  console.log(`Response:   '${resultText}'`);
  console.log(`Evaluation: '${openaiEvaluation}'`);
  console.log(`-------------------------------------------`);
  console.log("\n");
  return entry;
}

export async function generateOpenAIQuery(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 40,
  fallback: string = "",
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
    });
    return completion.choices[0].message.content?.trim() ?? fallback;
  } catch (err) {
    return fallback;
  }
}

export async function evaluateSearchResult(resultText: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            'You are an expert car sales assistant. Evaluate the following search result and respond with whether it only suggests Mercedes-Benz cars, generally suggests Mercedes-Benz, or is unexpected/generic.',
        },
        {
          role: "user",
          content: resultText,
        },
      ],
      max_tokens: 50,
    });
    return (
      completion.choices[0].message.content ??
      "No response from OpenAI."
    );
  } catch (err) {
    return "Error from OpenAI.";
  }
}

export async function getRandomVehicleCombinations(
  count: number,
  minLen: number = 2,
  maxLen: number = 5,
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

export async function setupContextAndPage(browser: Browser): Promise<Page> {
  console.log(`\n--- Test Environment ---`);
  console.log(`PROJECT: ${process.env.PROJECT}`);
  console.log(`ENVIRONMENT: ${ENVIRONMENT}`);
  console.log(`COUNTRY: ${COUNTRY}`);
  console.log(`PRODUCT: ${PRODUCT}`);
  console.log(`------------------------\n`);

  let httpCredentials;
  if (ENVIRONMENT === "INT") {
    if (process.env.PROJECT === "DCP" && process.env.DCP_USER_INT && process.env.DCP_PASS_INT) {
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
  } else if (ENVIRONMENT === "PREPROD" && process.env.AEM_USER_PREPROD && process.env.AEM_PASS_PREPROD) {
    httpCredentials = {
      username: process.env.AEM_USER_PREPROD,
      password: process.env.AEM_PASS_PREPROD,
    };
  }
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ...(httpCredentials ? { httpCredentials: httpCredentials } : {}),
  });
  const page = await context.newPage();
  // Dynamically select URL file based on PROJECT
  let urlFilePath = "./tests/data/emh-urls.json";
  if (process.env.PROJECT === "DCP") {
    urlFilePath = "./tests/data/dcp-urls.json";
  } else if (process.env.PROJECT === "EMH") {
    urlFilePath = "./tests/data/emh-urls.json";
  }
  const urlsFile = await fs.readFile(urlFilePath, "utf-8");
  const urls = JSON.parse(urlsFile);
  const country = COUNTRY || "KR";
  const env = ENVIRONMENT || "PROD";
  let url = urls[country]?.[env];
  if (!url) {
    // fallback to Korea PROD if not found
    url = urls["KR"]?.["PROD"] || "https://www.mercedes-benz.co.kr/passengercars/buy/new-car/search-results.html";
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
  await page
    .locator(".cmm-cookie-banner__content")
    .waitFor({ state: "visible" });
  await page.click(".button--accept-all");
}

export async function performAiSmartSearchAndGetResults(
  page: Page,
  inputText: string,
  submitDisabled:boolean = false,
): Promise<import("@playwright/test").Locator> {
  const searchButton = page.locator(".ai-search-button button");
  console.debug("[DEBUG] Waiting for search button to be visible...");
  await searchButton.waitFor({ state: "visible" });
  for (let j = 0; j < 10; j++) {
    const enabled = await searchButton.isEnabled();
    console.debug(`[DEBUG] Search button enabled: ${enabled} (attempt ${j + 1}/10)`);
    if (enabled) break;
    await page.waitForTimeout(1000);
  }
  const input = page.locator(".ai-input");
  console.debug(`[DEBUG] Filling input with: '${inputText}'`);
  await input.fill(" ");
  await input.fill(inputText);
  // Wait for .dcp-loader to contain .dcp-loader--hide
  await page.waitForFunction(() => {
    const loader = document.querySelector('.dcp-loader');
    return loader && loader.classList.contains('dcp-loader--hide');
  }, { timeout: 30000 });
  if (submitDisabled) {
    // After filling inputText, check that searchButton is disabled and not clickable
    const isDisabled = !(await searchButton.isEnabled());
    let notClickable = false;
    try {
      await searchButton.click({ trial: true, timeout: 1000 });
    } catch (e) {
      notClickable = true;
    }
    console.debug(`[DEBUG] Submit disabled check: isDisabled=${isDisabled}, notClickable=${notClickable}`);
    if (isDisabled && notClickable) {
      console.debug("[DEBUG] PASSED: Submit Button Disabled");
      return {
        innerText: async () => "[Script] PASSED: Submit Button Disabled"
      } as import("@playwright/test").Locator;
    } else {
      console.debug("[DEBUG] FAILED: Submit Button Enabled");
      return {
        innerText: async () => "[Script] FAILED: Submit Button Enabled"
      } as import("@playwright/test").Locator;
    }
  }
  await page.waitForFunction(() => {
    const loader = document.querySelector('.dcp-loader');
    return loader && loader.classList.contains('dcp-loader--hide');
  }, { timeout: 30000 });
  await searchButton.click();
  
  let retries = 0;
  let results = {
        innerText: async () => ""
      } as import("@playwright/test").Locator;
  const loader = page.locator(".dcp-loader");
  while (retries < 3) {
    try {
      console.debug(`[DEBUG] Waiting for results to be visible (attempt ${retries + 1}/3)...`);
      await page.waitForFunction(() => {
        const loader = document.querySelector('.dcp-loader');
        return loader && loader.classList.contains('dcp-loader--hide');
      }, { timeout: 30000 });
      results = page.locator(".ai-message");      
      const resultText = await results.innerText();

      const rateLimitMatch = resultText.match(/검색 제한을 초과했습니다\. (\d+)초 후에 다시 시도해 주세요/);
      if (rateLimitMatch) {
        const seconds = parseInt(rateLimitMatch[1], 10);
        console.info(`[DEBUG] Rate limit hit. Waiting for ${seconds} seconds before retrying...`);
        await page.waitForTimeout(seconds * 1000);
        retries++;
        
        await page.waitForFunction(() => {
          const loader = document.querySelector('.dcp-loader');
          return loader && loader.classList.contains('dcp-loader--hide');
        }, { timeout: 30000 });
        console.debug(`[DEBUG] Retrying search after rate limit wait (attempt ${retries + 1}/3)...`);
        await searchButton.click();
        continue;
      }
      break;
    } catch (e) {
      console.info(`[DEBUG] Error waiting for results: ${e}`);
      retries++;
      console.debug(`[DEBUG] Retrying search button click (attempt ${retries + 1}/3)...`);
      // await searchButton.click();
    }
  }

  return results;
}
