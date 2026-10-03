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
