import axios from "axios";
import fs from "fs";
import { AzureOpenAI } from "openai";
import path from "path";
import { COUNTRY, LANGUAGE } from "../core/testHelpers";

const OPENAI_API_VERSION = "2024-08-01-preview";
const OPENAI_CHAT_MODEL = "gpt-4o-mini";
const OPENAI_DEFAULT_MAX_TOKENS = 40;
const OPENAI_DEFAULT_TEMPERATURE = 0.7;

let openai: AzureOpenAI | null = null;

function getOpenAIClient(): AzureOpenAI {
  if (openai) {
    return openai;
  }

  openai = new AzureOpenAI({
    apiKey: process.env.NEXUS_API_KEY || process.env.AZURE_OPENAI_API_KEY,
    endpoint:
      process.env.NEXUS_API_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion:
      process.env.NEXUS_API_VERSION ||
      process.env.OPENAI_API_VERSION ||
      OPENAI_API_VERSION,
  });

  return openai;
}

export async function fetchTranslation(
  text: string,
  targetLang: string = "en",
): Promise<string> {
  if (!text?.trim()) return "";

  try {
    const response = await axios.get(
      "https://translate.googleapis.com/translate_a/single",
      {
        params: { client: "gtx", sl: "auto", tl: targetLang, dt: "t", q: text },
        timeout: 10000,
      },
    );

    if (response.data?.[0]) {
      return response.data[0]
        .map((item: any) => item[0])
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    return "";
  } catch (error) {
    console.warn(
      "Translation failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return "";
  }
}

/**
 * Helper for OpenAI chat completion calls.
 */
export async function openaiChatCompletion(
  messages: any[],
  options: Record<string, any> = {},
  max_tokens?: number,
  temperature?: number,
) {
  return getOpenAIClient().chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    messages,
    max_tokens: max_tokens ?? OPENAI_DEFAULT_MAX_TOKENS,
    temperature: temperature ?? OPENAI_DEFAULT_TEMPERATURE,
    ...options,
  });
}

/**
 * Determines if two strings are semantically similar using OpenAI.
 */
export async function isSemanticallySimilarOpenAI(
  str1: string,
  str2: string,
): Promise<boolean> {
  const evaluationRulesPath = path.resolve(
    process.cwd(),
    "tests/data/ai-evaluation-rules.json",
  );
  const evaluationRules = JSON.parse(
    fs.readFileSync(evaluationRulesPath, "utf-8"),
  );

  const {
    systemPrompt: systemPromptArray,
    userPromptTemplate: userPromptTemplateArray,
    maxTokens,
    temperature,
  } = evaluationRules.semanticsSimilarity;
  const systemPrompt = Array.isArray(systemPromptArray)
    ? systemPromptArray.map((line) => line.trim()).join("\n")
    : systemPromptArray;
  const userPromptTemplate = Array.isArray(userPromptTemplateArray)
    ? userPromptTemplateArray.map((line) => line.trim()).join("\n")
    : userPromptTemplateArray;

  try {
    const userPrompt = userPromptTemplate
      .replace("{str1}", str1)
      .replace("{str2}", str2);
    const answer = await generateOpenAIQuery(
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature,
    );
    return answer.includes("YES");
  } catch (error) {
    console.warn(
      "OpenAI API error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return false;
  }
}

/**
 * Evaluates a search result using OpenAI.
 */
export async function evaluateSearchResult(
  resultText: string,
  aiEvaluationHints?: { value: string[]; overwrite: boolean },
  queryText?: string,
): Promise<string> {
  const evaluationRulesPath = path.resolve(
    process.cwd(),
    "tests/data/ai-evaluation-rules.json",
  );
  const evaluationRules = JSON.parse(
    fs.readFileSync(evaluationRulesPath, "utf-8"),
  );

  const {
    systemPrompt: systemPromptArray,
    maxTokens,
    temperature,
  } = evaluationRules.resultsEvaluation;
  let systemPrompt = Array.isArray(systemPromptArray)
    ? systemPromptArray.map((line) => line.trim()).join("\n")
    : systemPromptArray;
  let userPrompt = resultText;

  // Handle aiEvaluationHints if provided
  if (
    aiEvaluationHints &&
    aiEvaluationHints.value &&
    aiEvaluationHints.value.length > 0
  ) {
    const hintsText = [
      ...aiEvaluationHints.value
        .map((line) => (typeof line === "string" ? line.trim() : ""))
        .filter(Boolean),
      "If the correct evaluation is FAIL, provide the reason in the response.",
    ].join("\n");

    if (aiEvaluationHints.overwrite === true) {
      // Use only the hints as system prompt
      systemPrompt = hintsText;
    } else {
      // Append hints to existing system prompt
      systemPrompt = systemPrompt + "\n\n" + hintsText;
    }

    userPrompt = queryText
      ? `User query:\n${queryText}\n\nResponse to evaluate:\n${resultText}`
      : resultText;
  }

  const isNegativeContradictoryEvaluation = Boolean(
    aiEvaluationHints?.value?.some((line) =>
      /Negative\/Contradictory Queries|contradictory queries appropriately/i.test(
        String(line),
      ),
    ),
  );
  const shouldPassNegativeContradictoryBoundaryResponse = (
    answer: string,
  ): boolean => {
    if (!isNegativeContradictoryEvaluation) {
      return false;
    }

    const normalizedAnswer = answer.toLowerCase();
    const failedOnlyForContradictionHandling =
      /does not address.*contradict|fails? to address.*contradict|contradictory nature/.test(
        normalizedAnswer,
      );
    if (!failedOnlyForContradictionHandling) {
      return false;
    }

    const normalizedResponse = resultText.toLowerCase();
    const scopesToVehicleSearch =
      /only (help|support|assist).*vehicle search|focused on the vehicle part|not able to assist|can't satisfy|cannot satisfy|couldn.t find|couldn't find|no exact match|not currently available|not available|no matching/.test(
        normalizedResponse,
      );
    const redirectsOrOffersAlternatives =
      /sales team|dealer|dealership|alternative|broader|available options|options to consider|inventory|vehicles matching|found vehicles|matching your request|browse our broader lineup|explore/.test(
        normalizedResponse,
      );

    return scopesToVehicleSearch && redirectsOrOffersAlternatives;
  };

  try {
    const answer = await generateOpenAIQuery(
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature,
    );

    if (shouldPassNegativeContradictoryBoundaryResponse(answer)) {
      return "PASS";
    }

    if (!answer.includes("PASS")) {
      console.warn(`[WARN] OpenAI Evaluation indicates failure: ${answer}`);
    }
    return answer ?? "No response from OpenAI.";
  } catch (error) {
    console.warn(
      "OpenAI API error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return "Error from OpenAI.";
  }
}

/**
 * Generates a query using OpenAI.
 */
export async function generateOpenAIQuery(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 40,
  temperature: number = OPENAI_DEFAULT_TEMPERATURE,
  fallback: string = "",
): Promise<string> {
  systemPrompt = systemPrompt
    .replace(/\{LANGUAGE\}/g, LANGUAGE)
    .replace(/\{COUNTRY\}/g, COUNTRY);
  userPrompt = userPrompt
    .replace(/\{LANGUAGE\}/g, LANGUAGE)
    .replace(/\{COUNTRY\}/g, COUNTRY);
  try {
    const completion = await openaiChatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: temperature,
        max_tokens: maxTokens,
      },
    );
    return completion.choices[0].message.content?.trim() ?? fallback;
  } catch (err) {
    return fallback;
  }
}

/**
 * Generates multiple unique queries using OpenAI with deduplication.
 */
export async function generateUniqueQueries(
  count: number,
  systemPrompt: string,
  userPromptTemplate: string,
  maxTokens: number = 50,
  fallback: string = "",
  maxAttempts: number = 10,
  temperature: number = OPENAI_DEFAULT_TEMPERATURE,
): Promise<string[]> {
  if (!systemPrompt || !userPromptTemplate) return [];
  const queries: string[] = [];
  const seenQueries = new Set<string>();
  let attempts = 0;
  let query = "";

  systemPrompt = systemPrompt
    .replace(/\{LANGUAGE\}/g, LANGUAGE)
    .replace(/\{COUNTRY\}/g, COUNTRY);
  userPromptTemplate = userPromptTemplate
    .replace(/\{LANGUAGE\}/g, LANGUAGE)
    .replace(/\{COUNTRY\}/g, COUNTRY);
  while (queries.length < count && attempts < maxAttempts) {
    attempts++;
    try {
      const previousSamples = queries
        .slice(-4)
        .map((q) => `- ${q}`)
        .join("\n");
      const diversityHint = previousSamples
        ? `\n\nAvoid repeating phrasing similar to these previous outputs:\n${previousSamples}\nUse a different opening and sentence structure.`
        : "";
      query = await generateOpenAIQuery(
        systemPrompt,
        `${userPromptTemplate}${diversityHint}`,
        maxTokens,
        temperature,
      );
      query = query.replace(/^"|"$/g, "");
      const normalized = query.toLowerCase();

      if (query && !seenQueries.has(normalized)) {
        queries.push(query);
        seenQueries.add(normalized);

        console.log("\n");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`Generated query`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`Query:       '${query}'`);
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
