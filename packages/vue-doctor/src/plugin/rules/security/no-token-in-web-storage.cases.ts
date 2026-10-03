import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "non-credential preferences in localStorage",
      code: `export const save = (theme, locale) => {\n  localStorage.setItem("theme", theme);\n  sessionStorage.setItem("locale", locale);\n};\n`,
    },
    {
      name: "words that only contain token or auth",
      code: `export const save = (tokenizerName, authenticated, author) => {\n  localStorage.setItem("tokenizer", tokenizerName);\n  localStorage.setItem("authenticated", authenticated);\n  localStorage.setItem("author", author);\n};\n`,
    },
    {
      name: "CSRF and design tokens",
      code: `export const save = (csrfToken, designTokens) => {\n  localStorage.setItem("csrfToken", csrfToken);\n  localStorage.setItem("design-tokens", designTokens);\n};\n`,
    },
    {
      name: "fixed flag value under an auth-like key",
      code: `export const mark = () => { localStorage.setItem("auth-banner-dismissed", "true"); };\n`,
    },
    {
      name: "token kept in memory",
      code: `import { ref } from "vue";\nexport const token = ref("");\nexport const setToken = (value) => { token.value = value; };\n`,
    },
    {
      name: "Pinia persist limited to non-credential state",
      code: `import { defineStore } from "pinia";\nexport const useAuthStore = defineStore("auth", {\n  state: () => ({ token: null, theme: "dark" }),\n  persist: { pick: ["theme"] },\n});\n`,
    },
    {
      name: "Pinia persist to cookies",
      code: `import { defineStore } from "pinia";\nexport const useAuthStore = defineStore("auth", {\n  state: () => ({ token: null }),\n  persist: { storage: piniaPluginPersistedstate.cookies() },\n});\n`,
    },
  ],
  invalid: [
    {
      name: "setItem with a token key",
      code: `export const save = (token) => { localStorage.setItem("token", token); };\n`,
    },
    {
      name: "sessionStorage with an accessToken key",
      code: `export const save = (res) => { sessionStorage.setItem("accessToken", res.data.accessToken); };\n`,
    },
    {
      name: "refresh token under a key constant",
      code: `const REFRESH_TOKEN_KEY = "rt";\nexport const save = (refresh) => { window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh); };\n`,
    },
    {
      name: "credential value under a harmless key",
      code: `export const save = (res) => { localStorage.setItem("user", JSON.stringify({ name: res.name, jwt: res.jwt })); };\n`,
    },
    {
      name: "property assignment on localStorage",
      code: `export const save = (value) => { localStorage.authToken = value; localStorage["session-id"] = value; };\n`,
      count: 2,
    },
    {
      name: "VueUse useLocalStorage with a token key",
      code: `import { useLocalStorage } from "@vueuse/core";\nexport const token = useLocalStorage("auth_token", "");\n`,
    },
    {
      name: "VueUse useStorage defaulting to localStorage",
      code: `import { useStorage } from "@vueuse/core";\nexport const jwt = useStorage("jwt", null);\n`,
    },
    {
      name: "Pinia persist of an auth store",
      code: `import { defineStore } from "pinia";\nexport const useAuthStore = defineStore("auth", {\n  state: () => ({ token: null, user: null }),\n  persist: true,\n});\n`,
    },
    {
      name: "Pinia persist picking the token",
      code: `import { defineStore } from "pinia";\nimport { ref } from "vue";\nexport const useUserStore = defineStore(\n  "user",\n  () => {\n    const name = ref("");\n    const accessToken = ref("");\n    return { name, accessToken };\n  },\n  { persist: { storage: localStorage, pick: ["accessToken"] } },\n);\n`,
    },
  ],
};

export default cases;
