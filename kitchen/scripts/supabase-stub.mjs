import { createServer } from "node:http";

export const KEYS = {
  anon: "eyJanon.payload.sig",
  service: "eyJservice.payload.sig",
  publishable: "sb_publishable_stub",
  secret: "sb_secret_stub",
};

// What `supabase status -o env` prints on a running stack: values quoted, one per line.
const CLI = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const state = process.env.STUB_SUPABASE_STATE;
const running = () => fs.existsSync(state);
const out = (text) => process.stdout.write(text + "\\n");
fs.appendFileSync(process.env.STUB_LOG, ["supabase", ...args].join(" ") + "\\n");
fs.appendFileSync(process.env.STUB_CWD_LOG, process.cwd() + "\\n");

const [command, sub] = args;
if (command === "status") {
  if (!running()) { console.error("supabase start is not running."); process.exit(1); }
  const quote = process.env.STUB_STATUS_UNQUOTED ? (value) => value : (value) => '"' + value + '"';
  const rows = [
    ["API_URL", process.env.STUB_API_URL],
    ["DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"],
    ["STUDIO_URL", "http://127.0.0.1:54323"],
    ["ANON_KEY", "${KEYS.anon}"],
    ["SERVICE_ROLE_KEY", "${KEYS.service}"],
  ];
  if (process.env.STUB_NEW_KEYS) rows.push(["PUBLISHABLE_KEY", "${KEYS.publishable}"], ["SECRET_KEY", "${KEYS.secret}"]);
  if (process.env.STUB_ONLY_NEW_KEYS) rows.splice(3, 2, ["PUBLISHABLE_KEY", "${KEYS.publishable}"], ["SECRET_KEY", "${KEYS.secret}"]);
  for (const [key, value] of rows) out(key + "=" + quote(value));
} else if (command === "start") {
  if (process.env.STUB_START_FAILS) { console.error("Cannot connect to the Docker daemon"); process.exit(1); }
  out("Started supabase local development setup.");
  fs.writeFileSync(state, "");
} else if (command === "stop") {
  out("Stopped supabase local development setup.");
  fs.rmSync(state, { force: true });
} else if (command === "db" && sub === "reset") {
  if (!running()) { console.error("supabase start is not running."); process.exit(1); }
  out("Resetting local database...");
  out("Finished supabase db reset on branch main.");
} else if (command === "migration" && sub === "new") {
  const dir = path.join(process.cwd(), "supabase/migrations");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, (process.env.STUB_MIGRATION_TS || "20260101000000") + "_" + args[2] + ".sql");
  fs.writeFileSync(file, "");
  out("Created new migration at " + path.relative(process.cwd(), file));
} else {
  console.error("unexpected: supabase " + args.join(" "));
  process.exit(3);
}
`;

export function installSupabase(sandboxed, { running = false } = {}) {
  sandboxed.shim("supabase", CLI);
  const state = sandboxed.path(".supabase-running");
  if (running) sandboxed.write(".supabase-running", "");
  return {
    state,
    env: (extra = {}) => ({
      STUB_SUPABASE_STATE: state,
      STUB_CWD_LOG: sandboxed.path("stub.cwd"),
      STUB_API_URL: "http://127.0.0.1:54321",
      ...extra,
    }),
  };
}

const json = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

// Answers the slice of GoTrue the adapter talks to, and records every request it sees.
export async function startApi({ keys = KEYS } = {}) {
  const users = new Map();
  const seen = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const url = new URL(request.url, "http://stub");
      const payload = body ? JSON.parse(body) : {};
      seen.push({ method: request.method, path: url.pathname, query: url.search, headers: request.headers, body: payload });
      const key = request.headers.apikey;
      if (![keys.anon, keys.service, keys.publishable, keys.secret].includes(key)) {
        return json(response, 401, { message: "No API key found in request" });
      }
      const admin = [keys.service, keys.secret].includes(key);
      const bearer = request.headers.authorization?.replace(/^Bearer /, "");
      const adminAllowed = admin && (!key.startsWith("eyJ") || bearer === key);

      if (url.pathname === "/auth/v1/admin/users" && request.method === "POST") {
        if (!adminAllowed) return json(response, 403, { msg: "User not allowed" });
        if ([...users.values()].some((user) => user.email === payload.email)) {
          return json(response, 422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
        }
        const user = { id: `id-${users.size + 1}`, email: payload.email, password: payload.password, confirmed: payload.email_confirm === true };
        users.set(user.id, user);
        return json(response, 200, { id: user.id, email: user.email });
      }
      if (url.pathname === "/auth/v1/admin/users" && request.method === "GET") {
        if (!adminAllowed) return json(response, 403, { msg: "User not allowed" });
        return json(response, 200, { users: [...users.values()].map(({ id, email }) => ({ id, email })) });
      }
      const update = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
      if (update && request.method === "PUT") {
        if (!adminAllowed) return json(response, 403, { msg: "User not allowed" });
        const user = users.get(update[1]);
        if (!user) return json(response, 404, { msg: "User not found" });
        Object.assign(user, { password: payload.password ?? user.password, confirmed: payload.email_confirm ?? user.confirmed });
        return json(response, 200, { id: user.id });
      }
      if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
        const user = [...users.values()].find((candidate) => candidate.email === payload.email && candidate.password === payload.password);
        if (!user) return json(response, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return json(response, 200, {
          access_token: `access-for-${user.id}`,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 1900000000,
          refresh_token: "refresh-1",
          user: { id: user.id, email: user.email },
        });
      }
      if (url.pathname === "/auth/v1/user") {
        const user = [...users.values()].find((candidate) => bearer === `access-for-${candidate.id}`);
        if (!user) return json(response, 401, { msg: "invalid JWT" });
        return json(response, 200, { id: user.id, email: user.email });
      }
      return json(response, 404, { msg: "not found" });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    port: server.address().port,
    seen,
    users,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
