import type { RuleCases } from "../../rule-cases.js";
import { FAKE_PROVIDER_SECRETS, fakeBody, fakeJwt } from "../../secrets/fake-secrets.js";

// Credentials are assembled at run time (see secrets/fake-secrets.ts): the repository never holds a
// literal key, yet each value matches its provider's real format.
const secretFor = (label: string): string => {
  const found = FAKE_PROVIDER_SECRETS.find(([name]) => name === label);
  if (!found) throw new Error(`unknown fake secret: ${label}`);
  return found[1];
};

const stripeLive = secretFor("Stripe live key");

const cases: RuleCases = {
  valid: [
    {
      name: "Stripe publishable key is public by design",
      code: `export const stripeKey = "${"pk" + "_live_" + fakeBody(24, 31)}";\n`,
    },
    {
      name: "Stripe test key is harmless",
      code: `export const stripeKey = "${"sk" + "_test_" + fakeBody(24, 32)}";\n`,
    },
    {
      name: "Supabase anon key is public by design",
      code: `export const supabaseKey = "${fakeJwt({ iss: "supabase", role: "anon", exp: 1983812996 }, 33)}";\n`,
    },
    {
      name: "AWS documentation sample key",
      code: `export const aws = "AKIAIOSFODNN7EXAMPLE";\n`,
    },
    {
      name: "placeholder with the provider prefix",
      code: `export const hint = "Paste your key: sk-proj-your-api-key-here";\n`,
    },
    {
      name: "secret read from the environment",
      code: `export const apiKey = import.meta.env.VITE_PUBLIC_KEY;\nexport const other = process.env.OPENAI_API_KEY;\n`,
    },
    {
      name: "public key block is not a private key",
      code: `export const pem = "-----BEGIN PUBLIC KEY-----";\n`,
    },
    {
      name: "server code is reported by no-secret-named-literal instead",
      filename: "server/api/charge.post.ts",
      code: `export const stripe = "${stripeLive}";\n`,
    },
    {
      name: "build config is server-side",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ runtimeConfig: { stripeKey: "${stripeLive}" } });\n`,
    },
  ],
  invalid: [
    { name: "OpenAI project key", code: `export const key = "${secretFor("OpenAI project key")}";\n` },
    { name: "OpenAI legacy key", code: `export const key = "${secretFor("OpenAI legacy key")}";\n` },
    { name: "Anthropic key as an object property", code: `export const config = { apiKey: "${secretFor("Anthropic key")}" };\n` },
    { name: "Google API key", code: `export const mapsKey = "${secretFor("Google API key")}";\n` },
    { name: "GitHub personal access token", code: `export const token = "${secretFor("GitHub token")}";\n` },
    { name: "GitHub fine-grained token", code: `export const token = "${secretFor("GitHub fine-grained token")}";\n` },
    { name: "Slack token", code: `export const slack = "${secretFor("Slack token")}";\n` },
    { name: "Stripe live secret key", code: `export const stripe = "${stripeLive}";\n` },
    {
      name: "Stripe restricted live key",
      code: `export const stripe = "${"rk" + "_live_" + fakeBody(24, 34)}";\n`,
    },
    { name: "Supabase service_role JWT", code: `export const supabase = "${secretFor("Supabase service_role key")}";\n` },
    { name: "AWS access key ID", code: `export const accessKeyId = "${secretFor("AWS access key ID")}";\n` },
    {
      name: "PEM private key block in a template literal",
      code: `export const pem = \`${secretFor("private key")}\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END RSA PRIVATE KEY-----\`;\n`,
    },
    {
      name: "key in an assignment to a member",
      code: `const client = {};\nclient.headers = {};\nclient.apiKey = "${secretFor("OpenAI project key")}";\n`,
    },
    {
      name: "key as a default parameter",
      code: `export const connect = (token = "${secretFor("GitHub token")}") => token;\n`,
    },
    {
      name: "key inside a header string",
      code: `export const headers = { Authorization: \`Bearer ${secretFor("OpenAI legacy key")}\` };\n`,
    },
    {
      name: "key passed as a call argument",
      code: `initSdk("${secretFor("Google API key")}");\n`,
    },
    {
      name: "key in a Vue SFC script",
      filename: "src/App.vue",
      code: `<script setup lang="ts">\nconst key = "${secretFor("GitHub token")}";\n</script>\n<template><div>{{ key }}</div></template>\n`,
    },
    {
      name: "two keys in one file",
      count: 2,
      code: `export const a = "${secretFor("Anthropic key")}";\nexport const b = "${secretFor("Google API key")}";\n`,
    },
  ],
};

export default cases;
