import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FAKE_SERVER, freePort, sandbox } from "./adapter-sandbox.mjs";
import { load } from "./kitchen.mjs";
import { installSupabase, startApi } from "./supabase-stub.mjs";

const real = load().adapters;
const REPO = load().repo;

const PASSWORD_LOGIN = JSON.stringify({ email: "dev@fixture.test", password: "pw-from-fixture" });
const JOURNAL = (tags) =>
  JSON.stringify({ version: "7", dialect: "postgresql", entries: tags.map((tag, idx) => ({ idx, version: "7", when: 1700000000000 + idx, tag, breakpoints: true })) });

const none = (slot) => async () => ({ sandboxed: sandbox({ adapters: { [slot]: "none" } }), env: {}, inert: true, close: async () => {} });

async function stackTrpcNext() {
  const port = await freePort();
  const sandboxed = sandbox({ adapters: { stack: { ...real.stack, port } } });
  sandboxed.shim("pnpm", '#!/bin/sh\nexec node "$STUB_SERVER"\n');
  sandboxed.write("stub-server.cjs", FAKE_SERVER);
  sandboxed.write(".env.example", "AUTH_SECRET=placeholder\n");
  return { sandboxed, env: { STUB_SERVER: sandboxed.path("stub-server.cjs"), READY_TIMEOUT: "20" }, close: async () => {} };
}

async function stackSupabase() {
  const sandboxed = sandbox({ adapters: { stack: "supabase-local" } });
  const stub = installSupabase(sandboxed);
  return { sandboxed, env: stub.env(), close: async () => {} };
}

async function dbDrizzle() {
  const sandboxed = sandbox({ isolated: true });
  const dir = `${real.db.dir}/migrations`;
  sandboxed.write(`${dir}/meta/_journal.json`, JOURNAL(["0000_start"]));
  sandboxed.write(`${dir}/0000_start.sql`, 'CREATE TABLE "a" ("id" serial PRIMARY KEY);\n');
  sandboxed.write(`${real.db.dir}/.keep`, "");
  sandboxed.write(".env.example", "AUTH_SECRET=placeholder\n");
  for (const name of ["pg_ctlcluster", "apt-get"]) sandboxed.shim(name, "#!/bin/sh\nexit 0\n");
  sandboxed.shim("pg_isready", "#!/bin/sh\nexit 0\n");
  sandboxed.shim("su", '#!/bin/sh\ncase "$5" in *pg_database*) echo 1 ;; esac\nexit 0\n');
  sandboxed.shim(
    "pnpm",
    `#!/bin/sh
case "$*" in
*generate*) node -e '
const fs = require("node:fs");
const dir = "${sandboxed.path(dir)}";
const name = process.argv[process.argv.indexOf("--name") + 1];
const journal = JSON.parse(fs.readFileSync(dir + "/meta/_journal.json", "utf8"));
journal.entries.push({ idx: 1, version: "7", when: 1700000000001, tag: "0001_" + name, breakpoints: true });
fs.writeFileSync(dir + "/meta/_journal.json", JSON.stringify(journal));
fs.writeFileSync(dir + "/0001_" + name + ".sql", process.env.STUB_SQL ?? "");
' -- "$@" ;;
esac
`,
  );
  return {
    sandboxed,
    env: {},
    tag: "0000_start",
    expandSql: 'CREATE TABLE "b" ("id" serial);',
    contractSql: 'DROP TABLE "a";',
    migrationWith: (sql) => ({ args: ["--name", "x"], env: { STUB_SQL: sql } }),
    close: async () => {},
  };
}

async function dbSupabase() {
  const sandboxed = sandbox({ adapters: { db: "supabase-migrations" } });
  const stub = installSupabase(sandboxed);
  sandboxed.write("supabase/migrations/20250101000000_start.sql", 'create table a (id serial primary key);\n');
  return {
    sandboxed,
    env: stub.env(),
    tag: "20250101000000_start",
    expandSql: "create table b (id serial);",
    contractSql: "drop table a;",
    migrationWith: (sql) => {
      const file = join(mkdtempSync(join(tmpdir(), "contract-sql-")), "change.sql");
      writeFileSync(file, sql);
      return { args: ["--name", "x", "--sql", file], env: {} };
    },
    close: async () => {},
  };
}

async function authBetterAuth() {
  const requests = [];
  const server = http.createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      requests.push(request.url);
      if (request.url === "/api/auth/sign-in/email") {
        response.writeHead(200, { "set-cookie": ["better-auth.session_token=abc; Path=/; HttpOnly"], "content-type": "application/json" });
        return response.end("{}");
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ user: { id: "u" } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  const sandboxed = sandbox();
  sandboxed.shim("pnpm", '#!/bin/sh\ncase "$*" in *--email*) echo dev@seeded.test ;; esac\n');
  sandboxed.write(real.auth.fixture, PASSWORD_LOGIN);
  sandboxed.write(".env.example", "AUTH_SECRET=placeholder\n");
  const port = server.address().port;
  return {
    sandboxed,
    env: {},
    apiUrl: `http://localhost:${port}`,
    appUrl: "http://localhost:8081",
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function authSupabase() {
  const api = await startApi();
  const sandboxed = sandbox({ adapters: { auth: "supabase-auth" } });
  const stub = installSupabase(sandboxed, { running: true });
  return {
    sandboxed,
    env: stub.env({ STUB_API_URL: api.url }),
    apiUrl: api.url,
    appUrl: "http://localhost:8081",
    close: api.close,
  };
}

async function evidenceGitBranch() {
  const root = mkdtempSync(join(tmpdir(), "contract-evidence-"));
  const origin = join(root, "origin.git");
  const shots = join(root, "shots");
  const sandboxed = sandbox({ adapters: { evidenceHost: "git-branch" } });
  execFileSync("git", ["init", "-q", "--bare", origin], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", `https://github.com/${REPO}`], { cwd: sandboxed.root });
  execFileSync("git", ["config", `url.${origin}.insteadOf`, `https://github.com/${REPO}`], { cwd: sandboxed.root });
  mkdirSync(shots);
  writeFileSync(join(shots, "home-before.png"), "before");
  writeFileSync(join(shots, "home-after.png"), "after");
  return { sandboxed, env: {}, shots, close: async () => {} };
}

export const FIXTURES = {
  stack: { none: none("stack"), "trpc-next": stackTrpcNext, "supabase-local": stackSupabase },
  db: { none: none("db"), "postgres-drizzle": dbDrizzle, "supabase-migrations": dbSupabase },
  auth: { none: none("auth"), "better-auth": authBetterAuth, "supabase-auth": authSupabase },
  evidenceHost: { "git-branch": evidenceGitBranch },
};
