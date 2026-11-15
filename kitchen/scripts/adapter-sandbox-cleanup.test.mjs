import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

const SANDBOX = new URL("./adapter-sandbox.mjs", import.meta.url).href;

const aliveWithin = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const runChild = (body) =>
  spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { sandbox } from ${JSON.stringify(SANDBOX)};
import { spawn } from "node:child_process";
${body}`,
    ],
    { encoding: "utf8" },
  );

test("a sandbox's directory is gone once the process that made it exits", () => {
  const result = runChild(`const box = sandbox(); console.log(box.root);`);
  assert.equal(result.status, 0, result.stderr);
  const root = result.stdout.trim();
  assert.match(root, /adapter-sandbox-/);
  assert.equal(existsSync(root), false);
});

test("a server left running under a sandbox is stopped when the process that made it exits", async () => {
  const result = runChild(`const box = sandbox();
box.write("stub-server.cjs", "setInterval(() => {}, 1000);");
const child = spawn("node", [box.path("stub-server.cjs")], { detached: true, stdio: "ignore" });
child.unref();
console.log(String(child.pid));`);
  assert.equal(result.status, 0, result.stderr);
  const pid = Number(result.stdout.trim());
  assert.ok(pid > 0, `the child printed ${JSON.stringify(result.stdout)}`);
  for (let waited = 0; aliveWithin(pid) && waited < 3000; waited += 100) await sleep(100);
  const survived = aliveWithin(pid);
  if (survived) process.kill(pid, "SIGKILL");
  assert.equal(survived, false);
});

test("a sandbox's directory is also removed when its process is told to stop", async () => {
  const result = runChild(`const box = sandbox(); console.log(box.root); process.kill(process.pid, "SIGTERM"); await new Promise(() => {});`);
  const root = result.stdout.trim();
  assert.match(root, /adapter-sandbox-/);
  assert.equal(existsSync(root), false);
});
