// Pure helpers of the false-positive benchmark (no I/O), kept separate so they can be unit tested.

/** Counts findings per `ruleId` across all projects of a report@2 document, sorted by rule id. */
export const countFindingsByRule = (report) => {
  const counts = {};
  for (const project of report.projects ?? []) {
    for (const finding of project.findings ?? []) {
      counts[finding.ruleId] = (counts[finding.ruleId] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
};

export const sumCounts = (counts) => Object.values(counts).reduce((total, count) => total + count, 0);

const formatSigned = (delta) => (delta > 0 ? `+${delta}` : String(delta));

/**
 * Compares per-rule counts of a run with a previous results document.
 * Returns one row per (repo, rule) whose count changed, plus notes about runs that are not comparable
 * (different pinned SHA, or dead-code analysis toggled).
 */
export const compareResults = (previous, current) => {
  const rows = [];
  const notes = [];
  if (previous.deadCode !== current.deadCode) {
    notes.push(
      `Dead-code analysis was ${previous.deadCode ? "on" : "off"} in the baseline but is ${current.deadCode ? "on" : "off"} now; knip/* rows are not comparable.`,
    );
  }
  for (const [repoId, repo] of Object.entries(current.repos)) {
    const before = previous.repos?.[repoId];
    if (!before) {
      notes.push(`${repoId}: not in the baseline (new repo).`);
    } else if (before.sha !== repo.sha) {
      notes.push(`${repoId}: pinned SHA changed (${before.sha.slice(0, 8)} -> ${repo.sha.slice(0, 8)}); deltas include source changes.`);
    }
    const beforeRules = before?.rules ?? {};
    for (const ruleId of new Set([...Object.keys(beforeRules), ...Object.keys(repo.rules)])) {
      const was = beforeRules[ruleId] ?? 0;
      const now = repo.rules[ruleId] ?? 0;
      if (was !== now) rows.push({ repo: repoId, ruleId, before: was, after: now, delta: now - was });
    }
  }
  for (const repoId of Object.keys(previous.repos ?? {})) {
    if (!current.repos[repoId]) notes.push(`${repoId}: in the baseline but not run now.`);
  }
  rows.sort((left, right) => left.repo.localeCompare(right.repo) || left.ruleId.localeCompare(right.ruleId));
  return { rows, notes };
};

/** Renders a markdown table (usable in a PR comment or GitHub job summary) of the per-repo totals. */
export const renderSummaryTable = (results) => {
  const lines = ["| Repo | Commit | Findings | Rules hit | Time (s) |", "| --- | --- | ---: | ---: | ---: |"];
  for (const [repoId, repo] of Object.entries(results.repos)) {
    lines.push(
      `| ${repoId} | \`${repo.sha.slice(0, 8)}\` | ${repo.totalFindings} | ${Object.keys(repo.rules).length} | ${(repo.durationMs / 1000).toFixed(1)} |`,
    );
  }
  const totalFindings = Object.values(results.repos).reduce((total, repo) => total + repo.totalFindings, 0);
  lines.push(`| **Total** | | **${totalFindings}** | | **${(results.totalDurationMs / 1000).toFixed(1)}** |`);
  return lines.join("\n");
};

/** Renders the per-rule counts of every repo as a markdown table, one column per repo. */
export const renderRuleTable = (results) => {
  const repoIds = Object.keys(results.repos);
  const ruleIds = [...new Set(repoIds.flatMap((repoId) => Object.keys(results.repos[repoId].rules)))].sort();
  const lines = [`| Rule | ${repoIds.join(" | ")} |`, `| --- | ${repoIds.map(() => "---:").join(" | ")} |`];
  for (const ruleId of ruleIds) {
    lines.push(`| \`${ruleId}\` | ${repoIds.map((repoId) => results.repos[repoId].rules[ruleId] ?? 0).join(" | ")} |`);
  }
  return lines.join("\n");
};

/** Renders the comparison as markdown (an empty comparison says so explicitly). */
export const renderComparison = ({ rows, notes }) => {
  const lines = [];
  for (const note of notes) lines.push(`> ${note}`);
  if (lines.length > 0) lines.push("");
  if (rows.length === 0) {
    lines.push("No per-rule count changed compared with the committed results.");
  } else {
    lines.push("| Repo | Rule | Before | After | Delta |", "| --- | --- | ---: | ---: | ---: |");
    for (const row of rows) lines.push(`| ${row.repo} | \`${row.ruleId}\` | ${row.before} | ${row.after} | ${formatSigned(row.delta)} |`);
  }
  return lines.join("\n");
};

/** Default regression tolerance: a rule may rise by this many findings, or by this share of its baseline, whichever is larger. */
export const DEFAULT_TOLERANCE = { absolute: 10, relative: 0.1 };

/**
 * Resolves the directory to scan inside a checkout. `directory` is a repo-relative path from repos.json
 * (monorepos); it must stay inside the checkout.
 */
export const resolveScanDirectory = (checkoutDirectory, directory, pathModule) => {
  if (directory === undefined || directory === "" || directory === ".") return checkoutDirectory;
  if (typeof directory !== "string" || pathModule.isAbsolute(directory)) {
    throw new Error(`Invalid benchmark directory "${directory}": it must be a relative path.`);
  }
  const resolved = pathModule.resolve(checkoutDirectory, directory);
  const relative = pathModule.relative(checkoutDirectory, resolved);
  if (relative.startsWith("..") || pathModule.isAbsolute(relative)) {
    throw new Error(`Invalid benchmark directory "${directory}": it escapes the checkout.`);
  }
  return resolved;
};

/**
 * Regression gate. Sums each rule's findings over the repos that are comparable (present in both runs, same pinned
 * SHA and same scanned directory) and flags a rule whose total rose by more than
 * `max(tolerance.absolute, ceil(tolerance.relative * baselineTotal))`. A rule that is new (baseline total 0) is
 * therefore allowed up to `tolerance.absolute` findings. Rules that fell, or are absent now, never fail. `knip/*`
 * rules are skipped when dead-code analysis differs between the two runs.
 */
export const findRegressions = (previous, current, tolerance = DEFAULT_TOLERANCE) => {
  const totals = new Map();
  const skipKnip = previous.deadCode !== current.deadCode;
  for (const [repoId, repo] of Object.entries(current.repos)) {
    const before = previous.repos?.[repoId];
    if (!before || before.sha !== repo.sha || (before.directory ?? "") !== (repo.directory ?? "")) continue;
    for (const ruleId of new Set([...Object.keys(before.rules), ...Object.keys(repo.rules)])) {
      if (skipKnip && ruleId.startsWith("knip/")) continue;
      const entry = totals.get(ruleId) ?? { before: 0, after: 0 };
      entry.before += before.rules[ruleId] ?? 0;
      entry.after += repo.rules[ruleId] ?? 0;
      totals.set(ruleId, entry);
    }
  }
  const regressions = [];
  for (const [ruleId, { before, after }] of totals) {
    const delta = after - before;
    const allowed = Math.max(tolerance.absolute, Math.ceil(tolerance.relative * before));
    if (delta > allowed) regressions.push({ ruleId, before, after, delta, allowed, isNew: before === 0 });
  }
  regressions.sort((left, right) => right.delta - left.delta || left.ruleId.localeCompare(right.ruleId));
  return regressions;
};

/** Renders the gate verdict as markdown. */
export const renderRegressions = (regressions, tolerance = DEFAULT_TOLERANCE) => {
  const rule = `Gate: a rule fails when its total rises by more than max(${tolerance.absolute}, ${Math.round(tolerance.relative * 100)}% of its baseline) findings (a new rule is allowed ${tolerance.absolute}).`;
  if (regressions.length === 0) return `${rule}\n\nNo regression.`;
  const lines = [rule, "", "| Rule | Before | After | Delta | Allowed |", "| --- | ---: | ---: | ---: | ---: |"];
  for (const row of regressions) {
    lines.push(`| \`${row.ruleId}\`${row.isNew ? " (new)" : ""} | ${row.before} | ${row.after} | +${row.delta} | +${row.allowed} |`);
  }
  return lines.join("\n");
};
