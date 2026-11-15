import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import net from "node:net";
import { describe, it } from "node:test";

import { FAKE_SERVER, freePort, sandbox } from "./adapter-sandbox.mjs";
import { load } from "./kitchen.mjs";

const real = load().adapters.stack;

const PNPM = `#!/bin/sh
echo "$PORT $PWD $*" >>"$STUB_LOG"
[ -z "$STUB_DIE" ] || { echo "boom: next could not start" >&2; exit 1; }
exec node "$STUB_SERVER"
`;

async function project(settings = {}, packageManager) {
  const port = await freePort();
  const sandboxed = sandbox({ adapters: { stack: { ...real, port, ...settings } }, packageManager });
  sandboxed.shim(packageManager ?? "pnpm", PNPM);
  sandboxed.write("stub-server.cjs", FAKE_SERVER);
  sandboxed.write(".env.example", "AUTH_SECRET=placeholder\n");
  const env = { STUB_SERVER: sandboxed.path("stub-server.cjs"), READY_TIMEOUT: "20" };
  return { sandboxed, port, env, up: (extra = {}) => sandboxed.dispatch(["stack", "up"], { env: { ...env, ...extra } }), down: () => sandboxed.dispatch(["stack", "down"], { env }) };
}

const answers = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });

describe("stack trpc-next", () => {
  it("up prints API_URL=<url> on stdout and nothing else", async () => {
    const { up, down, port } = await project();
    try {
      const run = up();
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, `API_URL=http://localhost:${port}\n`);
      assert.ok(await answers(port));
    } finally {
      down();
    }
  });

  it("starts the app once, from the repo root, with the configured filter on the port it printed", async () => {
    const { sandboxed, up, down, port } = await project();
    try {
      assert.equal(up().status, 0);
      const [line, ...rest] = sandboxed.log();
      assert.deepEqual(rest, []);
      const [seenPort, cwd, ...args] = line.split(" ");
      assert.equal(seenPort, String(port));
      assert.equal(realpathSync(cwd), realpathSync(sandboxed.root));
      assert.deepEqual(args, ["exec", "turbo", "run", "dev", "-F", real.filter, "--continue"]);
    } finally {
      down();
    }
  });

  it("up is idempotent: a second call prints the same URL and starts nothing", async () => {
    const { sandboxed, up, down } = await project();
    try {
      const first = up();
      const second = up();
      assert.equal(second.status, 0, second.stderr);
      assert.equal(second.stdout, first.stdout);
      assert.equal(sandboxed.log().length, 1);
    } finally {
      down();
    }
  });

  it("takes the next free port when the one it was given is taken", async () => {
    const { up, down, port } = await project();
    const holder = net.createServer().listen(port, "127.0.0.1");
    await new Promise((resolve) => holder.once("listening", resolve));
    try {
      const run = up();
      assert.equal(run.status, 0, run.stderr);
      assert.notEqual(run.stdout.trim(), `API_URL=http://localhost:${port}`);
      assert.match(run.stdout, /^API_URL=http:\/\/localhost:\d+\n$/);
    } finally {
      down();
      holder.close();
    }
  });

  it("copies .env.example to .env when there is none, and says so", async () => {
    const { sandboxed, up, down } = await project();
    try {
      const run = up();
      assert.match(run.stderr, /\.env/);
      assert.equal(readFileSync(sandboxed.path(".env"), "utf8"), "AUTH_SECRET=placeholder\n");
    } finally {
      down();
    }
  });

  it("leaves an existing .env alone", async () => {
    const { sandboxed, up, down } = await project();
    sandboxed.write(".env", "KEEP=me\n");
    try {
      up();
      assert.equal(readFileSync(sandboxed.path(".env"), "utf8"), "KEEP=me\n");
    } finally {
      down();
    }
  });

  it("records the URL and the log where the drive and the docs look for them", async () => {
    const { sandboxed, up, down, port } = await project();
    try {
      up();
      assert.equal(readFileSync(sandboxed.path(".claude/tmp/dev-server.api.url"), "utf8").trim(), `http://localhost:${port}`);
      assert.ok(existsSync(sandboxed.path(".claude/tmp/dev-server.log")));
    } finally {
      down();
    }
  });

  it("down stops it, forgets its URL, and is quiet when nothing is running", async () => {
    const { sandboxed, up, down, port } = await project();
    assert.equal(up().status, 0);
    const stopped = down();
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.equal(await answers(port), false);
    assert.equal(existsSync(sandboxed.path(".claude/tmp/dev-server.api.url")), false);
    assert.equal(down().status, 0);
  });

  it("up fails and shows the log's tail when the app dies before it answers", async () => {
    const { up, down } = await project();
    try {
      const run = up({ STUB_DIE: "1" });
      assert.notEqual(run.status, 0);
      assert.equal(run.stdout, "");
      assert.match(run.stderr, /exited before answering/);
    } finally {
      down();
    }
  });

  it("without a filter, runs the app's own dev script from its directory", async () => {
    const { sandboxed, up, down } = await project({ filter: "" });
    sandboxed.write(`${real.dir}/.keep`, "");
    try {
      assert.equal(up().status, 0);
      const [, cwd, ...args] = sandboxed.log()[0].split(" ");
      assert.equal(realpathSync(cwd), realpathSync(sandboxed.path(real.dir)));
      assert.deepEqual(args, ["run", "dev"]);
    } finally {
      down();
    }
  });

  it("with npm, separates the command from npm's own flags with `--`", async () => {
    const { sandboxed, up, down } = await project({}, "npm");
    try {
      assert.equal(up().status, 0);
      const [, , ...args] = sandboxed.log()[0].split(" ");
      assert.deepEqual(args, ["exec", "--", "turbo", "run", "dev", "-F", real.filter, "--continue"]);
    } finally {
      down();
    }
  });

  it("with bun, runs it through bunx", async () => {
    const { sandboxed, up, down } = await project({}, "bun");
    sandboxed.shim("bunx", PNPM);
    try {
      assert.equal(up().status, 0);
      const [, , ...args] = sandboxed.log()[0].split(" ");
      assert.deepEqual(args, ["turbo", "run", "dev", "-F", real.filter, "--continue"]);
    } finally {
      down();
    }
  });
});
