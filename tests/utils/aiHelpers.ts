import axios from 'axios';
import { COUNTRY, LANGUAGE } from './testHelpers';
import { OpenAI } from 'openai/client';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_CHAT_MODEL = "gpt-4o-mini";
const OPENAI_DEFAULT_MAX_TOKENS = 40;
const OPENAI_DEFAULT_TEMPERATURE = 0.7;

export async function fetchTranslation(text: string, targetLang: string = 'en'): Promise<string> {
  if (!text?.trim()) return '';

  try {
    const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'auto', tl: targetLang, dt: 't', q: text },
      timeout: 10000,
    });

    if (response.data?.[0]) {
      return response.data[0].map((item: any) => item[0]).filter(Boolean).join(' ').trim();
    }
    return '';
  } catch (error) {
    console.warn('Translation failed:', error instanceof Error ? error.message : 'Unknown error');
    return '';
  }
}

/**
 * Helper for OpenAI chat completion calls.
 */
export async function openaiChatCompletion(
  messages: any[],
  options: Record<string, any> = {},
  max_tokens?: number,
  temperature?: number
) {
  return openai.chat.completions.create({
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
export async function isSemanticallySimilarOpenAI(str1: string, str2: string): Promise<boolean> {
  const evaluationRulesPath = path.resolve(process.cwd(), 'tests/data/ai-evaluation-rules.json');
  const evaluationRules = JSON.parse(fs.readFileSync(evaluationRulesPath, 'utf-8'));

  const { systemPrompt: systemPromptArray, userPromptTemplate: userPromptTemplateArray, maxTokens, temperature } = evaluationRules.semanticsSimilarity;
  const systemPrompt = Array.isArray(systemPromptArray) ? systemPromptArray.map(line => line.trim()).join('\n') : systemPromptArray;
  const userPromptTemplate = Array.isArray(userPromptTemplateArray) ? userPromptTemplateArray.map(line => line.trim()).join('\n') : userPromptTemplateArray;

  try {
    const userPrompt = userPromptTemplate.replace('{str1}', str1).replace('{str2}', str2);

    const completion = await openaiChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], {
      max_tokens: maxTokens,
      temperature: temperature
    });

    const answer = completion.choices?.[0]?.message?.content || "";
    return answer.includes("YES");
  } catch (error) {
    console.warn("OpenAI API error:", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

/**
 * Evaluates a search result using OpenAI.
 */
export async function evaluateSearchResult(
  resultText: string,
  aiEvaluationHints?: { value: string[]; overwrite: boolean },
  queryText?: string
): Promise<string> {
  const evaluationRulesPath = path.resolve(process.cwd(), 'tests/data/ai-evaluation-rules.json');
  const evaluationRules = JSON.parse(fs.readFileSync(evaluationRulesPath, 'utf-8'));

  const { systemPrompt: systemPromptArray, maxTokens, temperature } = evaluationRules.resultsEvaluation;
  let systemPrompt = Array.isArray(systemPromptArray) ? systemPromptArray.map(line => line.trim()).join('\n') : systemPromptArray;
  let userPrompt = resultText;

  // Handle aiEvaluationHints if provided
  if (aiEvaluationHints && aiEvaluationHints.value && aiEvaluationHints.value.length > 0) {
    const hintsText = aiEvaluationHints.value.map(line => (typeof line === 'string' ? line.trim() : '')).filter(Boolean).join('\n');

    if (aiEvaluationHints.overwrite === true) {
      // Use only the hints as system prompt
      systemPrompt = hintsText;
    } else {
      // Append hints to existing system prompt
      systemPrompt = systemPrompt + '\n\n' + hintsText;
    }

    userPrompt = queryText
      ? `User query:\n${queryText}\n\nResponse to evaluate:\n${resultText}`
      : resultText;
  }

  try {
    const completion = await openaiChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], {
      max_tokens: maxTokens,
      temperature: temperature
    });

    const answer = completion.choices?.[0]?.message?.content || "";
    if (!answer.includes("PASS")) {
      console.warn(`[WARN] OpenAI Evaluation indicates failure: ${completion.choices[0].message.content}`);
    }
    return answer ?? "No response from OpenAI.";
  } catch (error) {
    console.warn("OpenAI API error:", error instanceof Error ? error.message : "Unknown error");
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
  fallback: string = ""
): Promise<string> {
  systemPrompt = systemPrompt.replace(/\{LANGUAGE\}/g, LANGUAGE).replace(/\{COUNTRY\}/g, COUNTRY);
  userPrompt = userPrompt.replace(/\{LANGUAGE\}/g, LANGUAGE).replace(/\{COUNTRY\}/g, COUNTRY);
  try {
    const completion = await openaiChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], {
      temperature: OPENAI_DEFAULT_TEMPERATURE,
      max_tokens: maxTokens,
    });
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
  maxAttempts: number = 10
): Promise<string[]> {
  const queries: string[] = [];
  const seenQueries = new Set<string>();
  let attempts = 0;
  let query = '';

  while (queries.length < count && attempts < maxAttempts) {
    attempts++;
    try {
      query = await generateOpenAIQuery(
        systemPrompt,
        userPromptTemplate,
        maxTokens,
        fallback
      );
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

  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Generated query`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Query:       '${query}'`);
  console.log("\n");
  return queries;
}
