import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "form reset on open (OperatorUserAssignModal.vue)",
      code: `watch(() => props.open, (open) => {\n  if (!open) return;\n  email.value = "";\n  role.value = "member";\n  error.value = null;\n});\n`,
    },
    {
      name: "many mutations in one watchEffect, nothing watches them",
      code: `watchEffect(() => {\n  a.value = x.value;\n  b.value = y.value;\n  c.value = z.value;\n});\n`,
    },
    {
      name: "callback passed by reference",
      code: `watch(id, handleChange);\nwatch(page, handlePage);\n`,
    },
    {
      name: "second watcher only fetches (page reset, then load)",
      code: `watch(filters, () => {\n  page.value = 1;\n}, { deep: true });\nwatch(page, () => {\n  loading.value = true;\n  load(page.value);\n});\n`,
    },
    {
      name: "second watcher assigns an awaited result",
      code: `watch(query, () => {\n  page.value = 1;\n});\nwatch(page, async (p) => {\n  rows.value = await fetchPage(p);\n});\n`,
    },
    {
      name: "watchers on different properties of the same object",
      code: `watch(() => form.email, () => {\n  form.name = "";\n});\nwatch(() => form.phone, (phone) => {\n  digits.value = phone.length;\n});\n`,
    },
    {
      name: "second watcher prunes its own selection (OperatorUserAssignModal.vue)",
      code: `watch(() => props.organizations, (orgs) => {\n  if (!primaryId.value && orgs[0]) primaryId.value = orgs[0].id;\n}, { immediate: true });\nwatch(() => primaryId.value, (id) => {\n  extraIds.value = extraIds.value.filter((extra) => extra !== id);\n});\n`,
    },
  ],
  invalid: [
    {
      name: "watcher derives a ref that a second watcher derives from again",
      code: `watch(price, (next) => {\n  total.value = next * quantity.value;\n});\nwatch(total, (next) => {\n  label.value = formatMoney(next);\n});\n`,
    },
    {
      name: "watchEffect fed by a watcher",
      code: `watch(user, (next) => {\n  name.value = next.firstName;\n});\nwatchEffect(() => {\n  greeting.value = "Hello " + name.value;\n});\n`,
    },
    {
      name: "two watchers mirroring each other (advert-cards-example.vue)",
      code: `const real = reactive({ orientation: "vertical" });\nconst skel = reactive({ orientation: "vertical" });\nwatch(() => ({ ...real }), (v) => {\n  if (sync.value) skel.orientation = v.orientation;\n}, { deep: true });\nwatch(() => ({ ...skel }), (v) => {\n  if (sync.value) real.orientation = v.orientation;\n}, { deep: true });\n`,
      count: 2,
    },
    {
      name: "deep watch on a reactive object written by another watcher",
      code: `watch(locale, () => {\n  settings.currency = "EUR";\n});\nwatch(settings, () => {\n  summary.value = describe(settings);\n}, { deep: true });\n`,
    },
  ],
};

export default cases;
