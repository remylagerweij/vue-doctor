import { execSync, spawnSync } from "node:child_process";
import { OXLINT_NODE_REQUIREMENT, OXLINT_RECOMMENDED_NODE_MAJOR } from "../constants.js";

interface NodeResolution {
  binaryPath: string;
  version: string;
  isCurrentNode: boolean;
}

const satisfiesVersionRange = (version: string): boolean => {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);

  if (major === 20 && minor >= 19) return true;
  if (major >= 22 && minor >= 12) return true;
  if (major >= 23) return true;

  return false;
};

const getCurrentNodeVersion = (): string => process.version;

export const resolveNodeForOxlint = (): NodeResolution | null => {
  const currentVersion = getCurrentNodeVersion();
  if (satisfiesVersionRange(currentVersion)) {
    return {
      binaryPath: process.execPath,
      version: currentVersion,
      isCurrentNode: true,
    };
  }

  if (!isNvmInstalled()) return null;

  const nvmDir = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`;
  const versionsDir = `${nvmDir}/versions/node`;

  try {
    const result = spawnSync("ls", [versionsDir], { encoding: "utf-8" });
    if (result.status !== 0) return null;

    const versions = result.stdout
      .split("\n")
      .filter((version) => version.startsWith("v") && satisfiesVersionRange(version))
      .sort()
      .reverse();

    if (versions.length === 0) return null;

    const bestVersion = versions[0];
    const binaryPath = `${versionsDir}/${bestVersion}/bin/node`;

    return {
      binaryPath,
      version: bestVersion,
      isCurrentNode: false,
    };
  } catch {
    return null;
  }
};

export const isNvmInstalled = (): boolean => {
  const nvmDir = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`;
  try {
    const result = spawnSync("ls", [nvmDir], { encoding: "utf-8" });
    return result.status === 0;
  } catch {
    return false;
  }
};

export const installNodeViaNvm = (): boolean => {
  try {
    execSync(
      `bash -c "source $NVM_DIR/nvm.sh && nvm install ${OXLINT_RECOMMENDED_NODE_MAJOR}"`,
      { stdio: "inherit" },
    );
    return true;
  } catch {
    return false;
  }
};
