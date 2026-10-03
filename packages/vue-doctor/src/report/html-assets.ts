/**
 * Inline stylesheet and client script of the HTML report. Both are embedded verbatim into the
 * single output file; the strict Content-Security-Policy allows exactly these two blocks by hash,
 * so nothing else can run or load. The script builds all DOM with `textContent`/`setAttribute`
 * (never `innerHTML`) and the stylesheet is only changed through classes and CSSOM (`el.style`),
 * which a `style-src` hash policy permits.
 */

export const REPORT_STYLES = String.raw`
:root{color-scheme:light;--bg:#ffffff;--surface:#f6f8fa;--surface-2:#eaeef2;--fg:#1b1f24;--muted:#4b5563;--border:#c5ccd3;--accent:#0b5cad;--accent-fg:#ffffff;--error:#b42318;--error-bg:#fdecea;--warn:#8a4b00;--warn-bg:#fff4dd;--ok:#116329;--ok-bg:#e6f4ea;--code-bg:#f0f3f6;--hl:#fff1c2;--focus:#0b5cad}
:root[data-theme="dark"]{color-scheme:dark;--bg:#0d1117;--surface:#161b22;--surface-2:#21262d;--fg:#e6edf3;--muted:#a1abb7;--border:#3a424d;--accent:#6cb6ff;--accent-fg:#0d1117;--error:#ff8a80;--error-bg:#3a1618;--warn:#f0b429;--warn-bg:#3a2d0c;--ok:#56d364;--ok-bg:#12301b;--code-bg:#11161d;--hl:#3b3410;--focus:#6cb6ff}
@media (prefers-color-scheme:dark){:root:not([data-theme]){color-scheme:dark;--bg:#0d1117;--surface:#161b22;--surface-2:#21262d;--fg:#e6edf3;--muted:#a1abb7;--border:#3a424d;--accent:#6cb6ff;--accent-fg:#0d1117;--error:#ff8a80;--error-bg:#3a1618;--warn:#f0b429;--warn-bg:#3a2d0c;--ok:#56d364;--ok-bg:#12301b;--code-bg:#11161d;--hl:#3b3410;--focus:#6cb6ff}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
code,pre,.vd-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
.vd-skip{position:absolute;left:-999px;top:0;background:var(--accent);color:var(--accent-fg);padding:8px 12px;z-index:10}
.vd-skip:focus{left:8px;top:8px}
.vd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.vd-wrap{max-width:1100px;margin:0 auto;padding:0 16px}
.vd-top{border-bottom:1px solid var(--border);background:var(--surface)}
.vd-top .vd-wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;padding-top:14px;padding-bottom:14px;flex-wrap:wrap}
h1{font-size:22px;margin:0}
h2{font-size:18px;margin:28px 0 12px}
h3{font-size:16px;margin:0}
.vd-muted{color:var(--muted)}
.vd-btn{font:inherit;color:var(--fg);background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer}
.vd-btn:hover{border-color:var(--accent)}
.vd-btn[disabled]{opacity:.6;cursor:default}
.vd-btn-primary{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.vd-projects{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.vd-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px}
.vd-card header{display:flex;gap:16px;align-items:center;margin-bottom:8px}
.vd-score{min-width:72px;text-align:center;border-radius:10px;padding:6px 10px;font-weight:700;border:2px solid currentColor}
.vd-score b{display:block;font-size:28px;line-height:1.1}
.vd-score span{font-size:12px;font-weight:600}
.vd-s-good{color:var(--ok);background:var(--ok-bg)}
.vd-s-fair{color:var(--warn);background:var(--warn-bg)}
.vd-s-poor{color:var(--error);background:var(--error-bg)}
.vd-note{border-left:4px solid var(--warn);background:var(--warn-bg);padding:8px 12px;margin:8px 0;border-radius:4px}
.vd-note.vd-bad{border-color:var(--error);background:var(--error-bg)}
.vd-cats{list-style:none;margin:8px 0;padding:0;display:grid;gap:4px}
.vd-cats li{display:grid;grid-template-columns:minmax(90px,1fr) 2fr auto;gap:8px;align-items:center}
.vd-bar{height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden}
.vd-bar i{display:block;height:100%;background:currentColor}
.vd-link{font:inherit;background:none;border:0;padding:0;color:var(--accent);text-decoration:underline;cursor:pointer;text-align:left}
.vd-list{margin:6px 0;padding-left:20px}
details>summary{cursor:pointer}
.vd-filters{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:end;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;position:sticky;top:0;z-index:5}
.vd-filters label{display:grid;gap:2px;font-size:13px;color:var(--muted)}
.vd-filters input[type=search],.vd-filters select{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:5px 8px;max-width:240px}
.vd-filters .vd-check{display:flex;gap:6px;align-items:center;color:var(--fg)}
.vd-count{margin:12px 0 8px}
.vd-findings{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.vd-finding{border:1px solid var(--border);border-left-width:5px;border-radius:8px;padding:10px 12px;background:var(--bg)}
.vd-finding.vd-error{border-left-color:var(--error)}
.vd-finding.vd-warning{border-left-color:var(--warn)}
.vd-row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.vd-badge{font-size:12px;font-weight:700;border-radius:999px;padding:1px 8px;border:1px solid currentColor}
.vd-badge.vd-error{color:var(--error);background:var(--error-bg)}
.vd-badge.vd-warning{color:var(--warn);background:var(--warn-bg)}
.vd-badge.vd-new{color:var(--accent);background:var(--surface)}
.vd-loc{margin:4px 0;overflow-wrap:anywhere}
.vd-msg{margin:4px 0;overflow-wrap:anywhere}
.vd-help{margin:4px 0;color:var(--muted);overflow-wrap:anywhere}
pre.vd-code{margin:8px 0;padding:8px 0;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;overflow:auto;tab-size:2}
pre.vd-code span{display:block;padding:0 12px;white-space:pre}
pre.vd-code span.vd-hl{background:var(--hl);font-weight:600}
pre.vd-prompt{margin:6px 0;padding:10px;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere}
.vd-more{margin:14px 0}
.vd-empty{padding:20px;text-align:center;color:var(--muted)}
footer{margin:32px 0;color:var(--muted);font-size:13px}
@media (max-width:560px){.vd-cats li{grid-template-columns:1fr auto}.vd-cats .vd-bar{grid-column:1/-1}}
@media print{.vd-filters,.vd-top button{display:none}}
`;

/**
 * The report is data (`#vd-data`, JSON) plus this script. `\u0001` in a prompt marks where the
 * finding's own code frame belongs (the generator stores it once, not twice).
 */
export const REPORT_SCRIPT = String.raw`
(function () {
  "use strict";
  var dataElement = document.getElementById("vd-data");
  if (!dataElement) return;
  var data = JSON.parse(dataElement.textContent || "{}");
  var PAGE_SIZE = 100;
  var root = document.documentElement;

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function byId(id) { return document.getElementById(id); }
  function plural(count, word) { return count + " " + word + (count === 1 ? "" : "s"); }
  function scoreClass(value) { return value >= 90 ? "vd-s-good" : value >= 70 ? "vd-s-fair" : "vd-s-poor"; }

  var status = byId("vd-status");
  function announce(message) { status.textContent = ""; status.textContent = message; }

  /* ---- theme: follows the OS until the toggle is used; the choice is remembered when storage works ---- */
  var THEME_KEY = "vue-doctor-report-theme";
  var themeButton = byId("vd-theme");
  function storedTheme() { try { return window.localStorage.getItem(THEME_KEY); } catch (error) { return null; } }
  function storeTheme(value) { try { window.localStorage.setItem(THEME_KEY, value); } catch (error) { /* storage unavailable */ } }
  function systemTheme() {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch (error) { return "light"; }
  }
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeButton.textContent = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  }
  var saved = storedTheme();
  applyTheme(saved === "light" || saved === "dark" ? saved : systemTheme());
  themeButton.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
  });

  /* ---- clipboard ---- */
  function copyText(text, button, label) {
    function done(ok) {
      announce(ok ? label + " copied to the clipboard" : "Copying failed");
      var original = button.getAttribute("data-label") || button.textContent;
      button.setAttribute("data-label", original);
      button.textContent = ok ? "Copied" : "Copy failed";
      window.setTimeout(function () { button.textContent = original; }, 1500);
    }
    function fallback() {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.className = "vd-sr";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (error) { ok = false; }
      document.body.removeChild(area);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }
  function copyButton(text, label, ariaLabel) {
    var button = make("button", "vd-btn", label);
    button.type = "button";
    button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", function () { copyText(text, button, ariaLabel.replace(/^Copy /, "")); });
    return button;
  }

  /* ---- docs links: only the trusted documentation origin ---- */
  function trustedDocs(url) {
    return typeof url === "string" && data.docsOrigin && url.indexOf(data.docsOrigin + "/") === 0 ? url : "";
  }
  function ruleLabel(rule) {
    var href = trustedDocs(rule.docs);
    if (!href) return make("code", "vd-mono", rule.id);
    var link = make("a", "", rule.id);
    link.className = "vd-mono";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  /* ---- state and filtering ---- */
  var filters = { severity: "", category: "", rule: "", project: "", query: "", newOnly: false, sort: "file" };
  var findings = data.findings;
  var shown = 0;
  var matches = [];
  var hasStatus = findings.some(function (finding) { return finding.st !== undefined; });
  var searchText = findings.map(function (finding) {
    return (finding.f + " " + finding.m + " " + data.rules[finding.r].id).toLowerCase();
  });

  function matching() {
    var query = filters.query.trim().toLowerCase();
    var result = [];
    for (var index = 0; index < findings.length; index++) {
      var finding = findings[index];
      var rule = data.rules[finding.r];
      if (filters.severity && finding.s !== filters.severity) continue;
      if (filters.category && rule.category !== filters.category) continue;
      if (filters.rule && rule.id !== filters.rule) continue;
      if (filters.project !== "" && String(finding.p) !== filters.project) continue;
      if (filters.newOnly && finding.st !== undefined && finding.st !== "new") continue;
      if (query && searchText[index].indexOf(query) === -1) continue;
      result.push(index);
    }
    if (filters.sort === "severity") {
      result.sort(function (a, b) {
        return (findings[a].s === "error" ? 0 : 1) - (findings[b].s === "error" ? 0 : 1) || a - b;
      });
    }
    return result;
  }

  /* ---- finding cards ---- */
  function codeFrame(text) {
    var pre = make("pre", "vd-code");
    pre.setAttribute("tabindex", "0");
    pre.setAttribute("aria-label", "Code around the finding");
    text.split("\n").forEach(function (line) {
      pre.appendChild(make("span", line.charAt(0) === ">" ? "vd-hl" : "", line === "" ? " " : line));
    });
    return pre;
  }

  function promptOf(finding) {
    return finding.ap.replace("\u0001", function () { return finding.cf || ""; });
  }

  function renderFinding(finding) {
    var rule = data.rules[finding.r];
    var item = make("li", "vd-finding vd-" + finding.s);
    var head = make("div", "vd-row");
    head.appendChild(make("span", "vd-badge vd-" + finding.s, finding.s));
    head.appendChild(ruleLabel(rule));
    head.appendChild(make("span", "vd-muted", rule.category));
    if (finding.st === "new") head.appendChild(make("span", "vd-badge vd-new", "new"));
    if (finding.st === "baseline") head.appendChild(make("span", "vd-muted", "in baseline"));
    if (data.projects.length > 1) head.appendChild(make("span", "vd-muted", "project " + data.projects[finding.p].name));
    item.appendChild(head);

    var location = finding.l > 0 ? finding.f + ":" + finding.l + (finding.c > 0 ? ":" + finding.c : "") : finding.f;
    var locationRow = make("div", "vd-row vd-loc");
    locationRow.appendChild(make("code", "vd-mono", location));
    locationRow.appendChild(copyButton(finding.l > 0 ? finding.f + ":" + finding.l : finding.f, "Copy", "Copy path " + location));
    item.appendChild(locationRow);

    item.appendChild(make("p", "vd-msg", finding.m));
    var help = finding.h !== undefined ? finding.h : rule.help;
    if (help) item.appendChild(make("p", "vd-help", "How to fix: " + help));
    if (finding.cf) item.appendChild(codeFrame(finding.cf));

    if (finding.ap) {
      var details = make("details");
      details.appendChild(make("summary", "", "Fix with an AI agent"));
      var filled = false;
      details.addEventListener("toggle", function () {
        if (!details.open || filled) return;
        filled = true;
        var prompt = make("pre", "vd-prompt", promptOf(finding));
        details.appendChild(prompt);
        details.appendChild(copyButton(promptOf(finding), "Copy prompt", "Copy AI fix prompt for " + location));
      });
      item.appendChild(details);
    }
    return item;
  }

  var list = byId("vd-list");
  var countLabel = byId("vd-count");
  var moreWrap = byId("vd-more");

  function renderPage() {
    var end = Math.min(matches.length, shown + PAGE_SIZE);
    var fragment = document.createDocumentFragment();
    for (var position = shown; position < end; position++) fragment.appendChild(renderFinding(findings[matches[position]]));
    list.appendChild(fragment);
    shown = end;
    var remaining = matches.length - shown;
    moreWrap.textContent = "";
    if (remaining > 0) {
      var button = make("button", "vd-btn", "Show " + Math.min(PAGE_SIZE, remaining) + " more (" + remaining + " not shown yet)");
      button.type = "button";
      button.addEventListener("click", function () { renderPage(); announce(shown + " of " + matches.length + " findings shown"); });
      moreWrap.appendChild(button);
    }
  }

  function refresh() {
    matches = matching();
    shown = 0;
    list.textContent = "";
    if (matches.length === 0) {
      var empty = make("li", "vd-empty", findings.length === 0 ? "No findings. Nice work." : "No findings match the filters.");
      list.appendChild(empty);
      moreWrap.textContent = "";
    } else {
      renderPage();
    }
    var text = findings.length === matches.length
      ? plural(findings.length, "finding")
      : matches.length + " of " + plural(findings.length, "finding") + " match the filters";
    countLabel.textContent = text;
  }

  /* ---- filter controls ---- */
  function option(select, value, label) {
    var node = make("option", "", label);
    node.value = value;
    select.appendChild(node);
  }
  function fillSelect(id, entries, key) {
    var select = byId(id);
    entries.forEach(function (entry) { option(select, entry[0], entry[1]); });
    select.addEventListener("change", function () { filters[key] = select.value; refresh(); });
    return select;
  }

  var categoryCounts = {};
  var ruleCounts = {};
  findings.forEach(function (finding) {
    var rule = data.rules[finding.r];
    categoryCounts[rule.category] = (categoryCounts[rule.category] || 0) + 1;
    ruleCounts[rule.id] = (ruleCounts[rule.id] || 0) + 1;
  });
  var categorySelect = fillSelect("vd-f-category", Object.keys(categoryCounts).sort().map(function (name) {
    return [name, name + " (" + categoryCounts[name] + ")"];
  }), "category");
  var ruleSelect = fillSelect("vd-f-rule", Object.keys(ruleCounts).sort(function (a, b) {
    return ruleCounts[b] - ruleCounts[a] || (a < b ? -1 : 1);
  }).map(function (id) { return [id, id + " (" + ruleCounts[id] + ")"]; }), "rule");
  fillSelect("vd-f-severity", [["error", "Errors"], ["warning", "Warnings"]], "severity");
  fillSelect("vd-f-sort", [["severity", "Errors first"]], "sort");
  if (data.projects.length > 1) {
    fillSelect("vd-f-project", data.projects.map(function (project, index) { return [String(index), project.name]; }), "project");
  } else {
    byId("vd-f-project-label").hidden = true;
  }
  var newOnlyLabel = byId("vd-f-new-label");
  if (hasStatus) {
    byId("vd-f-new").addEventListener("change", function (event) { filters.newOnly = event.target.checked; refresh(); });
  } else {
    newOnlyLabel.hidden = true;
  }
  var timer = 0;
  byId("vd-f-query").addEventListener("input", function (event) {
    var value = event.target.value;
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { filters.query = value; refresh(); }, 150);
  });
  byId("vd-f-reset").addEventListener("click", function () {
    filters = { severity: "", category: "", rule: "", project: "", query: "", newOnly: false, sort: "file" };
    byId("vd-filter-form").reset();
    refresh();
  });
  byId("vd-filter-form").addEventListener("submit", function (event) { event.preventDefault(); });

  function focusFilter(key, select, value) {
    filters[key] = value;
    select.value = value;
    refresh();
    announce(countLabel.textContent);
    byId("vd-findings-heading").scrollIntoView();
    byId("vd-findings-heading").focus();
  }

  /* ---- project summaries ---- */
  function renderProject(project, index) {
    var card = make("article", "vd-card");
    card.setAttribute("aria-labelledby", "vd-project-" + index);
    var header = make("header");
    var score = make("div", "vd-score " + scoreClass(project.score.value));
    score.appendChild(make("b", "", String(project.score.value)));
    score.appendChild(make("span", "", project.score.label));
    header.appendChild(score);
    var title = make("div");
    var heading = make("h3", "", project.name);
    heading.id = "vd-project-" + index;
    title.appendChild(heading);
    var facts = [project.framework, project.vueVersion ? "Vue " + project.vueVersion : "Vue", project.typescript ? "TypeScript" : "JavaScript", plural(project.sourceFiles, "source file")];
    if (project.scope.mode === "changed") facts.push("changed files only (" + (project.scope.files || 0) + ")");
    title.appendChild(make("div", "vd-muted", facts.join(" · ")));
    title.appendChild(make("div", "", plural(project.summary.errors, "error") + " · " + plural(project.summary.warnings, "warning") +
      (project.summary.suppressed > 0 ? " · " + project.summary.suppressed + " suppressed" : "")));
    header.appendChild(title);
    card.appendChild(header);

    if (project.score.cap) {
      card.appendChild(make("p", "vd-note vd-bad", "Score capped at " + project.score.cap.value + " (" + project.score.rawScore +
        " before the cap): " + (project.score.cap.reason === "critical-secret" ? "critical secret" : "high-confidence security error") +
        " in " + project.score.cap.ruleId + "."));
    }
    project.skipped.forEach(function (entry) {
      card.appendChild(make("p", "vd-note", entry.tool + " did not run: " + entry.reason + ". The score is incomplete."));
    });
    if (project.baseline) {
      var fixed = project.baseline.fixed === null ? "" : ", " + project.baseline.fixed + " fixed";
      card.appendChild(make("p", "vd-muted", "Baseline " + project.baseline.path + ": " + project.baseline.new + " new" + fixed + ", " + project.baseline.matched + " known."));
    }

    if (project.score.categories.length > 0) {
      card.appendChild(make("h4", "vd-sr", "Category scores"));
      var cats = make("ul", "vd-cats");
      project.score.categories.forEach(function (entry) {
        var row = make("li");
        var name = make("button", "vd-link", entry.category);
        name.type = "button";
        name.setAttribute("aria-label", "Show " + entry.category + " findings");
        name.addEventListener("click", function () { focusFilter("category", categorySelect, entry.category); });
        row.appendChild(name);
        var bar = make("div", "vd-bar " + scoreClass(entry.score));
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", entry.category + " score " + entry.score + " of 100");
        var fill = make("i");
        fill.style.width = entry.score + "%";
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(make("span", "vd-muted", entry.score + " · " + entry.errors + " err · " + entry.warnings + " warn"));
        cats.appendChild(row);
      });
      card.appendChild(cats);
    }

    if (project.score.impact.length > 0) {
      card.appendChild(make("h4", "vd-sr", "Biggest improvements"));
      var impact = make("ul", "vd-list");
      project.score.impact.slice(0, 5).forEach(function (entry) {
        var item = make("li");
        item.appendChild(document.createTextNode("Fixing "));
        var link = make("button", "vd-link vd-mono", entry.ruleId);
        link.type = "button";
        link.addEventListener("click", function () { focusFilter("rule", ruleSelect, entry.ruleId); });
        item.appendChild(link);
        item.appendChild(document.createTextNode(" gains +" + entry.gain));
        impact.appendChild(item);
      });
      card.appendChild(impact);
    }

    if (project.ruleGroups.length > 0) {
      var groups = make("details");
      groups.appendChild(make("summary", "", "Fix a whole rule with one AI prompt (" + project.ruleGroups.length + " rules)"));
      var groupList = make("ul", "vd-list");
      project.ruleGroups.forEach(function (group) {
        var item = make("li");
        item.appendChild(make("code", "vd-mono", group.ruleId));
        item.appendChild(document.createTextNode(" (" + group.count + ") "));
        item.appendChild(copyButton(group.agentPrompt, "Copy prompt", "Copy AI fix prompt for all " + group.count + " findings of " + group.ruleId));
        groupList.appendChild(item);
      });
      groups.appendChild(groupList);
      card.appendChild(groups);
    }
    return card;
  }

  var projectsHost = byId("vd-projects");
  projectsHost.textContent = "";
  data.projects.forEach(function (project, index) { projectsHost.appendChild(renderProject(project, index)); });

  refresh();
})();
`;
