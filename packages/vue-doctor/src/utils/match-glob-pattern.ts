export type GlobMatcher = (filePath: string) => boolean;

const compiledMatchers = new Map<string, GlobMatcher>();

/**
 * Compiles a glob (`*` within a segment, `**` across segments) into a matcher. The pattern matches
 * the whole path or any path suffix starting at a directory boundary. Compiled once per pattern
 * and cached, so hot loops (every diagnostic x every ignore pattern) never rebuild the regexes.
 */
export const compileGlobPattern = (pattern: string): GlobMatcher => {
  const cached = compiledMatchers.get(pattern);
  if (cached) return cached;

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");

  const regex = new RegExp(`^${regexPattern}$|(?:^|/)${regexPattern}$`);
  const matcher: GlobMatcher = (filePath) => regex.test(filePath);
  compiledMatchers.set(pattern, matcher);
  return matcher;
};

export const matchGlobPattern = (filePath: string, pattern: string): boolean =>
  compileGlobPattern(pattern)(filePath);
