import fs from "node:fs";
import path from "node:path";
import type { Diagnostic, ProjectInfo, ScoreResult } from "../types.js";
import { groupBy } from "./group-by.js";

interface ReportData {
  score: number;
  label: string;
  diagnostics: Diagnostic[];
  project: ProjectInfo;
  elapsed: string;
  skippedChecks: string[];
  timestamp: string;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const getSeverityIcon = (severity: string): string =>
  severity === "error" ? "🔴" : "⚠️";

const getScoreColor = (score: number): string => {
  if (score >= 90) return "#42b883";
  if (score >= 70) return "#e2c541";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
};

const getScoreGradient = (score: number): string => {
  const color = getScoreColor(score);
  return `conic-gradient(${color} ${score * 3.6}deg, #1e293b ${score * 3.6}deg)`;
};

export const generateHtmlReport = (data: ReportData): string => {
  const { score, label, diagnostics, project, elapsed, skippedChecks, timestamp } = data;
  const scoreColor = getScoreColor(score);

  const byCategory = groupBy(diagnostics, (d) => d.category);
  const categoryCards: string[] = [];

  for (const [category, categoryDiags] of byCategory) {
    const errors = categoryDiags.filter((d) => d.severity === "error").length;
    const warnings = categoryDiags.filter((d) => d.severity === "warning").length;
    const byRule = groupBy(categoryDiags, (d) => d.rule);

    const ruleRows = Array.from(byRule.entries())
      .map(([rule, ruleDiags]) => {
        const first = ruleDiags[0];
        const files = [...new Set(ruleDiags.map((d) => d.filePath))].slice(0, 3);
        return `
          <div class="rule-row">
            <div class="rule-header">
              <span class="severity-icon">${getSeverityIcon(first.severity)}</span>
              <span class="rule-name">${escapeHtml(rule)}</span>
              <span class="rule-count">×${ruleDiags.length}</span>
            </div>
            <div class="rule-message">${escapeHtml(first.message)}</div>
            ${first.help ? `<div class="rule-help">→ ${escapeHtml(first.help)}</div>` : ""}
            <div class="rule-files">${files.map((f) => `<span class="file-path">${escapeHtml(f)}</span>`).join("")}</div>
          </div>`;
      })
      .join("");

    categoryCards.push(`
      <div class="category-card">
        <div class="category-header">
          <h3>${escapeHtml(category)}</h3>
          <div class="category-stats">
            ${errors > 0 ? `<span class="stat-error">${errors} error${errors > 1 ? "s" : ""}</span>` : ""}
            ${warnings > 0 ? `<span class="stat-warning">${warnings} warning${warnings > 1 ? "s" : ""}</span>` : ""}
            ${errors === 0 && warnings === 0 ? '<span class="stat-clean">✓ Clean</span>' : ""}
          </div>
        </div>
        <div class="rule-list">${ruleRows}</div>
      </div>`);
  }

  if (categoryCards.length === 0) {
    categoryCards.push(`
      <div class="category-card clean-card">
        <div class="category-header">
          <h3>🎉 Perfect Score</h3>
          <div class="category-stats"><span class="stat-clean">No issues found</span></div>
        </div>
      </div>`);
  }

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vue Doctor Report — ${escapeHtml(project.projectName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f172a;--surface:#1e293b;--surface2:#334155;--text:#f1f5f9;--text-dim:#94a3b8;--accent:${scoreColor};--error:#ef4444;--warning:#f59e0b;--success:#42b883;--radius:12px;--font:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh;padding:2rem}
.container{max-width:1000px;margin:0 auto}
.header{text-align:center;margin-bottom:3rem}
.header h1{font-size:1.75rem;font-weight:700;margin-bottom:.5rem}
.header h1 span{color:var(--accent)}
.header .subtitle{color:var(--text-dim);font-size:.9rem}
.score-section{display:flex;align-items:center;justify-content:center;gap:3rem;margin-bottom:3rem;flex-wrap:wrap}
.score-gauge{position:relative;width:180px;height:180px;border-radius:50%;background:${getScoreGradient(score)};display:flex;align-items:center;justify-content:center;animation:gaugeIn 1s ease-out}
.score-gauge::after{content:'';position:absolute;width:140px;height:140px;border-radius:50%;background:var(--bg)}
.score-value{position:relative;z-index:1;text-align:center}
.score-number{font-size:3rem;font-weight:800;color:var(--accent);line-height:1}
.score-label{font-size:.85rem;color:var(--text-dim);margin-top:.25rem}
.score-stats{display:flex;flex-direction:column;gap:.75rem}
.stat-row{display:flex;align-items:center;gap:.75rem;padding:.5rem 1rem;background:var(--surface);border-radius:var(--radius);min-width:200px}
.stat-row .stat-icon{font-size:1.25rem}
.stat-row .stat-label{color:var(--text-dim);font-size:.85rem}
.stat-row .stat-value{margin-left:auto;font-weight:600}
.categories{display:flex;flex-direction:column;gap:1rem}
.category-card{background:var(--surface);border-radius:var(--radius);overflow:hidden;animation:fadeInUp .5s ease-out both}
.category-card:nth-child(2){animation-delay:.1s}
.category-card:nth-child(3){animation-delay:.2s}
.category-card:nth-child(4){animation-delay:.3s}
.clean-card{border:1px solid var(--success)}
.category-header{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid var(--surface2)}
.category-header h3{font-size:1rem;font-weight:600}
.category-stats{display:flex;gap:.75rem}
.stat-error{color:var(--error);font-weight:600;font-size:.85rem}
.stat-warning{color:var(--warning);font-weight:600;font-size:.85rem}
.stat-clean{color:var(--success);font-weight:600;font-size:.85rem}
.rule-list{padding:.5rem}
.rule-row{padding:.75rem 1rem;border-bottom:1px solid var(--surface2)}
.rule-row:last-child{border-bottom:none}
.rule-header{display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem}
.severity-icon{font-size:.85rem}
.rule-name{font-weight:600;font-size:.9rem}
.rule-count{color:var(--text-dim);font-size:.8rem;margin-left:auto}
.rule-message{color:var(--text-dim);font-size:.85rem;margin-left:1.5rem}
.rule-help{color:var(--accent);font-size:.8rem;margin-left:1.5rem;margin-top:.25rem}
.rule-files{margin-left:1.5rem;margin-top:.25rem}
.file-path{display:block;color:var(--text-dim);font-size:.75rem;font-family:'SF Mono',Monaco,monospace;opacity:.7}
.footer{text-align:center;margin-top:3rem;color:var(--text-dim);font-size:.8rem}
.footer a{color:var(--accent);text-decoration:none}
@keyframes gaugeIn{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes fadeInUp{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
@media(max-width:600px){.score-section{flex-direction:column}.stat-row{min-width:auto}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🩺 <span>Vue Doctor</span> Report</h1>
    <div class="subtitle">${escapeHtml(project.projectName)} · ${escapeHtml(project.framework)} · ${project.vueVersion ? `Vue ${escapeHtml(project.vueVersion)}` : "Vue"} · ${escapeHtml(timestamp)}</div>
  </div>

  <div class="score-section">
    <div class="score-gauge">
      <div class="score-value">
        <div class="score-number">${score}</div>
        <div class="score-label">${escapeHtml(label)}</div>
      </div>
    </div>
    <div class="score-stats">
      <div class="stat-row"><span class="stat-icon">📁</span><span class="stat-label">Source files</span><span class="stat-value">${project.sourceFileCount}</span></div>
      <div class="stat-row"><span class="stat-icon">🔍</span><span class="stat-label">Issues found</span><span class="stat-value">${diagnostics.length}</span></div>
      <div class="stat-row"><span class="stat-icon">📏</span><span class="stat-label">Rules triggered</span><span class="stat-value">${new Set(diagnostics.map((d) => d.rule)).size}</span></div>
      <div class="stat-row"><span class="stat-icon">⏱️</span><span class="stat-label">Scan time</span><span class="stat-value">${elapsed}s</span></div>
      ${skippedChecks.length > 0 ? `<div class="stat-row"><span class="stat-icon">⚠️</span><span class="stat-label">Skipped</span><span class="stat-value">${escapeHtml(skippedChecks.join(", "))}</span></div>` : ""}
    </div>
  </div>

  <div class="categories">
    ${categoryCards.join("\n")}
  </div>

  <div class="footer">
    Generated by <a href="https://github.com/remylagerweij/vue-doctor">Vue Doctor</a> · ${elapsed}s · ${diagnostics.length} diagnostic${diagnostics.length !== 1 ? "s" : ""} across ${new Set(diagnostics.map((d) => d.category)).size} categories
  </div>
</div>
</body>
</html>`;
};

export const writeHtmlReport = (
  data: ReportData,
  outputDirectory: string,
): string => {
  const html = generateHtmlReport(data);
  const outputPath = path.join(outputDirectory, "vue-doctor-report.html");
  fs.writeFileSync(outputPath, html, "utf-8");
  return outputPath;
};

export const generateJsonReport = (data: ReportData): object => {
  const byCategory = groupBy(data.diagnostics, (d) => d.category);
  const categories: Record<string, { errors: number; warnings: number }> = {};

  for (const [category, diags] of byCategory) {
    categories[category] = {
      errors: diags.filter((d) => d.severity === "error").length,
      warnings: diags.filter((d) => d.severity === "warning").length,
    };
  }

  return {
    score: data.score,
    label: data.label,
    rules: {
      total: 73,
      triggered: new Set(data.diagnostics.map((d) => d.rule)).size,
    },
    categories,
    diagnostics: data.diagnostics.map((d) => ({
      file: d.filePath,
      rule: d.rule,
      severity: d.severity,
      message: d.message,
      help: d.help,
      line: d.line,
      column: d.column,
      category: d.category,
    })),
    project: {
      name: data.project.projectName,
      framework: data.project.framework,
      vueVersion: data.project.vueVersion,
      typescript: data.project.hasTypeScript,
      sourceFiles: data.project.sourceFileCount,
    },
    elapsed: data.elapsed,
    skippedChecks: data.skippedChecks,
    timestamp: data.timestamp,
  };
};

export const generateGithubSummary = (data: ReportData): string => {
  const { score, label, diagnostics } = data;
  const byCategory = groupBy(diagnostics, (d) => d.category);
  const scoreEmoji = score >= 90 ? "🟢" : score >= 70 ? "🟡" : score >= 50 ? "🟠" : "🔴";

  let md = `## 🩺 Vue Doctor Report — ${scoreEmoji} Score: ${score}/100 (${label})\n\n`;

  if (diagnostics.length === 0) {
    md += "✅ **No issues found!** Your Vue app is in great shape.\n";
    return md;
  }

  md += "| Category | Errors | Warnings |\n|----------|--------|----------|\n";

  for (const [category, diags] of byCategory) {
    const errors = diags.filter((d) => d.severity === "error").length;
    const warnings = diags.filter((d) => d.severity === "warning").length;
    const errStr = errors > 0 ? `🔴 ${errors}` : "✅ 0";
    const warnStr = warnings > 0 ? `⚠️ ${warnings}` : "✅ 0";
    md += `| **${category}** | ${errStr} | ${warnStr} |\n`;
  }

  md += `\n<details><summary>📋 ${diagnostics.length} issue${diagnostics.length > 1 ? "s" : ""} found</summary>\n\n`;

  for (const [category, diags] of byCategory) {
    md += `### ${category}\n\n`;
    const byRule = groupBy(diags, (d) => d.rule);
    for (const [rule, ruleDiags] of byRule) {
      const first = ruleDiags[0];
      const icon = first.severity === "error" ? "🔴" : "⚠️";
      md += `- ${icon} **${rule}** (×${ruleDiags.length}) — ${first.message}\n`;
    }
    md += "\n";
  }

  md += "</details>\n";
  return md;
};
