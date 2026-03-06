import axios from 'axios';
import { OpenAI } from 'openai/client';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TRANSLATE_API_URL = 'https://api.mymemory.translated.net/get';

export async function translateText(text: string, langCodeFrom: string, langCodeTo: string = 'en'): Promise<string> {
    if (!text || !langCodeFrom || langCodeFrom.length !== 2 || !langCodeTo || langCodeTo.length !== 2) {
        throw new Error('Invalid input');
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
            throw new Error('Translation failed: ' + error.message);
        }
        throw new Error('Translation failed: Unknown error');
    }
}

export async function translateTextWithOpenAI(text: string, langCodeTo: string = 'en'): Promise<string> {
    if (!text || !langCodeTo || langCodeTo.length !== 2) {
        throw new Error('Invalid input');
    }

    const prompt = `Translate the following text to ${langCodeTo}:\n\n${text}`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [
                { role: 'system', content: `You are a helpful translator. Translate the text to ${langCodeTo}.` },
                { role: 'user', content: text }
            ]
        });

        const translatedText = response.choices[0].message?.content;
        if (!translatedText) {
            throw new Error('Translation failed: No response from OpenAI');
        }

        return translatedText.trim();
    } catch (error) {
        if (error instanceof Error) {
            throw new Error('Translation failed: ' + error.message);
        }
        throw new Error('Translation failed: Unknown error');
    }
}

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
    console.error('Error fetching translation:', error);
    throw new Error('Failed to fetch translation');
  }
}

export function combineResults(results: string[], separator: string = ' '): string {
  if (!Array.isArray(results)) {
    throw new Error('Input must be an array of strings');
  }

  return results.join(separator);
}

/**
 * Uses OpenAI API to determine if two strings are semantically similar (paraphrases).
 * Returns true if similar, false otherwise.
 */
export async function isSemanticallySimilarOpenAI(str1: string, str2: string): Promise<boolean> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, skipping semantic similarity check.");
    return false;
  }
  const prompt = `
    Are the following two sentences equivalent in content for a Mercedes-Benz car search assistant?
    - Consider them equivalent if they would lead to the same search results on an e-commerce site, even if phrased differently.
    - It is OK if one sentence includes a polite greeting, closing statement, or extra details about features, as long as the main product(s), model(s), and key facets (like fuel, transmission, power, etc.) match.
    - Minor differences in phrasing, order, or extra polite language should be ignored.
    - If both sentences are polite refusals (e.g., cannot provide a specific recommendation but offer to help with Mercedes-Benz options), and the intent is the same, consider them equivalent even if the wording is different.
    - If both sentences mention the same main car(s) and core features, but one adds a greeting or a few extra features, consider them equivalent.
    - Only answer 'Yes' if the main car(s) and their key features/facets match, or if both are polite refusals with the same intent; otherwise, explain why not.
    \n\nSentence 1: "${str1}"\nSentence 2: "${str2}"`;
  const body = {
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant for language semantic similarity." },
      { role: "user", content: prompt }
    ],
    max_tokens: 3,
    temperature: 0.0
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    console.warn("OpenAI API error:", response.status, await response.text());
    return false;
  }
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.toLowerCase() || "";
  return answer.includes("yes");
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