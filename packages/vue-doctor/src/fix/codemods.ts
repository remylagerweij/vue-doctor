export interface CodemodResult {
  code: string;
  fixed: boolean;
  ruleId: string;
}

/**
 * Codemod 1: Lodash per-method imports.
 * Transforms `import { debounce, throttle } from "lodash"` into per-method imports.
 */
export const fixLodashImports = (source: string): CodemodResult => {
  const pattern = /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']lodash["'];?/g;
  let fixed = false;

  const code = source.replace(pattern, (_match, specifiers: string) => {
    fixed = true;
    const methods = specifiers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return methods
      .map((m) => {
        // Handle alias: foo as bar
        const parts = m.split(/\s+as\s+/);
        if (parts.length === 2) {
          return `import ${parts[1].trim()} from "lodash/${parts[0].trim()}.js";`;
        }
        return `import ${m} from "lodash/${m}.js";`;
      })
      .join("\n");
  });

  return { code, fixed, ruleId: "vue-doctor/bundle-size/no-lodash" };
};

/**
 * Codemod 2: Prevent in-place array mutation in computed/rendering by using toSorted() or clone sort.
 * Transforms `.sort((a, b) => ...)` to `.toSorted((a, b) => ...)` when called on identifiers/expressions.
 */
export const fixArraySortMutation = (source: string): CodemodResult => {
  // Replace array.sort(fn) with array.toSorted(fn)
  // Matches `.sort(` preceded by an identifier or property access, avoiding duplicate `.toSorted`
  const pattern = /(?<=[a-zA-Z0-9_$\])])\.sort\s*\(/g;
  let fixed = false;

  const code = source.replace(pattern, () => {
    fixed = true;
    return ".toSorted(";
  });

  return { code, fixed, ruleId: "vue-doctor/reactivity/no-mutation-in-computed" };
};

/**
 * Codemod 3: Add rel="noopener noreferrer" to links with target="_blank".
 */
export const fixTargetBlankRel = (source: string): CodemodResult => {
  let fixed = false;

  // Pattern matches <a ...> tags that have target="_blank"
  const aTagPattern = /<a\b([^>]*)>/gi;

  const code = source.replace(aTagPattern, (fullTag, attrs: string) => {
    if (!/target\s*=\s*["']_blank["']/i.test(attrs)) {
      return fullTag;
    }

    // Has target="_blank". Check if rel exists
    const relMatch = /rel\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (!relMatch) {
      fixed = true;
      return `<a${attrs} rel="noopener noreferrer">`;
    }

    const relValue = relMatch[1];
    const tokens = new Set(relValue.toLowerCase().split(/\s+/));
    let modified = false;

    if (!tokens.has("noopener")) {
      tokens.add("noopener");
      modified = true;
    }
    if (!tokens.has("noreferrer")) {
      tokens.add("noreferrer");
      modified = true;
    }

    if (modified) {
      fixed = true;
      const newRel = `rel="${Array.from(tokens).join(" ")}"`;
      const newAttrs = attrs.replace(relMatch[0], newRel);
      return `<a${newAttrs}>`;
    }

    return fullTag;
  });

  return { code, fixed, ruleId: "vue-doctor/security/target-blank-rel" };
};

/**
 * Codemod 4: Add missing :key to v-for tags.
 */
export const fixVForKey = (source: string): CodemodResult => {
  let fixed = false;

  // Matches tags with v-for="item in items" without a :key attribute
  const vForPattern = /<([a-zA-Z0-9_-]+)\b([^>]*\bv-for\s*=\s*["']([^"']+)["'][^>]*)>/gi;

  const code = source.replace(vForPattern, (fullTag, tagName: string, attrs: string, vForExpr: string) => {
    // Check if :key or v-bind:key or key is present
    if (/(?:^|\s)(?::key|v-bind:key|key)\s*=/i.test(attrs)) {
      return fullTag;
    }

    fixed = true;
    // Extract item identifier from "item in items" or "(item, index) in items"
    const match = /^\s*(?:\(\s*([a-zA-Z0-9_$]+)|\s*([a-zA-Z0-9_$]+))/i.exec(vForExpr);
    const itemVar = match ? (match[1] || match[2]) : "item";
    const keyAttr = ` :key="${itemVar}.id || ${itemVar}"`;

    return `<${tagName}${attrs}${keyAttr}>`;
  });

  return { code, fixed, ruleId: "vue/require-v-for-key" };
};

/**
 * Applies all deterministic codemods to a source file.
 */
export const applyCodemods = (
  source: string,
  filePath: string,
): { code: string; fixedRules: string[]; changed: boolean } => {
  const isVueOrHtml = /\.(vue|html)$/i.test(filePath);
  let current = source;
  const fixedRules: string[] = [];

  // 1. Lodash imports (any JS/TS/Vue)
  const lodashRes = fixLodashImports(current);
  if (lodashRes.fixed) {
    current = lodashRes.code;
    fixedRules.push(lodashRes.ruleId);
  }

  // 2. Array sort mutation (any JS/TS/Vue)
  const sortRes = fixArraySortMutation(current);
  if (sortRes.fixed) {
    current = sortRes.code;
    fixedRules.push(sortRes.ruleId);
  }

  // 3 & 4: Template codemods (only .vue or .html)
  if (isVueOrHtml) {
    const relRes = fixTargetBlankRel(current);
    if (relRes.fixed) {
      current = relRes.code;
      fixedRules.push(relRes.ruleId);
    }

    const vForRes = fixVForKey(current);
    if (vForRes.fixed) {
      current = vForRes.code;
      fixedRules.push(vForRes.ruleId);
    }
  }

  return {
    code: current,
    fixedRules,
    changed: current !== source,
  };
};

/**
 * Creates a git-style unified diff representation between original and modified text.
 */
export const createUnifiedDiff = (filePath: string, original: string, modified: string): string => {
  if (original === modified) return "";

  const origLines = original.split(/\r?\n/);
  const modLines = modified.split(/\r?\n/);

  const diff: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  const maxLines = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < maxLines; i++) {
    const o = origLines[i];
    const m = modLines[i];

    if (o !== m) {
      if (o !== undefined) diff.push(`-${o}`);
      if (m !== undefined) diff.push(`+${m}`);
    }
  }

  return diff.join("\n");
};
