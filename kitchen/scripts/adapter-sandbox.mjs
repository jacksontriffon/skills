import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REAL = fileURLToPath(new URL("../../../", import.meta.url));

const PLUMBING = [
  "bash", "sh", "node", "git", "sed", "grep", "cat", "cp", "mkdir", "dirname", "basename", "env", "rm",
  "date", "tail", "head", "tr", "sleep", "setsid", "kill", "ls", "touch", "mktemp", "curl", "pgrep", "chmod", "sort", "wc", "id",
];

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const which = (name) => execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim();

// A stub server started under a sandbox is detached, so nothing but its path on the command
// line ties it to the test that started it.
const roots = new Set();

function removeRoots() {
  for (const root of roots) {
    spawnSync("pkill", ["-f", "--", `${root}/`], { stdio: "ignore" });
    rmSync(root, { recursive: true, force: true });
  }
  roots.clear();
}

process.on("exit", removeRoots);
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.on(signal, () => process.exit(code));
}

export function sandbox({ adapters = {}, expo = {}, files = {}, isolated = false, packageManager } = {}) {
  const root = mkdtempSync(join(tmpdir(), "adapter-sandbox-"));
  roots.add(root);
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "t");
  git("config", "user.email", "t@example.com");
  mkdirSync(join(root, ".claude"), { recursive: true });
  cpSync(join(REAL, ".claude/kitchen"), join(root, ".claude/kitchen"), { recursive: true });
  const real = JSON.parse(readFileSync(join(REAL, ".claude/kitchen.json"), "utf8"));
  const config = {
    ...real,
    expo: { ...real.expo, ...expo },
    adapters: { ...real.adapters, ...adapters },
    ...(packageManager ? { packageManager } : {}),
  };
  writeFileSync(join(root, ".claude/kitchen.json"), JSON.stringify(config, null, 2));

  const bin = join(root, ".shims");
  mkdirSync(bin);
  let pathDirs = [bin];
  if (isolated) {
    const base = join(root, ".plumbing");
    mkdirSync(base);
    for (const name of PLUMBING) symlinkSync(which(name), join(base, name));
    pathDirs.push(base);
  } else {
    pathDirs.push(process.env.PATH);
  }

  const write = (path, body, mode) => {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
    if (mode) chmodSync(full, mode);
    return full;
  };
  for (const [path, body] of Object.entries(files)) write(path, body, path.startsWith("bin/") ? 0o755 : undefined);

  const env = (extra = {}) => ({
    ...process.env,
    PATH: pathDirs.join(":"),
    STUB_LOG: join(root, "stub.log"),
    ...extra,
  });

  return {
    root,
    config,
    write,
    shim: (name, body) => write(`.shims/${name}`, body, 0o755),
    env,
    path: (...parts) => join(root, ...parts),
    log: () => {
      try {
        return readFileSync(join(root, "stub.log"), "utf8").trim().split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
    run: (command, args = [], { env: extra = {}, cwd = root } = {}) =>
      spawnSync(command, args, { cwd, encoding: "utf8", env: env(extra) }),
    runAsync: (command, args = [], { env: extra = {}, cwd = root } = {}) =>
      new Promise((resolve) => {
        const child = spawn(command, args, { cwd, env: env(extra) });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("close", (status) => resolve({ status, stdout, stderr }));
      }),
    dispatch(args, options) {
      return this.run("node", [join(root, ".claude/kitchen/scripts/adapter.mjs"), ...args], options);
    },
    dispatchAsync(args, options) {
      return this.runAsync("node", [join(root, ".claude/kitchen/scripts/adapter.mjs"), ...args], options);
    },
  };
}

export const FAKE_SERVER = `const http = require("node:http");
const port = Number(process.env.PORT || process.argv[process.argv.indexOf("--port") + 1]);
http.createServer((request, response) => response.end("ok")).listen(port, "127.0.0.1");
`;

export const stubAdapter = (sandboxed, slot, name, actions) => {
  for (const [action, body] of Object.entries(actions)) {
    sandboxed.write(
      `.claude/kitchen/adapters/${slot}/${name}/${action}`,
      `#!/bin/sh\n${body}\n`,
      0o755,
    );
  }
};

export const logLine = (text) => `echo "${text}" >>"$STUB_LOG"`;
