import axios from 'axios';
import { COUNTRY, LANGUAGE } from './testHelpers';
import { OpenAI } from 'openai/client';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// OpenAI model and default options constants
const OPENAI_CHAT_MODEL = "gpt-4.1-mini";
const OPENAI_DEFAULT_MAX_TOKENS = 40;
const OPENAI_DEFAULT_TEMPERATURE = 0.7;
const TRANSLATE_API_URL = 'https://api.mymemory.translated.net/get';

export async function fetchTranslation(text: string, targetLang: string = 'en'): Promise<string> {
  try {
    const response = await axios.get('https://translate.google.com/translate_a/single', {
      params: {
        client: 'gtx',
        sl: 'auto', // Source language auto-detection
        tl: targetLang, // Target language
        dt: 't',
        q: text, // Text to translate
      },
    });

    // Extracting the translated text from the response
    const combinedResults = combineResults(response.data[0].map((item: any) => item[0].trim() || ''));
    return combinedResults.trim();
  } catch (error) {
    console.warn('Error fetching translation:', error);
    return '';
  }
}

export function combineResults(results: string[], separator: string = ' '): string {
  if (!Array.isArray(results)) {
    throw new Error('Input must be an array of strings');
  }

  return results.join(separator);
}

/**
 * Helper for OpenAI chat completion calls.
 * @param messages - Array of chat messages
 * @param options - Additional options (max_tokens, temperature, etc.)
 * @param max_tokens - Override default max tokens
 * @param temperature - Override default temperature
 */
async function openaiChatCompletion(
  messages: any[],
  options: Record<string, any> = {},
  max_tokens?: number,
  temperature?: number
) {
  return openai.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    messages,
    max_tokens: typeof max_tokens === 'number' ? max_tokens : OPENAI_DEFAULT_MAX_TOKENS,
    temperature: typeof temperature === 'number' ? temperature : OPENAI_DEFAULT_TEMPERATURE,
    ...options,
  });
}

export async function translateText(text: string, langCodeFrom: string, langCodeTo: string = 'en'): Promise<string> {
    if (!text || !langCodeFrom || langCodeFrom.length !== 2 || !langCodeTo || langCodeTo.length !== 2) {
      console.warn('Invalid input for translateText');
      return '';
    }

    const params = {
        q: text,
        langpair: `${langCodeFrom}|${langCodeTo}`
    };

    try {
      const response = await axios.get(TRANSLATE_API_URL, { params });
      return response.data.responseData.translatedText;
    } catch (error) {
      if (error instanceof Error) {
        console.warn('Translation failed:', error.message);
      } else {
        console.warn('Translation failed: Unknown error');
      }
      return '';
    }
}

/**
 * Uses OpenAI API to determine if two strings are semantically similar (paraphrases).
 * Returns true if similar, false otherwise.
 */
export async function isSemanticallySimilarOpenAI(str1: string, str2: string): Promise<boolean> {
  // Load evaluation rules
  const evaluationRulesPath = path.resolve(process.cwd(), 'tests/data/ai-evaluation-rules.json');
  const evaluationRules = JSON.parse(fs.readFileSync(evaluationRulesPath, 'utf-8'));  

  const { systemPrompt: systemPromptArray, userPromptTemplate: userPromptTemplateArray, maxTokens, temperature } = evaluationRules.semanticsSimilarity;
  const systemPrompt = Array.isArray(systemPromptArray) ? systemPromptArray.map(line => line.trim()).join('\n') : systemPromptArray;
  const userPromptTemplate = Array.isArray(userPromptTemplateArray) ? userPromptTemplateArray.map(line => line.trim()).join('\n') : userPromptTemplateArray;

  try {
    const userPrompt = userPromptTemplate
      .replace('{str1}', str1)
      .replace('{str2}', str2);

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
    if (error instanceof Error) {
      console.warn("OpenAI API error:", error.message);
    } else {
      console.warn("OpenAI API error: Unknown error");
    }
    return false;
  }
}

export async function evaluateSearchResult(
  resultText: string
): Promise<string> {
  // Load evaluation rules
  const evaluationRulesPath = path.resolve(process.cwd(), 'tests/data/ai-evaluation-rules.json');
  const evaluationRules = JSON.parse(fs.readFileSync(evaluationRulesPath, 'utf-8'));  

  const { systemPrompt: systemPromptArray, maxTokens, temperature } = evaluationRules.resultsEvaluation;
  const systemPrompt = Array.isArray(systemPromptArray)
  ? systemPromptArray.map(line => line.trim()).join('\n')
  : systemPromptArray;

  try {
    const completion = await openaiChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: resultText }
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
    if (error instanceof Error) {
      console.warn("OpenAI API error:", error.message);
    } else {
      console.warn("OpenAI API error: Unknown error");
    }      
    return "Error from OpenAI.";
  }
}

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