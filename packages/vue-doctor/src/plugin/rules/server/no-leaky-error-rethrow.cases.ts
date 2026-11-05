import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "handler without try/catch relies on Nitro's error handling",
      filename: "server/api/plans/[id].get.ts",
      code: `export default defineEventHandler(async (event) => {
  const row = await getPlan(getRouterParam(event, "id"));
  if (!row) throw createError({ statusCode: 404 });
  return row;
});
`,
    },
    {
      name: "logged error with a fixed message",
      filename: "server/api/admin/users/index.get.ts",
      code: `export default defineEventHandler(async () => {
  try {
    return await listUsers();
  } catch (error) {
    console.error("[AdminUsers] list failed", error);
    throw createError({ statusCode: 500, statusMessage: "Could not load users" });
  }
});
`,
    },
    {
      name: "HTTP errors rethrown with isError before wrapping",
      filename: "server/api/admin/premium/index.post.ts",
      code: `export default defineEventHandler(async (event) => {
  try {
    await ensureAdmin(event);
    return await createPlan(await readBody(event));
  } catch (error) {
    throw isError(error) ? error : createError({ statusCode: 500, statusMessage: "Could not create the plan" });
  }
});
`,
    },
    {
      name: "status passed through from the caught error",
      filename: "server/api/geocode.get.ts",
      code: `export default defineEventHandler(async (event) => {
  try {
    const query = await getValidatedQuery(event, QuerySchema.parse);
    return await geocode(query);
  } catch (error: any) {
    if (error.statusCode) throw error;
    throw createError({ statusCode: 500, statusMessage: "Geocoding failed" });
  }
});
`,
    },
    {
      name: "500 wrap of a try block that throws no HTTP error",
      filename: "server/api/stats.get.ts",
      code: `export default defineEventHandler(async () => {
  try {
    return await loadStats();
  } catch (error) {
    console.error("[Stats]", error);
    throw createError({ statusCode: 500, statusMessage: "Stats unavailable" });
  }
});
`,
    },
    {
      name: "500 wrap of a try block whose own createError is a 500 too",
      filename: "server/api/cron/seo-digest.get.ts",
      code: `export default defineEventHandler(async () => {
  try {
    const { data, error: contentError } = await loadContent();
    if (contentError) throw createError({ statusCode: 500, statusMessage: "Internal Server Error" });
    return await sendDigest(data);
  } catch (error) {
    console.error("[SEO Digest Cron] Unexpected error:", error);
    throw createError({ statusCode: 500, statusMessage: "Internal Server Error" });
  }
});
`,
    },
    {
      name: "message from the request, not from an error",
      filename: "server/api/forms.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const parsed = FormSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid form" });
  return save(parsed.data);
});
`,
    },
    {
      name: "client code is out of scope",
      filename: "app/composables/useSave.ts",
      code: `export const save = async () => {
  try {
    await $fetch("/api/save");
  } catch (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
};
`,
    },
  ],
  invalid: [
    {
      name: "caught error message sent as statusMessage",
      filename: "server/api/admin/premium/[id].delete.ts",
      code: `export default defineEventHandler(async (event) => {
  try {
    return await deletePlan(getRouterParam(event, "id"));
  } catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
});
`,
    },
    {
      name: "Supabase result error message sent to the client",
      filename: "server/api/user/saved-searches/index.get.ts",
      code: `export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event);
  const { data, error } = await client.from("saved_searches").select("*");
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  return data;
});
`,
    },
    {
      name: "renamed result error with a fallback message",
      filename: "server/api/admin/financials/stats.get.ts",
      code: `export default defineEventHandler(async () => {
  const { data, error: stripeError } = await loadStripeStats();
  if (stripeError) throw createError({ statusCode: 502, message: stripeError.message || "Stripe failed" });
  return data;
});
`,
    },
    {
      name: "caught error interpolated into the message",
      filename: "server/utils/mailer.ts",
      code: `export const sendMail = async (to: string) => {
  try {
    await resend.emails.send({ to });
  } catch (err) {
    throw createError({ statusCode: 500, statusMessage: \`Mail failed: \${err}\` });
  }
};
`,
    },
    {
      name: "500 wrap swallows the 4xx thrown in the try block",
      filename: "server/api/admin/tco/[id].put.ts",
      code: `export default defineEventHandler(async (event) => {
  try {
    await ensureAdmin(event);
    const id = getRouterParam(event, "id");
    if (!id) throw createError({ statusCode: 400, statusMessage: "Missing id" });
    return await updateTco(id, await readBody(event));
  } catch (error) {
    console.error("[TCO] update failed", error);
    throw createError({ statusCode: 500, statusMessage: "Could not update" });
  }
});
`,
    },
    {
      name: "both leaks the message and swallows 4xx",
      filename: "server/api/admin/content/[id].put.ts",
      code: `export default defineEventHandler(async (event) => {
  try {
    const body = await readValidatedBody(event, ContentSchema.parse);
    return await saveContent(body);
  } catch (e: any) {
    throw createError({ statusCode: 500, statusMessage: e.message });
  }
});
`,
    },
  ],
};

export default cases;
