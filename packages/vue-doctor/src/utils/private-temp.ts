import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMP_DIRECTORY_PREFIX = "vue-doctor-";

interface PrivateTempDirectory {
  directory: string;
  /** Writes a new file (exclusive create, owner-only) below the directory, creating parents. */
  writeFile: (relativePath: string, content: string) => string;
  dispose: () => void;
}

/**
 * Creates a unique, owner-only (0o700) directory below the OS temp directory. Names are random, so
 * concurrent runs never collide and a pre-created symlink cannot be followed; files are created
 * with "wx" so an existing entry is an error rather than being overwritten.
 */
export const createPrivateTempDirectory = (purpose: string): PrivateTempDirectory => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `${TEMP_DIRECTORY_PREFIX}${purpose}-`));
  return {
    directory,
    writeFile: (relativePath, content) => {
      const target = path.join(directory, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, content, { flag: "wx", mode: 0o600 });
      return target;
    },
    dispose: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
};
