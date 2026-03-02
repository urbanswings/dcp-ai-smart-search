import fs from "fs/promises";
import { OpenAI } from "openai";

export const ENVIRONMENT = process.env.ENVIRONMENT;
export const COUNTRY = process.env.COUNTRY;
export const LANGUAGE = process.env.LANGUAGE;
export const PRODUCT = process.env.PRODUCT;

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

/**
 * Generates multiple unique queries using OpenAI with deduplication.
 * @param count - Number of queries to generate
 * @param systemPrompt - System prompt for OpenAI
 * @param userPromptTemplate - User prompt template (can include getLanguageLocale())
 * @param maxTokens - Maximum tokens for completion
 * @param fallback - Fallback query if generation fails
 * @param maxAttempts - Maximum attempts to generate unique queries
 * @returns Array of unique generated queries
 */
export async function generateUniqueQueries(
  count: number,
  systemPrompt: string,
  userPromptTemplate: string,
  maxTokens: number = 50,
  fallback: string = "",
  maxAttempts: number = 10
): Promise<string[]> {
  const queries: string[] = [];
  const seenQueries = new Set<string>();
  let attempts = 0;

  while (queries.length < count && attempts < maxAttempts) {
    attempts++;
    try {
      let query = await generateOpenAIQuery(
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
      // Clean up quotes
      query = query.replace(/^"|"$/g, "");
      const normalized = query.toLowerCase();
      
      if (query && !seenQueries.has(normalized)) {
        queries.push(query);
        seenQueries.add(normalized);
      }
    } catch (err) {
      if (fallback && !seenQueries.has(fallback.toLowerCase())) {
        queries.push(fallback);
        seenQueries.add(fallback.toLowerCase());
      }
    }
  }

  return queries;
}

/**
 * Generates multiple queries using OpenAI (simple version without deduplication).
 * @param count - Number of queries to generate
 * @param systemPrompt - System prompt for OpenAI
 * @param userPromptTemplate - User prompt template
 * @param maxTokens - Maximum tokens for completion
 * @param fallback - Fallback query if generation fails
 * @returns Array of generated queries
 */
export async function generateMultipleQueries(
  count: number,
  systemPrompt: string,
  userPromptTemplate: string,
  maxTokens: number = 50,
  fallback: string = ""
): Promise<string[]> {
  const queries: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const query = await generateOpenAIQuery(
      systemPrompt,
      userPromptTemplate,
      maxTokens,
      fallback
    );
    if (query) {
      queries.push(query);
    }
  }

  return queries;
}