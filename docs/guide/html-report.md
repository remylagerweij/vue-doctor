# HTML report

`--format html` writes one self-contained HTML file: inline CSS and JavaScript, no external request, no CDN. Open it locally or attach it to a CI run as an artifact.

```bash
vue-doctor . --format html --output vue-doctor-report.html
```

Like the other formats it prints to stdout without `--output`. Vue Doctor never writes inside the scanned project on its own, so choose a path outside the source tree or in your CI workspace's artifact directory.

## What the page shows

- A summary per project: score with the cap note, category sub-scores, "fixing X gains +N" hints and skipped analyzers. Clicking a category or rule jumps to its findings.
- **Every** finding, listed 100 at a time ("Show more"), so large reports (thousands of findings) stay fast. The file is about 6 MB for 5,000 findings.
- Each finding has its severity, rule (linked to its documentation), `file:line` with a copy button, the message, the fix hint, a code frame with line numbers and a collapsed **Fix with an AI agent** prompt with a copy button. Rules with several findings also offer one prompt for all of them.
- Filters for severity, category, rule, project and a text search over file, message and rule ID. With `--baseline` (or `--diff`) a **New findings only** filter appears.
- A light and a dark theme: it follows the operating system and the toggle in the header is remembered in the browser. Controls are native and keyboard operable.

## Safety

The report is safe to open and to share inside your organization:

- Text from the scanned code (messages, paths, project names) is only ever inserted as text, and the findings are embedded as escaped JSON, so source code cannot inject markup or script.
- A strict Content-Security-Policy allows nothing but the page's own two inline blocks (by hash): no network, no frames, no forms.
- Documentation links only point at the Vue Doctor docs site.
- Security findings never include source code: no code frame, and the code is cut out of their AI prompt, so a leaked secret cannot end up in an artifact.

## Migrating from `--report`

1.x wrote `vue-doctor-report.html` into the scanned project. `--report` still works but is deprecated: it prints a warning, keeps printing the text report and writes the HTML report to a new private directory in the system temp folder (the path is printed). Use `--format html --output <file>` instead.

```yaml
- run: npx vue-doctor@latest . --format html --output vue-doctor-report.html
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: vue-doctor-report
    path: vue-doctor-report.html
```
