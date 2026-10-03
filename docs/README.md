# Vue Doctor docs

VitePress site, published to GitHub Pages by `.github/workflows/docs.yml`.

```bash
npm run docs:dev -w @vue-doctor/docs
npm run docs:build -w @vue-doctor/docs
```

`docs/analysis/` holds internal planning documents and is excluded from the site (`srcExclude`).
Set `DOCS_BASE=/` to build for a custom domain.
