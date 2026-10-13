import fs from "node:fs";

// oxlint hands rules only the `<script>` of a `.vue` file, so template-aware rules read the SFC here.

const TEMPLATE_OPEN = /<template(?:\s[^>]*)?>/;

/** The template source of an SFC, or `null` for non-SFC files and SFCs without a template. */
export const readSfcTemplate = (filename: string): string | null => {
  if (!filename.endsWith(".vue")) return null;
  let source: string;
  try {
    source = fs.readFileSync(filename, "utf8");
  } catch {
    return null;
  }
  const open = TEMPLATE_OPEN.exec(source);
  if (!open) return null;
  const start = open.index + open[0].length;
  const end = source.lastIndexOf("</template>");
  return end > start ? source.slice(start, end) : null;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the template writes the binding: `v-model="name"`, `@click="name = x"`, `name++`. */
export const templateWritesBinding = (template: string, name: string): boolean => {
  const id = escapeRegExp(name);
  const vModel = new RegExp(`\\bv-model(?::[\\w-]+)?(?:\\.[\\w-]+)*\\s*=\\s*["']\\s*${id}\\s*["']`);
  const assignment = new RegExp(`(?<![\\w$.])${id}\\s*(?:[-+*/%]?=(?!=)|\\+\\+|--)|(?:\\+\\+|--)\\s*${id}(?![\\w$])`);
  return vModel.test(template) || assignment.test(template);
};

/** Whether the template uses the binding other than through a static member (`name.x`). */
export const templateUsesBindingAsValue = (template: string, name: string): boolean =>
  new RegExp(`(?<![\\w$.-])${escapeRegExp(name)}(?![\\w$-])(?!\\s*\\??\\.\\s*[\\w$])`).test(template);
