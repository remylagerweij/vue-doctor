import type { FsRuleCases } from "../../fs-rule-cases.js";

const cases: FsRuleCases = {
  valid: [
    {
      name: "ordinary public assets",
      files: {
        "public/favicon.ico": "",
        "public/robots.txt": "User-agent: *\n",
        "public/images/logo.svg": "<svg/>",
        "public/fonts/inter.woff2": "",
      },
    },
    {
      name: "sensitive file names outside the public folder",
      files: { ".env": "A=1\n", "server/private.pem": "", "src/app.js.map": "{}", "db/dump.sql": "", "debug.log": "" },
    },
    {
      name: "env templates and public keys may be served",
      files: { "public/.env.example": "A=\n", "public/id_rsa.pub": "ssh-rsa AAAA", "public/.well-known/security.txt": "" },
    },
    {
      name: "a file named like a dump but not ending in one",
      files: { "public/database.html": "", "public/sqlite-guide.pdf": "", "public/keyboard.png": "", "public/mapbox.js": "" },
    },
    {
      name: "static/ is only a public folder in Nuxt",
      files: { "static/backup.bak": "" },
      framework: "vite",
    },
  ],
  invalid: [
    {
      name: "a .env file in public, even git-ignored",
      files: { "public/.env": "API_SECRET=abc\n" },
      ignored: ["public/.env"],
      findings: [{ file: "public/.env" }],
    },
    {
      name: "private keys, a certificate bundle and an ssh key",
      files: { "public/cert/server.pem": "", "public/id_rsa": "", "public/keys/app.key": "", "public/id_rsa.pub": "" },
      findings: [{ file: "public/cert/server.pem" }, { file: "public/id_rsa" }, { file: "public/keys/app.key" }],
    },
    {
      name: "database dumps and sqlite files",
      files: { "public/dump.sql": "", "public/data/app.sqlite": "", "public/backup/prod.db": "" },
      findings: [{ file: "public/backup/prod.db" }, { file: "public/data/app.sqlite" }, { file: "public/dump.sql" }],
    },
    {
      name: "source maps are one aggregated finding",
      files: { "public/assets/app.js": "", "public/assets/app.js.map": "{}", "public/assets/app.css.map": "{}" },
      findings: [{ file: "public/assets/app.css.map" }],
    },
    {
      name: "backups, logs and OS files, also untracked",
      files: { "public/index.html.bak": "", "public/old.html~": "", "public/debug.log": "", "public/.DS_Store": "" },
      untracked: ["public/debug.log"],
      findings: [
        { file: "public/.DS_Store" },
        { file: "public/debug.log" },
        { file: "public/index.html.bak" },
        { file: "public/old.html~" },
      ],
    },
    {
      name: "a git repository inside public",
      files: { "public/.git/HEAD": "ref: refs/heads/main\n", "public/.git/config": "" },
      ignored: ["public/.git/HEAD", "public/.git/config"],
      findings: [{ file: "public/.git" }],
    },
    {
      name: "Nuxt 2 static/ folder",
      files: { "static/secrets.env": "", "static/.env.production": "A=1\n" },
      framework: "nuxt",
      findings: [{ file: "static/.env.production" }],
    },
  ],
};

export default cases;
