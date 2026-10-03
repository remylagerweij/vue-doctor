import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";

// JSON Schemas generated from the package source, published under /schema/.
const SCHEMA_FILENAMES = ["vue-doctor.schema.json", "report.schema.json"];
const SCHEMA_DIRECTORY = fileURLToPath(new URL("../../packages/vue-doctor/schema/", import.meta.url));

// GitHub Pages project site: https://remylagerweij.github.io/vue-doctor/
// Set DOCS_BASE=/ (or any prefix) when serving from a custom domain.
const normalizeBase = (value: string): string => {
  const trimmed = value.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "/" : `/${trimmed}/`;
};
const base = normalizeBase(process.env.DOCS_BASE ?? "/vue-doctor/");

export default defineConfig({
  title: "Vue Doctor",
  description: "Diagnose performance, security and correctness issues in Vue.js and Nuxt apps.",
  lang: "en-US",
  base,
  cleanUrls: true,
  lastUpdated: true,
  // Internal planning documents live in docs/analysis and must never be published.
  srcExclude: ["analysis/**", "README.md", "rules/table.md"],
  // Publish the config and report JSON Schemas at /schema/<name>.schema.json.
  buildEnd: ({ outDir }) => {
    fs.mkdirSync(path.join(outDir, "schema"), { recursive: true });
    for (const filename of SCHEMA_FILENAMES) {
      fs.copyFileSync(path.join(SCHEMA_DIRECTORY, filename), path.join(outDir, "schema", filename));
    }
  },
  head: [["meta", { name: "theme-color", content: "#42b883" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Rules", link: "/rules/" },
      { text: "Reference", link: "/reference/cli" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "CLI usage", link: "/guide/cli-usage" },
            { text: "Continuous integration", link: "/guide/ci" },
            { text: "Secure fork PRs", link: "/guide/fork-prs" },
            { text: "Baselines & adoption", link: "/guide/baseline" },
            { text: "GitHub code scanning (SARIF)", link: "/guide/code-scanning" },
            { text: "GitHub annotations", link: "/guide/github-annotations" },
            { text: "HTML report", link: "/guide/html-report" },
            { text: "AI coding agents", link: "/guide/agents" },
            { text: "MCP server", link: "/guide/mcp" },
            { text: "Configuration", link: "/guide/configuration" },
            { text: "Scoring formula", link: "/guide/scoring" },
            { text: "Dependency audit", link: "/guide/dependency-audit" },
            { text: "Suppressing findings", link: "/guide/suppressions" },
            { text: "Migrating from v1 to v2", link: "/guide/migration-v2" },
          ],
        },
      ],
      "/rules/": [
  {
    "text": "Overview",
    "link": "/rules/"
  },
  {
    "text": "Reactivity",
    "collapsed": true,
    "items": [
      {
        "text": "no-cascading-mutations",
        "link": "/rules/reactivity/no-cascading-mutations"
      },
      {
        "text": "no-fetch-in-watch",
        "link": "/rules/reactivity/no-fetch-in-watch"
      },
      {
        "text": "no-missing-await-nextTick",
        "link": "/rules/reactivity/no-missing-await-nextTick"
      },
      {
        "text": "no-mutation-in-computed",
        "link": "/rules/reactivity/no-mutation-in-computed"
      },
      {
        "text": "no-reactive-destructure",
        "link": "/rules/reactivity/no-reactive-destructure"
      },
      {
        "text": "no-reactive-replace",
        "link": "/rules/reactivity/no-reactive-replace"
      },
      {
        "text": "no-ref-from-prop",
        "link": "/rules/reactivity/no-ref-from-prop"
      },
      {
        "text": "no-watch-for-computed",
        "link": "/rules/reactivity/no-watch-for-computed"
      },
      {
        "text": "prefer-computed",
        "link": "/rules/reactivity/prefer-computed"
      },
      {
        "text": "vue/no-mutating-props",
        "link": "/rules/reactivity/vue-no-mutating-props"
      },
      {
        "text": "vue/no-computed-properties-in-data",
        "link": "/rules/reactivity/vue-no-computed-properties-in-data"
      },
      {
        "text": "vue/no-side-effects-in-computed-properties",
        "link": "/rules/reactivity/vue-no-side-effects-in-computed-properties"
      },
      {
        "text": "vue/no-async-in-computed-properties",
        "link": "/rules/reactivity/vue-no-async-in-computed-properties"
      },
      {
        "text": "vue/no-ref-as-operand",
        "link": "/rules/reactivity/vue-no-ref-as-operand"
      }
    ]
  },
  {
    "text": "Architecture",
    "collapsed": true,
    "items": [
      {
        "text": "no-giant-component",
        "link": "/rules/architecture/no-giant-component"
      },
      {
        "text": "no-nested-component-definition",
        "link": "/rules/architecture/no-nested-component-definition"
      },
      {
        "text": "vue/component-name-in-template-casing",
        "link": "/rules/architecture/vue-component-name-in-template-casing"
      }
    ]
  },
  {
    "text": "Performance",
    "collapsed": true,
    "items": [
      {
        "text": "async-parallel",
        "link": "/rules/performance/async-parallel"
      },
      {
        "text": "client-passive-event-listeners",
        "link": "/rules/performance/client-passive-event-listeners"
      },
      {
        "text": "js-batch-dom-css",
        "link": "/rules/performance/js-batch-dom-css"
      },
      {
        "text": "js-cache-storage",
        "link": "/rules/performance/js-cache-storage"
      },
      {
        "text": "js-combine-iterations",
        "link": "/rules/performance/js-combine-iterations"
      },
      {
        "text": "js-early-exit",
        "link": "/rules/performance/js-early-exit"
      },
      {
        "text": "js-hoist-regexp",
        "link": "/rules/performance/js-hoist-regexp"
      },
      {
        "text": "js-index-maps",
        "link": "/rules/performance/js-index-maps"
      },
      {
        "text": "js-min-max-loop",
        "link": "/rules/performance/js-min-max-loop"
      },
      {
        "text": "js-set-map-lookups",
        "link": "/rules/performance/js-set-map-lookups"
      },
      {
        "text": "js-tosorted-immutable",
        "link": "/rules/performance/js-tosorted-immutable"
      },
      {
        "text": "no-deep-watch",
        "link": "/rules/performance/no-deep-watch"
      },
      {
        "text": "no-global-css-variable-animation",
        "link": "/rules/performance/no-global-css-variable-animation"
      },
      {
        "text": "no-large-animated-blur",
        "link": "/rules/performance/no-large-animated-blur"
      },
      {
        "text": "no-layout-property-animation",
        "link": "/rules/performance/no-layout-property-animation"
      },
      {
        "text": "no-permanent-will-change",
        "link": "/rules/performance/no-permanent-will-change"
      },
      {
        "text": "no-scale-from-zero",
        "link": "/rules/performance/no-scale-from-zero"
      },
      {
        "text": "no-transition-all",
        "link": "/rules/performance/no-transition-all"
      },
      {
        "text": "vue/no-use-v-if-with-v-for",
        "link": "/rules/performance/vue-no-use-v-if-with-v-for"
      }
    ]
  },
  {
    "text": "Security",
    "collapsed": true,
    "items": [
      {
        "text": "llm-prompt-injection",
        "link": "/rules/security/llm-prompt-injection"
      },
      {
        "text": "no-dynamic-code",
        "link": "/rules/security/no-dynamic-code"
      },
      {
        "text": "no-eval",
        "link": "/rules/security/no-eval"
      },
      {
        "text": "no-hardcoded-secret",
        "link": "/rules/security/no-hardcoded-secret"
      },
      {
        "text": "no-injection",
        "link": "/rules/security/no-injection"
      },
      {
        "text": "no-javascript-url",
        "link": "/rules/security/no-javascript-url"
      },
      {
        "text": "no-llm-sdk-in-client",
        "link": "/rules/security/no-llm-sdk-in-client"
      },
      {
        "text": "no-open-redirect",
        "link": "/rules/security/no-open-redirect"
      },
      {
        "text": "no-prototype-pollution",
        "link": "/rules/security/no-prototype-pollution"
      },
      {
        "text": "no-secret-in-public-env",
        "link": "/rules/security/no-secret-in-public-env"
      },
      {
        "text": "no-secret-named-literal",
        "link": "/rules/security/no-secret-named-literal"
      },
      {
        "text": "no-ssrf",
        "link": "/rules/security/no-ssrf"
      },
      {
        "text": "no-token-in-web-storage",
        "link": "/rules/security/no-token-in-web-storage"
      },
      {
        "text": "no-unsafe-html-sink",
        "link": "/rules/security/no-unsafe-html-sink"
      },
      {
        "text": "no-user-controlled-url",
        "link": "/rules/security/no-user-controlled-url"
      },
      {
        "text": "postmessage-origin-check",
        "link": "/rules/security/postmessage-origin-check"
      },
      {
        "text": "no-committed-env",
        "link": "/rules/security/no-committed-env"
      },
      {
        "text": "no-secret-in-public-env-file",
        "link": "/rules/security/no-secret-in-public-env-file"
      },
      {
        "text": "vue/no-template-target-blank",
        "link": "/rules/security/vue-no-template-target-blank"
      }
    ]
  },
  {
    "text": "Supply Chain",
    "collapsed": true,
    "items": [
      {
        "text": "lockfile-integrity",
        "link": "/rules/supply-chain/lockfile-integrity"
      },
      {
        "text": "no-dependency-install-scripts",
        "link": "/rules/supply-chain/no-dependency-install-scripts"
      },
      {
        "text": "no-remote-dependency-spec",
        "link": "/rules/supply-chain/no-remote-dependency-spec"
      },
      {
        "text": "vulnerable-dependency",
        "link": "/rules/supply-chain/vulnerable-dependency"
      }
    ]
  },
  {
    "text": "Bundle Size",
    "collapsed": true,
    "items": [
      {
        "text": "no-barrel-import",
        "link": "/rules/bundle-size/no-barrel-import"
      },
      {
        "text": "no-full-lodash-import",
        "link": "/rules/bundle-size/no-full-lodash-import"
      },
      {
        "text": "no-moment",
        "link": "/rules/bundle-size/no-moment"
      },
      {
        "text": "no-undeferred-third-party",
        "link": "/rules/bundle-size/no-undeferred-third-party"
      },
      {
        "text": "prefer-dynamic-import",
        "link": "/rules/bundle-size/prefer-dynamic-import"
      }
    ]
  },
  {
    "text": "Correctness",
    "collapsed": true,
    "items": [
      {
        "text": "no-array-index-as-key",
        "link": "/rules/correctness/no-array-index-as-key"
      },
      {
        "text": "no-async-setup-without-suspense",
        "link": "/rules/correctness/no-async-setup-without-suspense"
      },
      {
        "text": "no-direct-dom-manipulation",
        "link": "/rules/correctness/no-direct-dom-manipulation"
      },
      {
        "text": "no-prevent-default",
        "link": "/rules/correctness/no-prevent-default"
      },
      {
        "text": "no-this-in-setup",
        "link": "/rules/correctness/no-this-in-setup"
      },
      {
        "text": "prefer-defineProps-destructure",
        "link": "/rules/correctness/prefer-defineProps-destructure"
      },
      {
        "text": "require-defineprops-types",
        "link": "/rules/correctness/require-defineprops-types"
      },
      {
        "text": "require-emits-declaration",
        "link": "/rules/correctness/require-emits-declaration"
      },
      {
        "text": "vue/require-v-for-key",
        "link": "/rules/correctness/vue-require-v-for-key"
      },
      {
        "text": "vue/no-template-shadow",
        "link": "/rules/correctness/vue-no-template-shadow"
      },
      {
        "text": "vue/valid-v-slot",
        "link": "/rules/correctness/vue-valid-v-slot"
      },
      {
        "text": "vue/require-explicit-emits",
        "link": "/rules/correctness/vue-require-explicit-emits"
      },
      {
        "text": "vue/return-in-computed-property",
        "link": "/rules/correctness/vue-return-in-computed-property"
      },
      {
        "text": "vue/valid-v-bind",
        "link": "/rules/correctness/vue-valid-v-bind"
      },
      {
        "text": "vue/valid-v-on",
        "link": "/rules/correctness/vue-valid-v-on"
      },
      {
        "text": "vue/valid-v-model",
        "link": "/rules/correctness/vue-valid-v-model"
      },
      {
        "text": "vue/no-dupe-keys",
        "link": "/rules/correctness/vue-no-dupe-keys"
      },
      {
        "text": "vue/no-duplicate-attributes",
        "link": "/rules/correctness/vue-no-duplicate-attributes"
      }
    ]
  },
  {
    "text": "Ecosystem",
    "collapsed": true,
    "items": [
      {
        "text": "pinia-no-destructure",
        "link": "/rules/ecosystem/pinia-no-destructure"
      },
      {
        "text": "pinia-no-watch-store",
        "link": "/rules/ecosystem/pinia-no-watch-store"
      },
      {
        "text": "router-no-async-guard-without-next",
        "link": "/rules/ecosystem/router-no-async-guard-without-next"
      },
      {
        "text": "router-no-string-push",
        "link": "/rules/ecosystem/router-no-string-push"
      }
    ]
  },
  {
    "text": "Nuxt",
    "collapsed": true,
    "items": [
      {
        "text": "no-secret-in-public-runtime-config",
        "link": "/rules/nuxt/no-secret-in-public-runtime-config"
      },
      {
        "text": "nuxt-async-client-component",
        "link": "/rules/nuxt/nuxt-async-client-component"
      },
      {
        "text": "nuxt-no-a-element",
        "link": "/rules/nuxt/nuxt-no-a-element"
      },
      {
        "text": "nuxt-no-client-fetch-for-server-data",
        "link": "/rules/nuxt/nuxt-no-client-fetch-for-server-data"
      },
      {
        "text": "nuxt-no-head-import",
        "link": "/rules/nuxt/nuxt-no-head-import"
      },
      {
        "text": "nuxt-no-img-element",
        "link": "/rules/nuxt/nuxt-no-img-element"
      },
      {
        "text": "nuxt-no-process-env-in-client",
        "link": "/rules/nuxt/nuxt-no-process-env-in-client"
      },
      {
        "text": "nuxt-no-window-in-ssr",
        "link": "/rules/nuxt/nuxt-no-window-in-ssr"
      },
      {
        "text": "nuxt-require-seo-meta",
        "link": "/rules/nuxt/nuxt-require-seo-meta"
      },
      {
        "text": "nuxt-require-server-route-error-handling",
        "link": "/rules/nuxt/nuxt-require-server-route-error-handling"
      },
      {
        "text": "security-headers",
        "link": "/rules/nuxt/security-headers"
      },
      {
        "text": "no-sensitive-public-file",
        "link": "/rules/nuxt/no-sensitive-public-file"
      }
    ]
  },
  {
    "text": "Server",
    "collapsed": true,
    "items": [
      {
        "text": "auth-missing",
        "link": "/rules/server/auth-missing"
      },
      {
        "text": "csrf-on-mutating-routes",
        "link": "/rules/server/csrf-on-mutating-routes"
      },
      {
        "text": "require-input-validation",
        "link": "/rules/server/require-input-validation"
      },
      {
        "text": "secure-cookie-flags",
        "link": "/rules/server/secure-cookie-flags"
      },
      {
        "text": "server-no-console-in-handler",
        "link": "/rules/server/server-no-console-in-handler"
      }
    ]
  },
  {
    "text": "Dead Code",
    "collapsed": true,
    "items": [
      {
        "text": "vue/no-unused-vars",
        "link": "/rules/dead-code/vue-no-unused-vars"
      }
    ]
  }
],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "CLI", link: "/reference/cli" },
            { text: "Configuration", link: "/reference/config" },
            { text: "Report format", link: "/reference/report" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/remylagerweij/vue-doctor" }],
    editLink: {
      pattern: "https://github.com/remylagerweij/vue-doctor/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    search: { provider: "local" },
    footer: { message: "Released under the MIT License." },
  },
});
