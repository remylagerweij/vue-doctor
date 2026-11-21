import type { Random } from "./prng.js";
import type { SourceInput } from "./types.js";

// Random, seeded mutations of existing inputs. Unlike the metamorphic transforms they change the
// meaning of the code: only the crash and slowness oracles apply. Many mutants will not parse
// (the engines skip those); the ones that do exercise rules with shapes the cases never had.

/** Names that collide with Object.prototype members or are otherwise special to JavaScript. */
const POISON_NAMES = [
  "constructor",
  "__proto__",
  "prototype",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "isPrototypeOf",
  "__defineGetter__",
  "length",
  "then",
  "default",
  "undefined",
  "NaN",
  "arguments",
  "eval",
  "$$typeof",
];

const POISON_STRINGS = [
  "",
  " ",
  "__proto__",
  "constructor",
  "../../../etc/passwd",
  "javascript:alert(1)",
  "//evil.example/x",
  "http://",
  "<script>alert(1)</script>",
  "${a}",
  "\\u0000",
  "😀🏳️‍🌈",
  "‮abc",
  "a".repeat(4000),
  "AKIA".repeat(300),
  "0".repeat(2000),
];

const UNICODE_NAMES = ["ĳ", "名前", "привет", "ℵ", "𝒳", "état"];

const RESERVED_WORDS = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static await async of as from type interface implements private public protected readonly declare namespace module abstract is keyof infer satisfies".split(
    " ",
  ),
);

const IDENTIFIER_PATTERN = /(?<![\w$.])[A-Za-z_$][\w$]*/g;
const STRING_PATTERN = /'[^'\n\\]*'|"[^"\n\\]*"/g;

export interface Mutator {
  id: string;
  /** The mutated text, or `null` when the mutator found nothing to change. `donor` is text from another input. */
  apply: (code: string, random: Random, donor: string) => string | null;
}

const splitLines = (code: string): string[] => code.split("\n");

const replaceAllIdentifiers = (code: string, random: Random, replacements: readonly string[]): string | null => {
  const names = [...new Set(code.match(IDENTIFIER_PATTERN) ?? [])].filter((name) => !RESERVED_WORDS.has(name));
  if (names.length === 0) return null;
  const target = random.pick(names);
  const replacement = random.pick(replacements);
  if (target === replacement) return null;
  return code.replace(IDENTIFIER_PATTERN, (name) => (name === target ? replacement : name));
};

export const MUTATORS: readonly Mutator[] = [
  {
    id: "drop-line",
    apply: (code, random) => {
      const lines = splitLines(code);
      if (lines.length < 2) return null;
      lines.splice(random.int(lines.length), 1);
      return lines.join("\n");
    },
  },
  {
    id: "duplicate-line",
    apply: (code, random) => {
      const lines = splitLines(code);
      const index = random.int(lines.length);
      lines.splice(index, 0, lines[index]);
      return lines.join("\n");
    },
  },
  {
    id: "swap-lines",
    apply: (code, random) => {
      const lines = splitLines(code);
      if (lines.length < 2) return null;
      const index = random.int(lines.length - 1);
      [lines[index], lines[index + 1]] = [lines[index + 1], lines[index]];
      return lines.join("\n");
    },
  },
  {
    id: "truncate",
    apply: (code, random) => {
      const lines = splitLines(code);
      if (lines.length < 3) return null;
      return lines.slice(0, 1 + random.int(lines.length - 1)).join("\n");
    },
  },
  {
    id: "drop-char",
    apply: (code, random) => {
      if (code.length < 2) return null;
      const index = random.int(code.length);
      return code.slice(0, index) + code.slice(index + 1);
    },
  },
  {
    id: "splice-foreign-line",
    apply: (code, random, donor) => {
      const donorLines = splitLines(donor).filter((line) => line.trim() !== "");
      if (donorLines.length === 0) return null;
      const lines = splitLines(code);
      lines.splice(random.int(lines.length + 1), 0, random.pick(donorLines));
      return lines.join("\n");
    },
  },
  { id: "poison-identifier", apply: (code, random) => replaceAllIdentifiers(code, random, POISON_NAMES) },
  { id: "unicode-identifier", apply: (code, random) => replaceAllIdentifiers(code, random, UNICODE_NAMES) },
  {
    id: "poison-string",
    apply: (code, random) => {
      const literals = [...code.matchAll(STRING_PATTERN)];
      if (literals.length === 0) return null;
      const literal = random.pick(literals);
      const quote = literal[0][0];
      const payload = random.pick(POISON_STRINGS).replace(/["'\\\n\r]/g, "");
      return code.slice(0, literal.index) + quote + payload + quote + code.slice(literal.index + literal[0].length);
    },
  },
];

/**
 * Up to `count` mutants of `input`, each produced by one randomly chosen mutator. `donor` supplies
 * foreign lines; it is another corpus input chosen by the caller.
 */
export const mutateInput = (input: SourceInput, random: Random, count: number, donor: string): SourceInput[] => {
  const mutants: SourceInput[] = [];
  for (let attempt = 0; attempt < count; attempt++) {
    const mutator = random.pick(MUTATORS);
    const code = mutator.apply(input.code, random, donor);
    if (code === null || code === input.code) continue;
    mutants.push({
      ...input,
      id: `${input.id}~${mutator.id}#${attempt}`,
      origin: "mutation",
      code,
      mutation: `mutation:${mutator.id}`,
    });
  }
  return mutants;
};
