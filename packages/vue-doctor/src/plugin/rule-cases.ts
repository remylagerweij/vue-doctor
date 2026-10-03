/**
 * Test cases that live next to a rule as `<rule-id>.cases.ts` (default export). They are plain data
 * so the same cases can be run through the real engine (see tests/rules/rule-cases.test.ts);
 * the files are not imported by the plugin bundle.
 */
export interface RuleCase {
  /** Short description of what the case demonstrates; shown in the test name. */
  name: string;
  /** Complete file content. For `.vue` files include the `<script>` block. */
  code: string;
  /**
   * Path of the linted file, relative to the project root. Several rules depend on it
   * (`.vue`, `server/`, `.client.vue`, test files). Defaults to `src/example.ts`.
   */
  filename?: string;
}

export interface InvalidRuleCase extends RuleCase {
  /** How many findings of this rule the code produces. Defaults to 1. */
  count?: number;
}

export interface RuleCases {
  /** Realistic near-misses that must not be reported. */
  valid: RuleCase[];
  /** Code the rule must report. */
  invalid: InvalidRuleCase[];
  /**
   * Cases for the rule's template counterpart (a custom ESLint template rule that shares this
   * rule's ID, run on `.vue` files by the template analyzer). Snippets are complete `.vue` files.
   */
  template?: {
    valid: RuleCase[];
    invalid: InvalidRuleCase[];
  };
}
