import fs from "node:fs";
import path from "node:path";
import {
  LINTABLE_FILE_PATTERN,
  listProjectSourceFiles,
  normalizeRelativePath,
} from "./list-source-files.js";
import { createPrivateTempDirectory } from "./private-temp.js";
import { defuseForeignDirectives, hasForeignDirectives } from "./suppressions.js";

/**
 * oxlint has no switch to ignore inline `eslint-disable` / `oxlint-disable` comments, and users'
 * comments must not be able to hide Vue Doctor findings. Vue Doctor never edits project files, so
 * files that contain such comments are linted from a defused copy in the OS temp directory
 * instead (same relative path, same text length, so findings keep their line and column).
 */

interface DefusedFile {
  /** Path relative to the project root, with forward slashes. */
  relativePath: string;
  content: string;
}

/**
 * Reads (never writes) the candidate files and returns those containing foreign disable
 * directives, with their defused content. `candidatePaths` are relative to `rootDirectory`
 * (or absolute); without them the whole project is searched.
 */
export const findFilesWithForeignDirectives = (
  rootDirectory: string,
  candidatePaths?: string[],
): DefusedFile[] => {
  const candidates = (candidatePaths ?? listProjectSourceFiles(rootDirectory)).filter((filePath) =>
    LINTABLE_FILE_PATTERN.test(filePath),
  );
  const defusedFiles: DefusedFile[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const relativePath = normalizeRelativePath(
      path.isAbsolute(candidate) ? path.relative(rootDirectory, candidate) : candidate,
    );
    if (relativePath.startsWith("../") || path.isAbsolute(relativePath) || seen.has(relativePath)) {
      continue;
    }
    seen.add(relativePath);

    let content: string;
    try {
      content = fs.readFileSync(path.join(rootDirectory, relativePath), "utf-8");
    } catch {
      continue;
    }
    if (hasForeignDirectives(content)) {
      defusedFiles.push({ relativePath, content: defuseForeignDirectives(content) });
    }
  }

  return defusedFiles;
};

interface DefusedMirror {
  directory: string;
  relativePaths: string[];
  dispose: () => void;
}

/** Writes the defused files below a fresh OS temp directory, mirroring their relative paths. */
export const createDefusedMirror = (files: DefusedFile[]): DefusedMirror => {
  const temp = createPrivateTempDirectory("mirror");
  try {
    for (const file of files) temp.writeFile(file.relativePath, file.content);
  } catch (error) {
    temp.dispose();
    throw error;
  }
  return {
    directory: temp.directory,
    relativePaths: files.map((file) => file.relativePath),
    dispose: temp.dispose,
  };
};

