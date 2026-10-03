import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Report } from '../report/model.js';
import { diagnose } from '../core/diagnose.js';
import { buildReport } from '../report/build-report.js';
import { logger } from '../utils/logger.js';
import { createPrivateTempDirectory } from '../utils/private-temp.js';

const execFileAsync = promisify(execFile);

export interface ScoreDeltaInfo {
  baseScore: number | null;
  scoreDelta: number | null;
  newIssuesCount: number;
  fixedIssuesCount: number;
}

export const loadCachedBaseReport = (cachePath: string): Report | null => {
  try {
    if (fs.existsSync(cachePath)) {
      const content = fs.readFileSync(cachePath, 'utf8');
      return JSON.parse(content) as Report;
    }
  } catch (err: any) {
    logger.warn(`Could not read cached base report at ${cachePath}: ${err.message}`);
  }
  return null;
};

export const isShallowRepository = async (cwd: string): Promise<boolean> => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-shallow-repository'], { cwd });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
};

export const scanBaseBranchWithWorktree = async (
  projectDir: string,
  baseRef: string,
): Promise<Report | null> => {
  const isShallow = await isShallowRepository(projectDir);
  if (isShallow) {
    logger.warn(
      'Git repository is a shallow clone (fetch-depth is not 0). Cannot create a worktree for base branch. ' +
        'Set `fetch-depth: 0` in actions/checkout to enable score delta calculation.',
    );
    return null;
  }

  const tempDir = createPrivateTempDirectory("base-worktree");
  const worktreePath = path.join(tempDir.directory, 'repo');

  try {
    logger.log(`Creating git worktree at ${worktreePath} for base ref ${baseRef}...`);
    await execFileAsync('git', ['worktree', 'add', '--detach', worktreePath, baseRef], { cwd: projectDir });

    logger.log('Scanning base branch in worktree...');
    const result = await diagnose(worktreePath);
    const report = buildReport([{ directory: worktreePath, result }], {
      version: '2.0.0',
      generatedAt: null,
      scanDirectory: worktreePath,
    });
    return report;
  } catch (err: any) {
    logger.warn(`Worktree scan for base ref ${baseRef} failed: ${err.message}`);
    return null;
  } finally {
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: projectDir });
      tempDir.dispose();
    } catch {
      // Ignore cleanup error
    }
  }
};

export const calculateScoreDelta = (
  currentReport: Report,
  baseReport: Report | null,
): ScoreDeltaInfo => {
  if (!baseReport) {
    return {
      baseScore: null,
      scoreDelta: null,
      newIssuesCount: 0,
      fixedIssuesCount: 0,
    };
  }

  const baseScore = baseReport.projects[0]?.score.value ?? 100;
  const currentScore = currentReport.projects[0]?.score.value ?? 100;
  const scoreDelta = currentScore - baseScore;

  const baseFingerprints = new Set(
    baseReport.projects.flatMap((p) => p.findings.map((f) => f.fingerprint || `${f.file}:${f.ruleId}`)),
  );
  const currentFingerprints = new Set(
    currentReport.projects.flatMap((p) => p.findings.map((f) => f.fingerprint || `${f.file}:${f.ruleId}`)),
  );

  let newCount = 0;
  for (const fp of currentFingerprints) {
    if (!baseFingerprints.has(fp)) newCount += 1;
  }

  let fixedCount = 0;
  for (const fp of baseFingerprints) {
    if (!currentFingerprints.has(fp)) fixedCount += 1;
  }

  return {
    baseScore,
    scoreDelta,
    newIssuesCount: newCount,
    fixedIssuesCount: fixedCount,
  };
};
