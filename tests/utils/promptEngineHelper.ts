import { AzureOpenAI } from "openai";

/**
 * PromptEngineHelper
 * Encapsulates query generation with diversification, style hints, fallback templates,
 * and sliding-window opening-signature tracking to enforce varied output.
 */

const COMPLETE_QUERY_STYLE_HINTS = [
  "Use exact form '<facet name> <filter value>'",
  "Use a feature-led style",
  "Use a shortlist style",
  "Use a direct command style",
  "Use a conversational ask style",
  "Use an explore/discover style",
  "Use a minimal keyword style",
  "Use a preference-led style",
];

const REPETITIVE_COMPLETE_QUERY_PREFIXES = [
  "looking for",
  "searching for",
  "show me",
  "i want",
  "i need",
  "recommend",
];

const REPETITIVE_COMPLETE_QUERY_PATTERNS = [
  /\bmodels?\s+only\.?$/i,
  /\bvehicles?\s+only\.?$/i,
  /\bmodels?\s+available(\s+for\s+(purchase|review|sale))?\.?$/i,
  /\bmodels?\s+available\s+now\.?$/i,
  /\bmodels?\.?$/i,
];

const OPENING_WINDOW_SIZE = 8;

// Types
interface PromptContext {
  styleCursor: number;
  templateCursor: number;
  recentOpenings: string[];
}

interface GenerationOptions {
  language?: string;
  fallbackFn?: (facetKey: string, formattedValue: string, rawValue: unknown) => string;
  filterTextFn?: (facetKey: string, formattedValue: string, rawValue: unknown) => string;
  maxTokens?: number;
}

/**
 * Normalize whitespace in a string
 */
function normalizeWhitespace(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * Extract first-two-word signature (lowercased) from a query
 * Used for detecting repetition across recent queries
 */
function getOpeningSignature(value: unknown): string {
  const words = normalizeWhitespace(value).toLowerCase().split(" ").filter(Boolean);
  return words.slice(0, 2).join(" ");
}

/**
 * Create a new prompt engine context
 * Manages style hint rotation, fallback template rotation, and opening signature history
 */
function createPromptContext(): PromptContext {
  return {
    styleCursor: 0,
    templateCursor: 0,
    recentOpenings: [],
  };
}

/**
 * Pick next style hint from the rotation
 */
function pickNextCompleteStyle(context: PromptContext): string {
  const idx = context.styleCursor % COMPLETE_QUERY_STYLE_HINTS.length;
  context.styleCursor += 1;
  return COMPLETE_QUERY_STYLE_HINTS[idx];
}

function buildFacetFirstQuery(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  facetDisplayNameFn: (key: string) => string
): string {
  const valueLabel = normalizeWhitespace(formattedValue || rawValue);
  const keyLabel = normalizeWhitespace(facetDisplayNameFn(facetKey) || facetKey);
  return normalizeWhitespace(`${keyLabel} ${valueLabel}`);
}

/**
 * Build varied fallback phrase by rotating through templates
 */
function buildVariedFallbackPhrase(
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  facetDisplayNameFn: (key: string) => string,
  context: PromptContext
): string {
  const valueLabel = normalizeWhitespace(formattedValue || rawValue);
  const keyLabel = facetDisplayNameFn(facetKey);
  const templates = [
    `${valueLabel} options`,
    `${valueLabel} vehicles`,
    `${keyLabel} ${valueLabel}`,
    `find ${valueLabel}`,
    `only ${valueLabel}`,
    `${valueLabel} lineup`,
    `compare ${valueLabel}`,
    `${valueLabel} recommendations`,
  ];
  const idx = context.templateCursor % templates.length;
  context.templateCursor += 1;
  return normalizeWhitespace(templates[idx]);
}

/**
 * Track opening signature in sliding window
 */
function recordOpening(context: PromptContext, opening: string): void {
  context.recentOpenings.push(opening);
  if (context.recentOpenings.length > OPENING_WINDOW_SIZE) {
    context.recentOpenings.shift();
  }
}

/**
 * Enforce variation in generated queries by detecting repetitive patterns,
 * checking opening-signature history, and falling back to diverse templates
 */
function enforceCompleteQueryVariation(
  generated: string,
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  facetDisplayNameFn: (key: string) => string,
  context: PromptContext
): string {
  const normalized = normalizeWhitespace(generated);
  if (!normalized) {
    const fallback = buildVariedFallbackPhrase(facetKey, formattedValue, rawValue, facetDisplayNameFn, context);
    recordOpening(context, getOpeningSignature(fallback));
    return fallback;
  }

  const lower = normalized.toLowerCase();
  const startsRepetitive = context.recentOpenings.some((prefix) => lower.startsWith(prefix));
  const matchesRepetitivePattern = REPETITIVE_COMPLETE_QUERY_PATTERNS.some((pattern) => pattern.test(normalized));
  const opening = getOpeningSignature(normalized);
  const seenRecently = context.recentOpenings.includes(opening);

  if (startsRepetitive || matchesRepetitivePattern || seenRecently) {
    const fallback = buildVariedFallbackPhrase(facetKey, formattedValue, rawValue, facetDisplayNameFn, context);
    recordOpening(context, getOpeningSignature(fallback));
    return fallback;
  }

  recordOpening(context, opening);
  return normalized;
}

/**
 * Generate OpenAI query with system and user prompts
 */
async function generateOpenAiQuery(
  client: AzureOpenAI,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 32
): Promise<string> {
  console.log("[prompt-engine] Generating query with AI...");
  console.log(`[prompt-engine] System prompt: ${systemPrompt}`);
  console.log(`[prompt-engine] User prompt: ${userPrompt}`);
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: maxTokens,
  });
  return completion?.choices?.[0]?.message?.content?.trim() || "";
}

/**
 * Generate a complete query with diversification and variation enforcement
 * Accepts custom systemPrompt and userPrompt for flexibility
 *
 * @param client - Azure OpenAI client
 * @param facetKey - The facet being queried
 * @param formattedValue - Display value
 * @param rawValue - Raw/internal value
 * @param systemPrompt - System prompt (replaces {LANGUAGE} placeholder)
 * @param userPromptTemplate - User prompt template (replaces {LANGUAGE}, {filterText}, {styleHint} placeholders)
 * @param facetDisplayNameFn - Function to get display name for facet
 * @param context - Prompt context (from createPromptContext)
 * @param options - Generation options
 * @returns Generated query
 */
async function generateQueryWithVariation(
  client: AzureOpenAI | null,
  facetKey: string,
  formattedValue: string,
  rawValue: unknown,
  systemPrompt: string | undefined,
  userPromptTemplate: string | undefined,
  facetDisplayNameFn: (key: string) => string,
  context: PromptContext,
  options: GenerationOptions = {}
): Promise<string> {
  const { language = "en", fallbackFn, filterTextFn, maxTokens = 32 } = options;
  const exactQuery = buildFacetFirstQuery(facetKey, formattedValue, rawValue, facetDisplayNameFn);
  const fallback = fallbackFn ? fallbackFn(facetKey, formattedValue, rawValue) : exactQuery;

  if (!client || !systemPrompt || !userPromptTemplate) {
    return enforceCompleteQueryVariation(fallback, facetKey, formattedValue, rawValue, facetDisplayNameFn, context);
  }

  try {
    const filterText = filterTextFn
      ? filterTextFn(facetKey, formattedValue, rawValue)
      : `${facetDisplayNameFn(facetKey)} ${formattedValue}`;

    const styleHint = pickNextCompleteStyle(context);
    const resolvedSystemPrompt = String(systemPrompt).replace(/\{LANGUAGE\}/g, language);
    const resolvedUserPromptBase = String(userPromptTemplate)
      .replace(/\{LANGUAGE\}/g, language)
      .replace(/\{filterText\}/g, filterText)
      .replace(/\{styleHint\}/g, styleHint);
    const resolvedUserPrompt = `${resolvedUserPromptBase}\nStyle requirement: ${styleHint}.`;

    if (styleHint.includes("'<facet name> <filter value>'")) {
      return enforceCompleteQueryVariation(
        exactQuery,
        facetKey,
        formattedValue,
        rawValue,
        facetDisplayNameFn,
        context
      );
    }
    
    const generated = await generateOpenAiQuery(client, resolvedSystemPrompt, resolvedUserPrompt, maxTokens);
    return generated;
    // const generatedVariation = enforceCompleteQueryVariation(
    //   generated || fallback,
    //   facetKey,
    //   formattedValue,
    //   rawValue,
    //   facetDisplayNameFn,
    //   context
    // );
    // return generatedVariation;
  } catch (error) {
    console.error(`[prompt-engine] Error generating query: ${error instanceof Error ? error.message : error}`);
    return enforceCompleteQueryVariation(fallback, facetKey, formattedValue, rawValue, facetDisplayNameFn, context);
  }
}

export {
  // Constants
  COMPLETE_QUERY_STYLE_HINTS,
  REPETITIVE_COMPLETE_QUERY_PREFIXES,
  REPETITIVE_COMPLETE_QUERY_PATTERNS,
  OPENING_WINDOW_SIZE,
  // Types
  PromptContext,
  GenerationOptions,
  // Utilities
  normalizeWhitespace,
  getOpeningSignature,
  // Context management
  createPromptContext,
  // Diversification
  pickNextCompleteStyle,
  buildFacetFirstQuery,
  buildVariedFallbackPhrase,
  recordOpening,
  // Enforcement
  enforceCompleteQueryVariation,
  // API
  generateOpenAiQuery,
  // Main orchestrator
  generateQueryWithVariation,
};
