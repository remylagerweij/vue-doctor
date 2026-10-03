import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "parameterized SQL query",
      filename: "server/api/users.ts",
      code: `export const getUser = async (db, id) => {
  return db.query("SELECT * FROM users WHERE id = $1", [id]);
};
`,
    },
    {
      name: "execFile with argument array and no shell",
      filename: "server/utils/git.ts",
      code: `import { execFile } from "node:child_process";
export const runGit = (hash) => {
  execFile("git", ["show", hash], (err, stdout) => {});
};
`,
    },
    {
      name: "spawn with arguments and shell: false",
      filename: "server/utils/process.ts",
      code: `import { spawn } from "child_process";
export const start = (file) => {
  spawn("node", [file], { shell: false });
};
`,
    },
    {
      name: "static SQL string query",
      filename: "server/api/stats.ts",
      code: `export const getStats = (db) => {
  return db.query("SELECT count(*) FROM users");
};
`,
    },
    {
      name: "constant in template query",
      filename: "server/api/query.ts",
      code: `const TABLE = "users";
export const list = (db) => {
  return db.query(\`SELECT * FROM \${TABLE}\`);
};
`,
    },
  ],
  invalid: [
    {
      name: "interpolated SQL query with request input",
      filename: "server/api/search.ts",
      code: `export default defineEventHandler((event) => {
  const query = getQuery(event);
  return db.query(\`SELECT * FROM items WHERE name = '\${query.q}'\`);
});
`,
    },
    {
      name: "exec with interpolated dynamic string",
      filename: "server/api/convert.ts",
      code: `import { exec } from "child_process";
export const convert = (filename) => {
  exec(\`convert \${filename} output.png\`);
};
`,
    },
    {
      name: "Prisma executeRawUnsafe with dynamic query",
      filename: "server/api/raw.ts",
      code: `export const run = (prisma, userQuery) => {
  return prisma.$executeRawUnsafe(userQuery);
};
`,
    },
    {
      name: "spawn with shell: true and interpolated command",
      filename: "server/api/task.ts",
      code: `import { spawn } from "node:child_process";
export const runTask = (cmd) => {
  spawn(\`bash -c "\${cmd}"\`, { shell: true });
};
`,
    },
  ],
};

export default cases;
