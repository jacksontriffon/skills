import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import net from "node:net";
import { describe, it } from "node:test";

import { FAKE_SERVER, freePort, logLine, sandbox, stubAdapter } from "./adapter-sandbox.mjs";

const METRO = `#!/bin/sh
echo "metro $PWD $* api=$STUB_API_ENV" >>"$STUB_LOG"
exec node "$STUB_SERVER" "$@"
`;

async function project() {
  const webPort = await freePort();
  const sandboxed = sandbox({
    adapters: { stack: "probe" },
    expo: { appDir: "web-app", webPort, apiUrlEnv: "APP_API_URL" },
  });
  stubAdapter(sandboxed, "stack", "probe", {
    up: `${logLine("stack up")}\n[ -z "$STUB_STACK_FAILS" ] || exit 1\necho API_URL=http://localhost:4999\n[ -z "$STUB_STACK_LINE" ] || echo "$STUB_STACK_LINE"`,
    down: logLine("stack down"),
  });
  sandboxed.shim("pnpm", METRO.replace("api=$STUB_API_ENV", "api=$APP_API_URL"));
  sandboxed.write("stub-server.cjs", FAKE_SERVER);
  sandboxed.write("web-app/.keep", "");
  const env = { STUB_SERVER: sandboxed.path("stub-server.cjs"), READY_TIMEOUT: "20" };
  const script = sandboxed.path(".claude/kitchen/scripts/dev-server.sh");
  const call = (verb, extra = {}) => sandboxed.run(script, [verb], { env: { ...env, ...extra } });
  return { sandboxed, webPort, call };
}

const answers = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });

describe("the core dev-server.sh refuses a stack line that would change how Metro runs", () => {
  const REFUSED = [
    "PATH", "BASH_ENV", "ENV", "NODE_OPTIONS", "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH", "IFS", "SHELL", "HOME", "UID", "EUID", "PPID", "SHELLOPTS", "BASHOPTS",
  ];

  for (const name of REFUSED) {
    it(`${name}= fails start, naming stack up and the line, and Metro never starts`, async () => {
      const { sandboxed, call } = await project();
      const run = call("start", { STUB_STACK_LINE: `${name}=/somewhere` });
      assert.notEqual(run.status, 0, run.stdout);
      assert.match(run.stderr, /stack up/);
      assert.ok(run.stderr.includes(`${name}=/somewhere`), run.stderr);
      assert.equal(sandboxed.log().some((line) => line.startsWith("metro ")), false);
      call("stop");
    });
  }

  it("still starts when a name only starts like a refused one", async () => {
    const { call } = await project();
    try {
      const run = call("start", { STUB_STACK_LINE: "LDAP_URL=ldap" });
      assert.equal(run.status, 0, run.stderr);
    } finally {
      call("stop");
    }
  });
});

describe("the core dev-server.sh", () => {
  it("start prints the web URL on stdout and nothing else", async () => {
    const { call, webPort } = await project();
    try {
      const run = call("start");
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, `http://localhost:${webPort}\n`);
    } finally {
      call("stop");
    }
  });

  it("gets the API URL from `stack up` and hands it to Metro under the configured name, in the configured app directory", async () => {
    const { sandboxed, call, webPort } = await project();
    try {
      call("start");
      const metro = sandboxed.log().find((line) => line.startsWith("metro "));
      const [, cwd, ...rest] = metro.split(" ");
      assert.equal(realpathSync(cwd), realpathSync(sandboxed.path("web-app")));
      assert.deepEqual(rest, ["exec", "expo", "start", "--web", "--port", String(webPort), "api=http://localhost:4999"]);
    } finally {
      call("stop");
    }
  });

  it("start is idempotent: a Metro already up is reported, not restarted, and the API is not asked again", async () => {
    const { sandboxed, call } = await project();
    try {
      const first = call("start");
      const second = call("start");
      assert.equal(second.stdout, first.stdout);
      assert.equal(sandboxed.log().filter((line) => line === "stack up").length, 1);
      assert.equal(sandboxed.log().filter((line) => line.startsWith("metro ")).length, 1);
    } finally {
      call("stop");
    }
  });

  it("url prints the URL of the Metro started here", async () => {
    const { call } = await project();
    try {
      const started = call("start").stdout;
      assert.equal(call("url").stdout, started);
    } finally {
      call("stop");
    }
  });

  it("stop ends Metro, then the API through `stack down`", async () => {
    const { sandboxed, call, webPort } = await project();
    call("start");
    const stopped = call("stop");
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.equal(await answers(webPort), false);
    assert.equal(existsSync(sandboxed.path(".claude/tmp/dev-server.url")), false);
    assert.equal(sandboxed.log().at(-1), "stack down");
  });

  it("start starts no Metro when the stack will not come up", async () => {
    const { sandboxed, call } = await project();
    const run = call("start", { STUB_STACK_FAILS: "1" });
    assert.notEqual(run.status, 0);
    assert.equal(sandboxed.log().some((line) => line.startsWith("metro ")), false);
  });

  it("records the web URL where the drive looks for it", async () => {
    const { sandboxed, call, webPort } = await project();
    try {
      call("start");
      assert.equal(readFileSync(sandboxed.path(".claude/tmp/dev-server.url"), "utf8").trim(), `http://localhost:${webPort}`);
    } finally {
      call("stop");
    }
  });
});

const REPORTING_METRO = `#!/bin/sh
echo "metro $* api=\${APP_API_URL-unset} key=\${APP_KEY-unset}" >>"$STUB_LOG"
exec node "$STUB_SERVER" "$@"
`;

async function withStack(upBody, { packageManager, runner = "pnpm" } = {}) {
  const webPort = await freePort();
  const sandboxed = sandbox({
    adapters: { stack: "probe" },
    expo: { appDir: "web-app", webPort, apiUrlEnv: "APP_API_URL" },
    packageManager,
  });
  stubAdapter(sandboxed, "stack", "probe", { up: upBody, down: "exit 0" });
  sandboxed.shim(runner, REPORTING_METRO);
  sandboxed.write("stub-server.cjs", FAKE_SERVER);
  sandboxed.write("web-app/.keep", "");
  const env = { STUB_SERVER: sandboxed.path("stub-server.cjs"), READY_TIMEOUT: "20" };
  const script = sandboxed.path(".claude/kitchen/scripts/dev-server.sh");
  return { sandboxed, webPort, call: (verb) => sandboxed.run(script, [verb], { env }) };
}

describe("the core dev-server.sh with a stack that has no API, or more than one thing to say", () => {
  it("starts Metro when `stack up` prints no API_URL, and exports no API URL name to it", async () => {
    const { sandboxed, call, webPort } = await withStack("exit 0");
    try {
      const run = call("start");
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, `http://localhost:${webPort}\n`);
      assert.match(sandboxed.log().find((line) => line.startsWith("metro ")), /api=unset/);
    } finally {
      call("stop");
    }
  });

  it("still fails when `stack up` does", async () => {
    const { sandboxed, call } = await withStack("exit 1");
    assert.notEqual(call("start").status, 0);
    assert.equal(sandboxed.log().some((line) => line.startsWith("metro ")), false);
  });

  it("exports every other NAME=value line `stack up` prints to Metro, and ignores a line that is not one", async () => {
    const { sandboxed, call } = await withStack("echo API_URL=http://localhost:4999\necho APP_KEY=k-123\necho progress...\n");
    try {
      assert.equal(call("start").status, 0);
      assert.match(sandboxed.log().find((line) => line.startsWith("metro ")), /api=http:\/\/localhost:4999 key=k-123$/);
    } finally {
      call("stop");
    }
  });

  it("runs Metro through npm with `--` so npm leaves expo's flags alone", async () => {
    const { sandboxed, call, webPort } = await withStack("exit 0", { packageManager: "npm", runner: "npm" });
    try {
      assert.equal(call("start").status, 0);
      assert.match(sandboxed.log().find((line) => line.startsWith("metro ")), new RegExp(`^metro exec -- expo start --web --port ${webPort} `));
    } finally {
      call("stop");
    }
  });

  it("runs Metro through bunx for bun", async () => {
    const { sandboxed, call, webPort } = await withStack("exit 0", { packageManager: "bun", runner: "bunx" });
    try {
      assert.equal(call("start").status, 0);
      assert.match(sandboxed.log().find((line) => line.startsWith("metro ")), new RegExp(`^metro expo start --web --port ${webPort} `));
    } finally {
      call("stop");
    }
  });
});
