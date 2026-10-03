import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "fixed system prompt with max_tokens set",
      filename: "server/api/chat.ts",
      code: `export default defineEventHandler(async (event) => {
  const { message } = await readBody(event);
  return openai.chat.completions.create({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: message },
    ],
    max_tokens: 500,
  });
});
`,
    },
    {
      name: "streamText with fixed system prompt and maxTokens",
      filename: "server/api/generate.ts",
      code: `export const generate = (prompt) => {
  return streamText({
    system: "You are a code formatter.",
    prompt,
    maxTokens: 1000,
  });
};
`,
    },
    {
      name: "ordinary function named create without LLM fields",
      filename: "src/utils/factory.ts",
      code: `export const make = (data) => {
  return create({ name: data.name });
};
`,
    },
    {
      name: "messages array without interpolated system prompt",
      filename: "server/api/ask.ts",
      code: `export const ask = (query) => {
  return generateText({
    prompt: query,
    max_tokens: 150,
  });
};
`,
    },
  ],
  invalid: [
    {
      name: "system prompt interpolating request input",
      filename: "server/api/agent.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return openai.chat.completions.create({
    messages: [
      { role: "system", content: \`You are an assistant. User instructions: \${body.instruction}\` },
    ],
    max_tokens: 300,
  });
});
`,
    },
    {
      name: "system option with interpolated input",
      filename: "server/api/summarize.ts",
      code: `export default defineEventHandler(async (event) => {
  const { context } = await readBody(event);
  return streamText({
    system: "Context: " + context,
    prompt: "Summarize this",
    maxTokens: 200,
  });
});
`,
    },
    {
      name: "LLM create call without max_tokens",
      filename: "server/api/chat.ts",
      code: `export const chat = (userMsg) => {
  return openai.chat.completions.create({
    messages: [{ role: "user", content: userMsg }],
  });
};
`,
    },
    {
      name: "generateText without max_tokens",
      filename: "server/api/complete.ts",
      code: `export const complete = (prompt) => {
  return generateText({
    prompt,
  });
};
`,
    },
  ],
};

export default cases;
