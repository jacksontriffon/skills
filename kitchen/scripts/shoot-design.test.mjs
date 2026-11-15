import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const SCRIPT = new URL("./shoot-design.sh", import.meta.url).pathname;

function shoot(viewport, ...chips) {
  const root = mkdtempSync(join(tmpdir(), "shoot-design-"));
  const log = join(root, "args.log");
  const stub = join(root, "capture.mjs");
  writeFileSync(
    stub,
    `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ") + "\\n");\n`,
  );
  const printed = execFileSync(
    SCRIPT,
    ["WordSheet.dc.html", viewport, join(root, "out"), ...chips],
    { encoding: "utf8", env: { ...process.env, CAPTURE: stub } },
  )
    .trim()
    .split("\n")
    .map((path) => path.replace(`${root}/out/`, ""));
  const calls = readFileSync(log, "utf8").trim().split("\n");
  return { printed, calls };
}

describe("shoot-design.sh", () => {
  it("names a rail chip's shot by its slug and shoots it at desktop", () => {
    const { printed, calls } = shoot("desktop", "06 VIDEO");
    assert.deepEqual(printed, ["06-video-design.png"]);
    assert.match(calls[0], /^--desktop --url http:\/\/localhost:\d+\/WordSheet\.dc\.html --click 06 VIDEO --out /);
  });

  it("clicks each step of a tap path in order, at phone size", () => {
    const { printed, calls } = shoot("phone", "Library > Words");
    assert.deepEqual(printed, ["library-words-design.png"]);
    assert.match(calls[0], /^--url \S+ --click Library --click Words --out /);
  });

  it("shoots one file per chip", () => {
    const { printed } = shoot("desktop", "A", "B");
    assert.deepEqual(printed, ["a-design.png", "b-design.png"]);
  });
});

describe("shoot-design.sh in a repo of its own", () => {
  it("shoots the export from the design folder kitchen.json names", () => {
    const repo = mkdtempSync(join(tmpdir(), "shoot-design-repo-"));
    const scripts = join(repo, ".claude/kitchen/scripts");
    mkdirSync(scripts, { recursive: true });
    for (const file of ["kitchen.mjs", "shoot-design.sh", "design-server.sh"])
      cpSync(new URL(`./${file}`, import.meta.url), join(scripts, file));
    writeFileSync(
      join(repo, ".claude/kitchen.json"),
      JSON.stringify({ repo: "someone/app", humans: { default: "someone" }, design: "designs" }),
    );
    mkdirSync(join(repo, "designs"));
    writeFileSync(join(repo, "designs/Sheet.dc.html"), "<html></html>");
    execFileSync("git", ["init", "-q", repo]);

    const log = join(repo, "args.log");
    const stub = join(repo, "capture.mjs");
    writeFileSync(
      stub,
      `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ") + "\\n");\n`,
    );
    const printed = execFileSync(
      join(scripts, "shoot-design.sh"),
      ["Sheet.dc.html", "phone", join(repo, "out"), "Home"],
      { encoding: "utf8", env: { ...process.env, CAPTURE: stub }, stdio: ["ignore", "pipe", "ignore"] },
    );

    assert.equal(printed.trim(), join(repo, "out/home-design.png"));
    assert.match(readFileSync(log, "utf8"), /--url http:\/\/localhost:\d+\/Sheet\.dc\.html --click Home/);
  });
});
