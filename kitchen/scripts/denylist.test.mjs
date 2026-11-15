import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { denylist } from "./kitchen.mjs";
import { ROOT } from "./layout.mjs";

const KITCHEN = new URL("../", import.meta.url);

const listFile = (text) => {
  const path = join(mkdtempSync(join(tmpdir(), "denylist-")), "kitchen-denylist.txt");
  if (text !== undefined) writeFileSync(path, text);
  return new URL(`file://${path}`);
};

describe("a project's denylist", () => {
  it("is empty when the project has not written one", () => {
    assert.deepEqual(denylist(listFile()), []);
  });

  it("is empty when the file is", () => {
    assert.deepEqual(denylist(listFile("")), []);
  });

  it("keeps one lowercase literal a line and drops blanks", () => {
    assert.deepEqual(denylist(listFile("Acme\n\n  Widget Co  \n")), ["acme", "widget co"]);
  });
});

describe("the kitchen names no project", () => {
  const literals = denylist();

  const files = readdirSync(KITCHEN, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => fileURLToPath(new URL(entry.name, `file://${entry.parentPath}/`)));

  for (const file of files) {
    it(`${relative(ROOT, file)} carries nothing from kitchen-denylist.txt`, () => {
      const text = readFileSync(file, "utf8").toLowerCase();
      assert.deepEqual(
        literals.filter((literal) => text.includes(literal)),
        [],
      );
    });
  }
});
