import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { FAKE_SERVER, freePort, logLine, sandbox, stubAdapter } from "./adapter-sandbox.mjs";
import { installSupabase, startApi } from "./supabase-stub.mjs";

const PNPM = `#!/bin/sh
case "$1" in
install) echo "install $*" >>"$STUB_LOG"; mkdir -p node_modules; exit 0 ;;
esac
echo "metro" >>"$STUB_LOG"
exec node "$STUB_SERVER" "$@"
`;

const seen = (...names) => names.map((name) => `${name}=$${name}`).join(" ");

async function project({ adapters = {}, install = false } = {}) {
  const webPort = await freePort();
  const sandboxed = sandbox({
    adapters: { stack: "probe", db: "probe", auth: "probe", ...adapters },
    expo: { appDir: "web-app", webPort },
  });
  stubAdapter(sandboxed, "db", "probe", {
    prepare: `${logLine("db prepare")}\n[ -z "$STUB_DB_FAILS" ] || exit 1\necho POSTGRES_URL=local-db\n[ -z "$STUB_DB_LINE" ] || echo "$STUB_DB_LINE"`,
    down: logLine("db down"),
    migrate: "exit 0",
    pending: "exit 0",
    apply: "exit 0",
  });
  stubAdapter(sandboxed, "auth", "probe", {
    seed: `${logLine(`auth seed ${seen("POSTGRES_URL", "MONGODB_URL")}`)}\necho AUTH_DEV_LOGIN=1`,
    "sign-in": logLine(`auth sign-in ${seen("AUTH_DEV_LOGIN")}`),
  });
  stubAdapter(sandboxed, "stack", "probe", {
    up: `${logLine(`stack up ${seen("POSTGRES_URL", "MONGODB_URL", "AUTH_DEV_LOGIN")}`)}\necho API_URL=http://localhost:4999`,
    down: logLine("stack down"),
  });
  if (adapters.db) {
    stubAdapter(sandboxed, "db", adapters.db, {
      prepare: `${logLine(`${adapters.db} prepare`)}\necho POSTGRES_URL=local-db`,
      down: "exit 0",
      migrate: "exit 0",
      pending: "exit 0",
      apply: "exit 0",
    });
  }
  sandboxed.shim("pnpm", PNPM);
  sandboxed.write("stub-server.cjs", FAKE_SERVER);
  sandboxed.write("web-app/.keep", "");
  if (!install) mkdirSync(sandboxed.path("node_modules"));
  const env = { STUB_SERVER: sandboxed.path("stub-server.cjs"), READY_TIMEOUT: "20" };
  const script = sandboxed.path(".claude/kitchen/scripts/session-up.sh");
  const hook = (name, body) => sandboxed.write(`.claude/session-up.d/${name}`, `#!/bin/sh\n${body}\n`, 0o755);
  return {
    sandboxed,
    webPort,
    hook,
    up: (extra = {}) => sandboxed.run(script, ["up"], { env: { ...env, ...extra } }),
    down: (extra = {}) => sandboxed.run(script, ["down"], { env: { ...env, ...extra } }),
  };
}

describe("the core session-up.sh", () => {
  it("runs the adapters in the order the stack needs them, and prints the web URL alone", async () => {
    const { sandboxed, up, down, webPort } = await project();
    try {
      const run = up();
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, `http://localhost:${webPort}\n`);
      assert.deepEqual(
        sandboxed.log().map((line) => line.split(" ").slice(0, 2).join(" ")),
        ["db prepare", "auth seed", "stack down", "stack up", "metro", "auth sign-in"],
      );
    } finally {
      down();
    }
  });

  it("restarts the servers on every up", async () => {
    const { sandboxed, up, down } = await project();
    try {
      up();
      up();
      assert.equal(sandboxed.log().filter((line) => line === "stack down").length, 2);
      assert.equal(sandboxed.log().filter((line) => line.startsWith("stack up")).length, 2);
    } finally {
      down();
    }
  });

  it("re-prepares the database on every up, since a Before checkout can predate a table", async () => {
    const { sandboxed, up, down } = await project();
    try {
      up();
      up();
      assert.equal(sandboxed.log().filter((line) => line === "db prepare").length, 2);
    } finally {
      down();
    }
  });

  it("exports what each adapter prints to the ones after it, because the container's own URLs are unreachable", async () => {
    const { sandboxed, hook, up, down } = await project();
    hook("10-dictionary", 'echo MONGODB_URL=local-mongo');
    try {
      assert.equal(up().status, 0);
      const log = sandboxed.log();
      assert.ok(log.includes("auth seed POSTGRES_URL=local-db MONGODB_URL=local-mongo"), log.join("\n"));
      assert.ok(log.includes("stack up POSTGRES_URL=local-db MONGODB_URL=local-mongo AUTH_DEV_LOGIN=1"), log.join("\n"));
      assert.ok(log.includes("auth sign-in AUTH_DEV_LOGIN=1"), log.join("\n"));
    } finally {
      down();
    }
  });

  it("installs dependencies first when node_modules is missing, and only then", async () => {
    const missing = await project({ install: true });
    try {
      missing.up();
      assert.equal(missing.sandboxed.log()[0], "install install --frozen-lockfile");
    } finally {
      missing.down();
    }
    const present = await project();
    try {
      present.up();
      assert.equal(present.sandboxed.log().some((line) => line.startsWith("install")), false);
    } finally {
      present.down();
    }
  });

  it("runs the adapter kitchen.json names for each slot", async () => {
    const { sandboxed, up, down } = await project({ adapters: { db: "other" } });
    try {
      up();
      assert.ok(sandboxed.log().includes("other prepare"), sandboxed.log().join("\n"));
    } finally {
      down();
    }
  });

  it("stops at the first adapter that fails, naming it", async () => {
    const { sandboxed, up } = await project();
    const run = up({ STUB_DB_FAILS: "1" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /db prepare/);
    assert.deepEqual(sandboxed.log(), ["db prepare"]);
  });

  describe("the project's hook door", () => {
    it("runs each executable in .claude/session-up.d, in name order, after the database and before the seed", async () => {
      const { sandboxed, hook, up, down } = await project();
      hook("20-second", logLine("hook second $1"));
      hook("10-first", logLine("hook first $1"));
      sandboxed.write(".claude/session-up.d/05-not-executable", `#!/bin/sh\n${logLine("hook not-run")}\n`);
      try {
        assert.equal(up().status, 0);
        assert.deepEqual(
          sandboxed.log().filter((line) => /^(db prepare|hook|auth seed)/.test(line.split(" POSTGRES")[0])).map((l) => l.split(" POSTGRES")[0]),
          ["db prepare", "hook first up", "hook second up", "auth seed"],
        );
      } finally {
        down();
      }
    });

    it("fails the session when a hook does, before the seed", async () => {
      const { sandboxed, hook, up } = await project();
      hook("10-broken", "echo no dictionary >&2; exit 3");
      const run = up();
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /10-broken/);
      assert.equal(sandboxed.log().some((line) => line.startsWith("auth seed")), false);
    });

    it("is fine with no hooks at all", async () => {
      const { up, down } = await project();
      try {
        assert.equal(up().status, 0);
      } finally {
        down();
      }
    });

    it("passes the environment through, SESSION_UP_NO_DICTIONARY included", async () => {
      const { sandboxed, hook, up, down } = await project();
      hook("10-env", 'echo "hook env ${SESSION_UP_NO_DICTIONARY:-unset}" >>"$STUB_LOG"');
      try {
        up({ SESSION_UP_NO_DICTIONARY: "1" });
        assert.ok(sandboxed.log().includes("hook env 1"));
      } finally {
        down();
      }
    });
  });

  describe("a printed line that would change how the next command runs", () => {
    const REFUSED = [
      "PATH", "BASH_ENV", "ENV", "NODE_OPTIONS", "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES",
      "DYLD_LIBRARY_PATH", "IFS", "SHELL", "HOME", "UID", "EUID", "PPID", "SHELLOPTS", "BASHOPTS",
    ];

    for (const name of REFUSED) {
      it(`${name}= from an adapter fails the step, naming the adapter and the line, and nothing after it runs`, async () => {
        const { sandboxed, up } = await project();
        const run = up({ STUB_DB_LINE: `${name}=/somewhere` });
        assert.notEqual(run.status, 0, run.stdout);
        assert.match(run.stderr, /db prepare/);
        assert.ok(run.stderr.includes(`${name}=/somewhere`), run.stderr);
        assert.equal(sandboxed.log().some((line) => line.startsWith("auth seed")), false);
      });

      it(`${name}= from a hook fails the step, naming the hook and the line, before the seed`, async () => {
        const { sandboxed, hook, up } = await project();
        hook("10-env", `echo ${name}=/somewhere`);
        const run = up();
        assert.notEqual(run.status, 0, run.stdout);
        assert.match(run.stderr, /10-env/);
        assert.ok(run.stderr.includes(`${name}=/somewhere`), run.stderr);
        assert.equal(sandboxed.log().some((line) => line.startsWith("auth seed")), false);
      });
    }

    it("still exports a name that only starts like a refused one", async () => {
      const { sandboxed, hook, up, down } = await project();
      hook("10-near", "echo LDAP_URL=ldap\necho HOME_URL=h\necho PATHS=p\necho ENVIRONMENT=e\necho lower=case\necho 'not a line'");
      try {
        const run = up();
        assert.equal(run.status, 0, run.stderr);
        assert.doesNotMatch(run.stderr, /refus/i);
      } finally {
        down();
      }
    });
  });

  describe("down", () => {
    it("stops the hooks in reverse, then the servers, then the database", async () => {
      const { sandboxed, hook, down } = await project();
      hook("10-first", logLine("hook first $1"));
      hook("20-second", logLine("hook second $1"));
      const run = down();
      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(sandboxed.log(), ["hook second down", "hook first down", "stack down", "db down"]);
    });
  });

  it("refuses a verb it does not know", async () => {
    const { sandboxed } = await project();
    const run = sandboxed.run(sandboxed.path(".claude/kitchen/scripts/session-up.sh"), ["sideways"]);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /usage/);
  });
});

describe("the core session-up.sh with every slot none", () => {
  it("stands the Expo web server up with no API, and leaves a valid empty session behind", async () => {
    const webPort = await freePort();
    const sandboxed = sandbox({
      adapters: { stack: "none", db: "none", auth: "none" },
      expo: { appDir: "web-app", webPort, apiUrlEnv: "APP_API_URL" },
    });
    sandboxed.shim("pnpm", '#!/bin/sh\necho "metro api=${APP_API_URL-unset}" >>"$STUB_LOG"\nexec node "$STUB_SERVER" "$@"\n');
    sandboxed.write("stub-server.cjs", FAKE_SERVER);
    sandboxed.write("web-app/.keep", "");
    mkdirSync(sandboxed.path("node_modules"));
    const env = { STUB_SERVER: sandboxed.path("stub-server.cjs"), READY_TIMEOUT: "20" };
    const script = sandboxed.path(".claude/kitchen/scripts/session-up.sh");
    try {
      const run = sandboxed.run(script, ["up"], { env });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, `http://localhost:${webPort}\n`);
      assert.deepEqual(sandboxed.log(), ["metro api=unset"]);
      assert.deepEqual(JSON.parse(readFileSync(sandboxed.path(".claude/tmp/auth.json"), "utf8")), { cookies: [], origins: [] });
    } finally {
      assert.equal(sandboxed.run(script, ["down"], { env }).status, 0);
    }
  });
});

describe("the core session-up.sh with the supabase stack and auth over a db that does not start the stack", () => {
  for (const db of ["none", "postgres-drizzle"]) {
    it(`db ${db}: seeds the account, which starts the stack, then runs the servers and signs in`, async () => {
      const api = await startApi();
      const webPort = await freePort();
      const sandboxed = sandbox({
        adapters: { stack: "supabase-local", db, auth: "supabase-auth" },
        expo: { appDir: "web-app", webPort, apiUrlEnv: "APP_API_URL" },
      });
      if (db === "postgres-drizzle") {
        stubAdapter(sandboxed, "db", "postgres-drizzle", {
          prepare: `${logLine("db prepare")}\necho POSTGRES_URL=local-db`,
          down: "exit 0",
          migrate: "exit 0",
          pending: "exit 0",
          apply: "exit 0",
        });
      }
      const stub = installSupabase(sandboxed);
      sandboxed.shim("pnpm", '#!/bin/sh\necho metro >>"$STUB_LOG"\nexec node "$STUB_SERVER" "$@"\n');
      sandboxed.write("stub-server.cjs", FAKE_SERVER);
      sandboxed.write("web-app/.keep", "");
      mkdirSync(sandboxed.path("node_modules"));
      const env = stub.env({ STUB_API_URL: api.url, STUB_SERVER: sandboxed.path("stub-server.cjs"), READY_TIMEOUT: "20" });
      const script = sandboxed.path(".claude/kitchen/scripts/session-up.sh");
      try {
        const run = await sandboxed.runAsync(script, ["up"], { env });
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, `http://localhost:${webPort}\n`);
        const log = sandboxed.log();
        assert.ok(log.includes("supabase start"), log.join("\n"));
        assert.ok(log.indexOf("supabase start") < log.indexOf("metro"), log.join("\n"));
        assert.deepEqual(JSON.parse(readFileSync(sandboxed.path(".claude/tmp/dev-user.json"), "utf8")), { email: "dev@example.test", password: "dev-password" });
        assert.equal(JSON.parse(readFileSync(sandboxed.path(".claude/tmp/auth.json"), "utf8")).origins.length, 1);
      } finally {
        await sandboxed.runAsync(script, ["down"], { env });
        await api.close();
      }
    });
  }
});
