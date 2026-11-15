import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolve } from "./kitchen.mjs";
import { labelsFor } from "./pr-labels.mjs";
import { ticketNumber } from "./risk.mjs";

const DOC = readFileSync(
  fileURLToPath(new URL("../docs/pr-format.md", import.meta.url)),
  "utf8",
);
const KITCHEN = resolve({ repo: "someone/app", humans: { default: "someone" } });

const fenced = (heading) => {
  const section = DOC.slice(DOC.indexOf(heading));
  return /````markdown\n([\s\S]*?)\n````/.exec(section)?.[1] ?? "";
};

const BODY = fenced("## The body");
const NEEDS_A_HUMAN = fenced("### The needs-a-human block");

const at = (pattern) => BODY.search(pattern);

const rows = (table) =>
  table
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );

describe("the sample body in pr-format.md", () => {
  it("reads Aim, unblocks, what changed, proof, checks, what is left, Next, Closes", () => {
    const order = [
      /^\*\*Aim\*\* /m,
      /^\| Unblocks /m,
      /^\| What\s+\| Before /m,
      /^\| What\s+\| Design /m,
      /^\| Screen\s+\| Differs /m,
      /^\| Phase\s+\| Found /m,
      /^\| Left before merge /m,
      /^Next · /m,
      /^Closes #\d+$/m,
    ].map(at);

    assert.ok(order.every((index) => index >= 0), `a section is missing: ${order}`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });

  it("opens with the Aim and nothing above it", () => {
    assert.ok(BODY.startsWith("**Aim** "));
  });

  it("keeps the Aim to two sentences", () => {
    const aim = BODY.split("\n\n")[0]?.replace("**Aim** ", "") ?? "";
    assert.ok(aim.split(/(?<=[.!?])\s+/).length <= 2, aim);
  });

  it("lists one to five unblocked pieces of work, each linked and eight words or fewer", () => {
    const unblocks = rows(/^\| Unblocks .*(?:\n\|.*)+/m.exec(BODY)?.[0] ?? "");

    assert.ok(unblocks.length >= 1 && unblocks.length <= 5, String(unblocks.length));
    for (const [link, description] of unblocks) {
      assert.match(link, /^#\d+$/);
      assert.ok(description.split(/\s+/).length <= 8, description);
    }
  });

  it("still ends on the lines the scripts read", () => {
    assert.equal(ticketNumber(BODY), 69);
    assert.deepEqual(labelsFor({ body: BODY }, KITCHEN), []);
    assert.ok(
      BODY.trimEnd().endsWith("Next · merge\n\nCloses #69"),
      "Next is second to last and Closes is last",
    );
  });

  it("leaves the six checks rows in order", () => {
    const phases = rows(/^\| Phase\s+\| Found .*(?:\n\|.*)+/m.exec(BODY)?.[0] ?? "").map(
      ([phase]) => phase,
    );
    assert.deepEqual(phases, [
      "build",
      "code review",
      "content review",
      "evidence",
      "design review",
      "risk review",
    ]);
  });
});

describe("the needs-a-human block in pr-format.md", () => {
  it("tags the owner on its first line", () => {
    assert.match(NEEDS_A_HUMAN, /^\*\*Needs a human\*\* · @\S+/);
  });

  it("holds a blocked row and an urgent row", () => {
    const [blocked, urgent] = rows(NEEDS_A_HUMAN).map(([row]) => row);
    assert.match(blocked ?? "", /^evidence · /);
    assert.match(urgent ?? "", /^urgent · /);
  });

  it("names every anchor the skills link to", () => {
    assert.match(DOC, /^### The needs-a-human block$/m);
    assert.ok(!DOC.includes("#the-blocked-block"));
  });
});
