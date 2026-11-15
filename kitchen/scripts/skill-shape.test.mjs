import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkShape, readSkill, UNATTENDED } from "./skill-shape.mjs";

describe("every unattended skill takes the template's shape", () => {
  for (const name of UNATTENDED) {
    it(name, () => {
      const problems = checkShape(name, readSkill(name));
      assert.deepEqual(problems, [], `${name}: ${problems.join("; ")}`);
    });
  }
});

describe("checkShape", () => {
  const shaped = [
    "---",
    "name: demo",
    "description: A demo skill.",
    "---",
    "",
    "## 1. Look",
    "",
    "Done when you have looked.",
    "",
    "## 2. Leap",
    "",
    "Done when you have leapt.",
    "",
    "## Stuck",
    "",
    "[BLOCKERS.md](../../BLOCKERS.md) · [BLOCKERS.core.md](../../kitchen/docs/BLOCKERS.core.md)",
    "",
    "## Output",
    "",
    "`done`",
    "",
  ].join("\n");

  it("passes a skill that matches", () =>
    assert.deepEqual(checkShape("demo", shaped), []));

  it("catches a step with no criterion", () =>
    assert.ok(
      checkShape("demo", shaped.replace("Done when you have leapt.", "Leap.")).some(
        (p) => p.includes("step 2"),
      ),
    ));

  it("catches a gap in the numbering", () =>
    assert.ok(
      checkShape("demo", shaped.replace("## 2. Leap", "## 3. Leap")).some((p) =>
        p.includes("numbered 3"),
      ),
    ));

  it("catches a missing blockers pointer", () =>
    assert.ok(
      checkShape("demo", shaped.replace("[BLOCKERS.md](../../BLOCKERS.md)", "Ask.")).some(
        (p) => p.includes("BLOCKERS"),
      ),
    ));

  it("catches a pointer to this repo's blockers alone", () =>
    assert.ok(
      checkShape(
        "demo",
        shaped.replace(" · [BLOCKERS.core.md](../../kitchen/docs/BLOCKERS.core.md)", ""),
      ).some((p) => p.includes("BLOCKERS.core.md")),
    ));

  it("catches a missing output", () =>
    assert.ok(
      checkShape("demo", shaped.replace("## Output", "## Ending")).some((p) =>
        p.includes("Output"),
      ),
    ));

  it("catches a step that writes an ISO time with no clock read", () =>
    assert.ok(
      checkShape(
        "demo",
        shaped.replace("Done when you have looked.", "`Claimed · 2026-09-27T08:45Z`\n\nDone when you have looked."),
      ).some((p) => p.includes("date -u")),
    ));

  it("catches a clock read that comes after the time it should have set", () =>
    assert.ok(
      checkShape(
        "demo",
        shaped.replace(
          "Done when you have looked.",
          "`Claimed · 2026-09-27T08:45:00+00:00`\n\nRun `date -u`.\n\nDone when you have looked.",
        ),
      ).some((p) => p.includes("date -u")),
    ));

  it("does not take `update -u` for a clock read", () =>
    assert.ok(
      checkShape(
        "demo",
        shaped.replace(
          "Done when you have looked.",
          "Run `update -u`.\n\n`Claimed · 2026-09-27T08:45Z`\n\nDone when you have looked.",
        ),
      ).some((p) => p.includes("date -u")),
    ));

  it("passes a step that reads the clock before writing the time", () =>
    assert.deepEqual(
      checkShape(
        "demo",
        shaped.replace(
          "Done when you have looked.",
          "Run `date -u +%Y-%m-%dT%H:%MZ`.\n\n`Claimed · 2026-09-27T08:45Z`\n\nDone when you have looked.",
        ),
      ),
      [],
    ));
});
