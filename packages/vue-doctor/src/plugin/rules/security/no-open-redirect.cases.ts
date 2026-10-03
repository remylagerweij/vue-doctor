import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "relative path redirect with leading slash",
      filename: "server/api/redirect.ts",
      code: `export default defineEventHandler((event) => {
  const query = getQuery(event);
  const target = String(query.next || "/");
  if (target.startsWith("/") && !target.startsWith("//")) {
    return sendRedirect(event, target);
  }
  return sendRedirect(event, "/");
});
`,
    },
    {
      name: "navigateTo without external option",
      filename: "app.vue",
      code: `export const go = (next) => {
  navigateTo(next);
};
`,
    },
    {
      name: "fixed URL redirect",
      filename: "server/api/login.ts",
      code: `export default defineEventHandler((event) => {
  return sendRedirect(event, "/dashboard");
});
`,
    },
    {
      name: "parsed URL with checked origin",
      filename: "server/api/auth.ts",
      code: `export default defineEventHandler((event) => {
  const { redirect: target } = getQuery(event);
  const url = new URL(String(target), "https://example.com");
  if (url.origin === "https://example.com") {
    return sendRedirect(event, url.toString());
  }
  return sendRedirect(event, "/");
});
`,
    },
    {
      name: "redirect with external: false",
      filename: "pages/login.vue",
      code: `<script setup>
export const go = (target) => {
  navigateTo(target, { external: false });
};
</script>
`,
    },
  ],
  invalid: [
    {
      name: "sendRedirect directly with getQuery value",
      filename: "server/api/redirect.ts",
      code: `export default defineEventHandler((event) => {
  const query = getQuery(event);
  return sendRedirect(event, query.next);
});
`,
    },
    {
      name: "navigateTo external with route query",
      filename: "pages/login.vue",
      code: `<script>
export default {
  methods: {
    done() {
      const next = this.$route.query.next;
      navigateTo(next, { external: true });
    }
  }
};
</script>
`,
    },
    {
      name: "Location header set with untrusted body value",
      filename: "server/api/submit.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  setResponseHeader(event, "Location", body.returnUrl);
});
`,
    },
    {
      name: "Response.redirect with query param",
      filename: "server/routes/go.ts",
      code: `export default defineEventHandler((event) => {
  const next = getRouterParam(event, "target");
  return Response.redirect(next);
});
`,
    },
  ],
};

export default cases;
