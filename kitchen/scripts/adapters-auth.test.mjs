import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { after, before, describe, it } from "node:test";

import { sandbox } from "./adapter-sandbox.mjs";
import { load } from "./kitchen.mjs";

const real = load().adapters.auth;
const FIXTURE = JSON.stringify({ email: "dev@fixture.test", password: "pw-from-fixture" });

const PNPM = `#!/bin/sh
echo "pnpm $* AUTH_DEV_LOGIN=$AUTH_DEV_LOGIN DEV_SEED_DB_HOST=$DEV_SEED_DB_HOST SUFFIX=$DEV_SEED_SUFFIX" >>"$STUB_LOG"
[ -z "$STUB_SEED_FAILS" ] || { echo "seed refused" >&2; exit 1; }
case "$*" in
*--email*) echo "noise"; echo "dev+${"$"}{DEV_SEED_SUFFIX:-none}@seeded.test" ;;
*) echo "seeded the account" ;;
esac
`;

function seeding() {
  const sandboxed = sandbox();
  sandboxed.shim("pnpm", PNPM);
  sandboxed.write(real.fixture, FIXTURE);
  sandboxed.write(".env.example", "AUTH_SECRET=placeholder\n");
  return {
    sandboxed,
    seed: (env = {}) => sandboxed.dispatch(["auth", "seed"], { env: { POSTGRES_URL: "postgresql://postgres:postgres@localhost:5432/app", ...env } }),
  };
}

describe("auth better-auth: seed", () => {
  it("runs the project's seed script with the dev-login flag on, and asks it for the account's email", () => {
    const { sandboxed, seed } = seeding();
    const run = seed();
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(sandboxed.log(), [
      `pnpm run ${real.seedScript} AUTH_DEV_LOGIN=1 DEV_SEED_DB_HOST=localhost SUFFIX=`,
      `pnpm run ${real.seedScript} --email AUTH_DEV_LOGIN=1 DEV_SEED_DB_HOST=localhost SUFFIX=`,
    ]);
  });

  it("writes .claude/tmp/dev-user.json with that email and the fixture's password", () => {
    const { sandboxed, seed } = seeding();
    seed();
    assert.deepEqual(JSON.parse(readFileSync(sandboxed.path(".claude/tmp/dev-user.json"), "utf8")), {
      email: "dev+none@seeded.test",
      password: "pw-from-fixture",
    });
  });

  it("follows a per-run suffix and a password override from the environment", () => {
    const { sandboxed, seed } = seeding();
    seed({ DEV_SEED_SUFFIX: "18342", AUTH_DEV_LOGIN_PASSWORD: "override" });
    assert.deepEqual(JSON.parse(readFileSync(sandboxed.path(".claude/tmp/dev-user.json"), "utf8")), {
      email: "dev+18342@seeded.test",
      password: "override",
    });
  });

  it("prints the variables the servers need on stdout, and nothing else", () => {
    const { seed } = seeding();
    assert.equal(seed().stdout, "AUTH_DEV_LOGIN=1\nDEV_SEED_DB_HOST=localhost\n");
  });

  it("does not claim a database is local when POSTGRES_URL names a hosted one", () => {
    const { sandboxed, seed } = seeding();
    const run = seed({ POSTGRES_URL: "postgresql://u:p@db.hosted.example:5432/app", DEV_SEED_DB_HOST: "" });
    assert.equal(run.stdout, "AUTH_DEV_LOGIN=1\n");
    assert.match(sandboxed.log()[0], /DEV_SEED_DB_HOST= /);
  });

  it("writes the flag into .env, once, whatever it ran before", () => {
    const { sandboxed, seed } = seeding();
    seed();
    seed();
    assert.deepEqual(readFileSync(sandboxed.path(".env"), "utf8").trim().split("\n"), [
      "AUTH_SECRET=placeholder",
      "AUTH_DEV_LOGIN='1'",
      "DEV_SEED_DB_HOST='localhost'",
    ]);
  });

  it("fails without writing a credential when the seed refuses", () => {
    const { sandboxed, seed } = seeding();
    const run = seed({ STUB_SEED_FAILS: "1" });
    assert.notEqual(run.status, 0);
    assert.equal(existsSync(sandboxed.path(".claude/tmp/dev-user.json")), false);
  });
});

describe("auth better-auth: sign-in", () => {
  let server;
  let api;
  let seen;
  let mode = "ok";

  before(async () => {
    server = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        seen.push({ method: request.method, url: request.url, body, cookie: request.headers.cookie });
        if (request.url === "/api/auth/sign-in/email") {
          if (mode === "disabled") {
            response.writeHead(400, { "content-type": "application/json" });
            return response.end(JSON.stringify({ code: "EMAIL_AND_PASSWORD_IS_NOT_ENABLED" }));
          }
          if (mode === "wrong") {
            response.writeHead(401);
            return response.end("invalid email or password");
          }
          const headers = mode === "no-cookie" ? {} : { "set-cookie": ["better-auth.session_token=abc%2Fdef; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax", "other=1; Path=/api"] };
          response.writeHead(200, { "content-type": "application/json", ...headers });
          return response.end("{}");
        }
        if (request.url === "/api/auth/get-session") {
          response.writeHead(200, { "content-type": "application/json" });
          return response.end(mode === "no-session" ? "null" : JSON.stringify({ user: { id: "u" } }));
        }
        response.writeHead(404);
        response.end();
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    api = `http://localhost:${server.address().port}`;
  });

  after(() => server.close());

  const signIn = (sandboxed, args = [], env = {}) => {
    seen = [];
    mode = env.MODE ?? "ok";
    return sandboxed.dispatchAsync(["auth", "sign-in", "--api-url", api, ...args], { env });
  };

  function signedUp() {
    const sandboxed = sandbox();
    sandboxed.write(real.fixture, FIXTURE);
    return sandboxed;
  }

  it("writes a Playwright storageState to .claude/tmp/auth.json and prints its path", async () => {
    const sandboxed = signedUp();
    const run = await signIn(sandboxed);
    assert.equal(run.status, 0, run.stderr);
    const out = sandboxed.path(".claude/tmp/auth.json");
    assert.equal(run.stdout.trim(), out);
    const state = JSON.parse(readFileSync(out, "utf8"));
    assert.deepEqual(state.origins, []);
    const token = state.cookies.find((cookie) => cookie.name === "better-auth.session_token");
    assert.equal(token.value, "abc/def");
    assert.equal(token.domain, "localhost");
    assert.equal(token.path, "/");
    assert.equal(token.httpOnly, true);
    assert.equal(token.sameSite, "Lax");
    assert.ok(token.expires > Date.now() / 1000);
    assert.equal(state.cookies.find((cookie) => cookie.name === "other").path, "/api");
  });

  it("signs in with the fixture's credentials when no seed has run", async () => {
    const sandboxed = signedUp();
    await signIn(sandboxed);
    assert.deepEqual(JSON.parse(seen[0].body), { email: "dev@fixture.test", password: "pw-from-fixture" });
  });

  it("prefers what the seed wrote to the fixture, and the environment to both", async () => {
    const sandboxed = signedUp();
    sandboxed.write(".claude/tmp/dev-user.json", JSON.stringify({ email: "dev+7@seeded.test", password: "seeded-pw" }));
    await signIn(sandboxed);
    assert.deepEqual(JSON.parse(seen[0].body), { email: "dev+7@seeded.test", password: "seeded-pw" });
    await signIn(sandboxed, [], { AUTH_DEV_LOGIN_EMAIL: "dev+9@env.test", AUTH_DEV_LOGIN_PASSWORD: "env-pw" });
    assert.deepEqual(JSON.parse(seen[0].body), { email: "dev+9@env.test", password: "env-pw" });
  });

  it("takes the email to sign in as, and where to write the state, from its arguments", async () => {
    const sandboxed = signedUp();
    const out = sandboxed.path("second.json");
    const run = await signIn(sandboxed, ["--email", "dev+second@example.test", "--out", out]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(seen[0].body).email, "dev+second@example.test");
    assert.ok(existsSync(out));
    assert.equal(existsSync(sandboxed.path(".claude/tmp/auth.json")), false);
  });

  it("verifies the cookie against get-session before saving it", async () => {
    const sandboxed = signedUp();
    await signIn(sandboxed);
    const check = seen.find((request) => request.url === "/api/auth/get-session");
    assert.match(check.cookie, /better-auth\.session_token=abc\/def/);
  });

  it("finds the API where the stack recorded it when --api-url is not given", async () => {
    const sandboxed = signedUp();
    sandboxed.write(".claude/tmp/dev-server.api.url", `${api}\n`);
    seen = [];
    mode = "ok";
    const run = await sandboxed.dispatchAsync(["auth", "sign-in"]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(seen[0].url, "/api/auth/sign-in/email");
  });

  it("says the server has no headless sign-in path, and how to give it one", async () => {
    const run = await signIn(signedUp(), [], { MODE: "disabled" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /no headless sign-in path/);
    assert.match(run.stderr, /AUTH_DEV_LOGIN=1/);
  });

  it("reports the status and body of a refused sign-in", async () => {
    const run = await signIn(signedUp(), [], { MODE: "wrong" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /sign-in failed with 401: invalid email or password/);
  });

  it("refuses a sign-in that sets no cookie", async () => {
    const sandboxed = signedUp();
    const run = await signIn(sandboxed, [], { MODE: "no-cookie" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /set no cookie/);
    assert.equal(existsSync(sandboxed.path(".claude/tmp/auth.json")), false);
  });

  it("refuses a cookie that does not resolve to a session, saving nothing", async () => {
    const sandboxed = signedUp();
    const run = await signIn(sandboxed, [], { MODE: "no-session" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /does not resolve to a session/);
    assert.equal(existsSync(sandboxed.path(".claude/tmp/auth.json")), false);
  });

  it("refuses an app on another host than the API, since a cookie is not sent across them", async () => {
    const run = await signIn(signedUp(), ["--app-url", "http://example.org:8081"]);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /differs from --api-url host/);
    assert.deepEqual(seen, []);
  });
});
