import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "the same SDK imports in a Nuxt server route",
      filename: "server/api/chat.post.ts",
      code: `import OpenAI from "openai";\nimport Anthropic from "@anthropic-ai/sdk";\nimport { GoogleGenerativeAI } from "@google/generative-ai";\nimport { openai } from "@ai-sdk/openai";\nconst client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\nexport default defineEventHandler(() => client.models.list());\n`,
    },
    {
      name: "a server-only module",
      filename: "src/lib/llm.server.ts",
      code: `import Groq from "groq-sdk";\nexport const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });\n`,
    },
    {
      name: "direct provider request from server code",
      filename: "server/utils/summarize.ts",
      code: `export const summarize = (text: string) =>\n  $fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY }, body: { text } });\n`,
    },
    {
      name: "useChat from @ai-sdk/vue calls your own server route",
      filename: "src/components/Chat.vue",
      code: `<script setup lang="ts">\nimport { useChat } from "@ai-sdk/vue";\nimport { generateText } from "ai";\nconst { messages, input, handleSubmit } = useChat({ api: "/api/chat" });\n</script>\n<template><form @submit="handleSubmit"><input v-model="input" /></form></template>\n`,
    },
    {
      name: "other @ai-sdk utility packages",
      code: `import { something } from "@ai-sdk/provider-utils";\nimport { Chat } from "@ai-sdk/react";\n`,
    },
    {
      name: "fetch to your own chat route",
      filename: "src/composables/useAssistant.ts",
      code: `export const ask = (prompt: string) => fetch("/api/chat", { method: "POST", body: JSON.stringify({ prompt }) });\nexport const askNuxt = (prompt: string) => $fetch("/api/chat", { method: "POST", body: { prompt } });\nexport const client = axios.create({ baseURL: "/api" });\nexport const rel = (path: string) => fetch(\`/api/\${path}\`);\n`,
    },
    {
      name: "type-only imports are erased at build time",
      code: `import type OpenAI from "openai";\nimport type { MessageParam } from "@anthropic-ai/sdk/resources";\nimport { type ChatCompletion, type ChatCompletionChunk } from "openai/resources";\nexport type { Message } from "@anthropic-ai/sdk";\nexport type Reply = ChatCompletion | ChatCompletionChunk | MessageParam | OpenAI;\n`,
    },
    {
      name: "unrelated packages and hosts",
      code: `import { openDB } from "idb";\nimport openaiLookalike from "openai-tokenizer-lite";\nimport { local } from "./openai";\nexport const docs = fetch("https://platform.openai.com/docs");\nexport const own = fetch("https://api.example.com/v1/chat");\nexport const lookalike = fetch("https://api.openai.com.example.org/v1");\n`,
    },
    {
      name: "dangerouslyAllowBrowser in server code",
      filename: "server/utils/openai.ts",
      code: `export const options = { dangerouslyAllowBrowser: true };\n`,
    },
    {
      name: "test files may use SDKs",
      filename: "src/chat.test.ts",
      code: `import OpenAI from "openai";\nexport const client = new OpenAI({ apiKey: "test", dangerouslyAllowBrowser: true });\n`,
    },
    {
      name: "a dynamic URL is not guessed",
      code: `export const call = (base: string) => fetch(\`\${base}/v1/chat/completions\`);\nexport const other = (url: string) => axios.post(url, {});\n`,
    },
  ],
  invalid: [
    {
      name: "openai SDK in a component",
      filename: "src/components/Chat.vue",
      code: `<script setup lang="ts">\nimport OpenAI from "openai";\nconst client = new OpenAI({ apiKey: useRuntimeConfig().public.openaiKey });\n</script>\n<template><div /></template>\n`,
    },
    {
      name: "Anthropic SDK and its sub-path",
      code: `import Anthropic from "@anthropic-ai/sdk";\nimport { toFile } from "@anthropic-ai/sdk/uploads";\n`,
      count: 2,
    },
    {
      name: "Google generative AI SDKs",
      code: `import { GoogleGenerativeAI } from "@google/generative-ai";\nimport { GoogleGenAI } from "@google/genai";\n`,
      count: 2,
    },
    {
      name: "@ai-sdk provider packages",
      code: `import { openai } from "@ai-sdk/openai";\nimport { createAnthropic } from "@ai-sdk/anthropic";\nimport { google } from "@ai-sdk/google";\n`,
      count: 3,
    },
    {
      name: "Groq, Mistral and Cohere SDKs",
      code: `import Groq from "groq-sdk";\nimport { Mistral } from "@mistralai/mistralai";\nimport { CohereClient } from "cohere-ai";\n`,
      count: 3,
    },
    {
      name: "a value import next to type specifiers",
      code: `import OpenAI, { type ClientOptions } from "openai";\nexport const options: ClientOptions = {};\n`,
    },
    {
      name: "side-effect, dynamic, require and re-export forms",
      code: `import "openai/shims/web";\nexport const load = () => import("@anthropic-ai/sdk");\nconst legacy = require("groq-sdk");\nexport { default as OpenAI } from "openai";\n`,
      count: 4,
    },
    {
      name: "dangerouslyAllowBrowser: true",
      filename: "src/utils/client.ts",
      code: `export const options = { apiKey: "x", dangerouslyAllowBrowser: true };\n`,
    },
    {
      name: "SDK import together with dangerouslyAllowBrowser reports both",
      code: `import OpenAI from "openai";\nexport const client = new OpenAI({ apiKey: import.meta.env.VITE_KEY, dangerouslyAllowBrowser: true });\n`,
      count: 2,
    },
    {
      name: "fetch and $fetch to provider API hosts",
      code: `export const a = fetch("https://api.openai.com/v1/chat/completions", { method: "POST" });\nexport const b = $fetch("https://api.anthropic.com/v1/messages", { method: "POST" });\nexport const c = fetch(\`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent\`);\n`,
      count: 3,
    },
    {
      name: "axios and ky calls, including create({ baseURL })",
      code: `export const a = axios.post("https://api.groq.com/openai/v1/chat/completions", {});\nexport const b = axios({ method: "post", url: "https://api.mistral.ai/v1/chat/completions" });\nexport const c = axios.create({ baseURL: "https://api.openai.com/v1" });\nexport const d = ky.post("https://api.cohere.com/v2/chat");\n`,
      count: 4,
    },
    {
      name: "URL held in a constant, concatenated, or passed to window.fetch / Request",
      code: `const ENDPOINT = "https://api.openai.com/v1/responses";\nexport const a = fetch(ENDPOINT);\nexport const b = window.fetch("https://api.anthropic.com" + "/v1/messages");\nexport const c = new Request("https://api.deepseek.com/chat/completions");\nexport const d = useFetch("https://openrouter.ai/api/v1/chat/completions");\n`,
      count: 4,
    },
  ],
};

export default cases;
