import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseArgs } from "./capture-args.mjs";

const base = ["--url", "http://x/", "--out", "o.png"];

describe("parseArgs", () => {
  it("collects repeatable --act values in order", () => {
    const args = parseArgs([...base, "--act", "add:open", "--act", "go:analysis"]);
    assert.deepEqual(args.act, ["add:open", "go:analysis"]);
  });

  it("keeps --click by text beside --act", () => {
    const args = parseArgs([...base, "--click", "Continue", "--act", "a:b"]);
    assert.deepEqual(args.click, ["Continue"]);
    assert.deepEqual(args.act, ["a:b"]);
  });

  it("splits --local-storage on the first equals only", () => {
    const args = parseArgs([
      ...base,
      "--local-storage",
      "app.theme=dark",
      "--local-storage",
      "k=a=b",
    ]);
    assert.deepEqual(args.localStorage, [
      ["app.theme", "dark"],
      ["k", "a=b"],
    ]);
  });

  it("rejects --local-storage without a key or an equals", () => {
    assert.throws(() => parseArgs([...base, "--local-storage", "novalue"]));
    assert.throws(() => parseArgs([...base, "--local-storage", "=v"]));
  });

  it("takes --color-scheme light, dark or no-preference", () => {
    assert.equal(parseArgs([...base, "--color-scheme", "dark"]).colorScheme, "dark");
    assert.throws(() => parseArgs([...base, "--color-scheme", "sepia"]));
  });

  it("leaves colorScheme unset by default", () => {
    assert.equal(parseArgs(base).colorScheme, undefined);
  });

  it("defaults to the phone viewport and --desktop switches it", () => {
    const phone = parseArgs(base);
    assert.deepEqual([phone.width, phone.height, phone.mobile], [390, 844, true]);
    const desktop = parseArgs([...base, "--desktop"]);
    assert.deepEqual([desktop.width, desktop.height, desktop.mobile], [1440, 900, false]);
  });

  it("requires --url and --out", () => {
    assert.throws(() => parseArgs(["--out", "o.png"]));
  });

  it("rejects an unknown argument", () => {
    assert.throws(() => parseArgs([...base, "--bogus", "1"]), /unknown argument/);
  });
});
