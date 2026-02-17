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