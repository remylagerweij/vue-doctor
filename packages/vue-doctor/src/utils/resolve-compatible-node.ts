const NODE_VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

// Mirrors the `engines.node` range in package.json: ^22.12.0 || >=24.0.0
export const isSupportedNodeVersion = (version: string): boolean => {
  const match = NODE_VERSION_PATTERN.exec(version.trim());
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);

  if (major === 22) return minor >= 12;
  return major >= 24;
};

// Returns the Node binary oxlint should run with, or null when the current
// runtime is unsupported. Vue Doctor never searches for or installs other Node versions.
export const resolveNodeForOxlint = (): string | null =>
  isSupportedNodeVersion(process.version) ? process.execPath : null;
