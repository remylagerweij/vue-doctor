export const matchGlobPattern = (filePath: string, pattern: string): boolean => {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");

  return new RegExp(`^${regexPattern}$`).test(filePath) ||
    new RegExp(`(^|/)${regexPattern}$`).test(filePath);
};
