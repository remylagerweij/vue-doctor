import type { FsRuleCases } from "../../fs-rule-cases.js";

const cases: FsRuleCases = {
  valid: [
    {
      name: "env templates are meant to be committed",
      files: {
        ".env.example": "STRIPE_SECRET_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\nDB_PASSWORD=hunter2\n",
        ".env.sample": "API_TOKEN=abcdef123456\n",
        ".env.template": "SECRET=abcdef123456\n",
        ".env.defaults": "JWT_SECRET=abcdef123456\n",
      },
    },
    {
      name: "a git-ignored .env is not committed",
      files: { ".env": "STRIPE_SECRET_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\n", ".gitignore": ".env\n" },
      ignored: [".env"],
    },
    {
      name: "a tracked .env with plain configuration only",
      files: { ".env": "VITE_API_URL=https://api.example.com\nPORT=3000\nFEATURE_FLAG=true\n" },
    },
    {
      name: "secret-looking names with empty or placeholder values",
      files: { ".env": "API_SECRET=\nJWT_SECRET=changeme\nDB_PASSWORD=<your-password>\nTOKEN=${OTHER_TOKEN}\n" },
    },
    {
      name: "without git nothing is committed",
      files: { ".env.local": "API_SECRET=abcdef123456\n" },
      git: false,
    },
    {
      name: "a local env file that exists but is not tracked",
      files: { ".env.local": "API_SECRET=abcdef123456\n" },
      untracked: [".env.local"],
    },
  ],
  invalid: [
    {
      name: "tracked .env.local, whatever it contains",
      files: { ".env.local": "VITE_API_URL=http://localhost:3000\n" },
      findings: [{ file: ".env.local", line: 1 }],
    },
    {
      name: "tracked .env.production.local with a secret points at the secret",
      files: { ".env.production.local": "# keys\nPORT=3000\nSTRIPE_SECRET_KEY=abc123def456\n" },
      findings: [{ file: ".env.production.local", line: 3 }],
    },
    {
      name: "tracked .env with a secret value",
      files: { ".env": "VITE_API_URL=https://api.example.com\nJWT_SECRET=s3cr3t-value-123\n" },
      findings: [{ file: ".env", line: 2 }],
    },
    {
      name: "a bare API_KEY and a database URL with credentials in .env.production",
      files: { ".env.production": "API_KEY=abc123def456\nDATABASE_URL=postgres://app:hunter2@db.internal/prod\n" },
      findings: [{ file: ".env.production", line: 1 }],
    },
    {
      name: "a value in a known secret format under an innocent name",
      files: { ".env.staging": "BILLING=sk_live_4eC39HqLyjWDarjtT1zdp7dc\n" },
      findings: [{ file: ".env.staging", line: 1 }],
    },
    {
      name: "env files in a sub-directory and several findings",
      files: {
        "apps/web/.env": "AUTH_TOKEN=abcdef123456\n",
        "apps/api/.env.local": "PORT=1\n",
        ".env.example": "AUTH_TOKEN=\n",
      },
      findings: [
        { file: "apps/api/.env.local", line: 1 },
        { file: "apps/web/.env", line: 1 },
      ],
    },
  ],
};

export default cases;
