import fs from "node:fs";
import path from "node:path";

const DISABLE_DIRECTIVE_PATTERNS = [
  /\/\*\s*eslint-disable\b/,
  /\/\/\s*eslint-disable-next-line\b/,
  /\/\/\s*eslint-disable-line\b/,
];

const NEUTRALIZE_PREFIX = "// vue-doctor-neutralized: ";

interface NeutralizedFile {
  filePath: string;
  originalContent: string;
}

export const neutralizeDisableDirectives = (
  rootDirectory: string,
): (() => void) => {
  const neutralizedFiles: NeutralizedFile[] = [];

  const processFile = (filePath: string): void => {
    const content = fs.readFileSync(filePath, "utf-8");

    let didNeutralize = false;
    const neutralizedContent = content
      .split("\n")
      .map((line) => {
        for (const pattern of DISABLE_DIRECTIVE_PATTERNS) {
          if (pattern.test(line)) {
            didNeutralize = true;
            return `${NEUTRALIZE_PREFIX}${line}`;
          }
        }
        return line;
      })
      .join("\n");

    if (didNeutralize) {
      neutralizedFiles.push({ filePath, originalContent: content });
      fs.writeFileSync(filePath, neutralizedContent);
    }
  };

  const walkDirectory = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;

      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walkDirectory(fullPath);
      } else if (/\.(vue|tsx?|jsx?)$/.test(entry.name)) {
        processFile(fullPath);
      }
    }
  };

  try {
    walkDirectory(rootDirectory);
  } catch {
    // silently skip if we can't walk
  }

  return () => {
    for (const { filePath, originalContent } of neutralizedFiles) {
      try {
        fs.writeFileSync(filePath, originalContent);
      } catch {
        // silently skip restore failures
      }
    }
  };
};
