/**
 * Where LLM providers are reached from: their SDK packages and API hosts. Used by
 * `security/no-llm-sdk-in-client` to spot code that talks to a provider straight from the browser,
 * where the API key it needs is visible to every visitor.
 */

/** Provider SDKs published as a single package (matched with or without a sub-path, e.g. `openai/resources`). */
const LLM_SDK_PACKAGES: ReadonlySet<string> = new Set([
  "openai",
  "@azure/openai",
  "@anthropic-ai/sdk",
  "@anthropic-ai/bedrock-sdk",
  "@anthropic-ai/vertex-sdk",
  "@google/generative-ai",
  "@google/genai",
  "@google-cloud/vertexai",
  "@aws-sdk/client-bedrock-runtime",
  "groq-sdk",
  "@mistralai/mistralai",
  "cohere-ai",
  "together-ai",
  "replicate",
  "@huggingface/inference",
  "@openrouter/ai-sdk-provider",
  "fireworks-ai",
  "@langchain/openai",
  "@langchain/anthropic",
  "@langchain/google-genai",
  "@langchain/groq",
  "@langchain/mistralai",
  "@langchain/cohere",
]);

/**
 * `@ai-sdk/*` packages that are not provider clients: the UI hooks call your own server route, the
 * rest are shared types and utilities. Every other `@ai-sdk/<name>` is a provider (`@ai-sdk/openai`,
 * `@ai-sdk/anthropic`, `@ai-sdk/google`, ...), so new providers are covered without a list update.
 */
const AI_SDK_NON_PROVIDERS: ReadonlySet<string> = new Set([
  "vue",
  "react",
  "svelte",
  "solid",
  "angular",
  "rsc",
  "ui-utils",
  "provider",
  "provider-utils",
  "gateway",
  "mcp",
]);

/** The package a module specifier points at: `openai/resources/chat` -> `openai`, `@ai-sdk/openai/internal` -> `@ai-sdk/openai`. */
const packageNameOf = (specifier: string): string => {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
};

/** The provider SDK package a module specifier belongs to, or `null` when it is not an LLM provider SDK. */
export const findLlmSdkPackage = (specifier: string): string | null => {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  const name = packageNameOf(specifier);
  if (LLM_SDK_PACKAGES.has(name)) return name;
  if (name.startsWith("@ai-sdk/") && !AI_SDK_NON_PROVIDERS.has(name.slice("@ai-sdk/".length))) return name;
  return null;
};

/** API hosts of LLM providers, matched exactly. */
const LLM_API_HOSTS: ReadonlySet<string> = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.groq.com",
  "api.mistral.ai",
  "api.cohere.com",
  "api.cohere.ai",
  "api.together.xyz",
  "api.together.ai",
  "api.perplexity.ai",
  "api.deepseek.com",
  "api.x.ai",
  "api.fireworks.ai",
  "api.replicate.com",
  "api.ai21.com",
  "api-inference.huggingface.co",
  "router.huggingface.co",
]);

/** Providers with per-account or per-region hosts. */
const LLM_API_HOST_PATTERNS: readonly RegExp[] = [
  /\.openai\.azure\.com$/,
  /(?:^|\.)aiplatform\.googleapis\.com$/,
  /^bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com$/,
];

const URL_HOST_PATTERN = /^(?:https?:)?\/\/(?:[^/@?#]*@)?([^/:?#]+)(?::\d+)?(?:[/?#]|$)/i;

/** OpenRouter shares its host with the website, so only its API path counts. */
const isOpenRouterApi = (host: string, url: string): boolean =>
  host === "openrouter.ai" && /^(?:https?:)?\/\/[^/]+\/api(?:\/|$)/i.test(url);

/** The LLM provider host a URL (or URL prefix) points at, or `null`. Relative URLs never match. */
export const findLlmApiHost = (url: string): string | null => {
  const match = URL_HOST_PATTERN.exec(url.trim());
  if (!match?.[1]) return null;
  const host = match[1].toLowerCase();
  if (LLM_API_HOSTS.has(host) || LLM_API_HOST_PATTERNS.some((pattern) => pattern.test(host))) return host;
  return isOpenRouterApi(host, url.trim()) ? host : null;
};
