const { AzureOpenAI } = require("openai");

let openaiClient = null;

/**
 * Gets or initializes the Azure OpenAI client.
 * Uses environment variables: NEXUS_API_KEY, NEXUS_API_ENDPOINT, NEXUS_API_VERSION
 * Returns null if credentials are not configured.
 */
function getOpenAIClient() {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.NEXUS_API_KEY;
  const endpoint = process.env.NEXUS_API_ENDPOINT;
  const apiVersion = process.env.NEXUS_API_VERSION || "2024-08-01-preview";

  if (!apiKey || !endpoint) {
    return null;
  }

  openaiClient = new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
  });

  return openaiClient;
}

module.exports = { getOpenAIClient };
