import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { load, resolve } from "./kitchen.mjs";
import { labelsFor as labelsForKitchen, owned, relabel as relabelForKitchen } from "./pr-labels.mjs";

const KITCHEN = resolve({
  repo: "someone/app",
  humans: { default: "someone" },
  adapters: {
    db: { use: "some-orm", paths: ["packages/db/src/schema.ts", "packages/db/src/schema/**", "packages/db/migrations/**"] },
    evidenceHost: { use: "bucket", embedPrefixes: ["https://shots.example.org/bucket/"] },
  },
});
const LABELS = owned(KITCHEN);
const labelsFor = (change) => labelsForKitchen(change, KITCHEN);
const relabel = (current, change) => relabelForKitchen(current, change, KITCHEN);

const SHOT = "https://shots.example.org/bucket/431/after/word.png";

describe("labelsFor", () => {
  it("labels a schema change as a db change", () => {
    assert.deepEqual(
      labelsFor({ paths: ["packages/db/src/schema/video.ts"] }),
      [LABELS.db],
    );
    assert.deepEqual(labelsFor({ paths: ["packages/db/src/schema.ts"] }), [
      LABELS.db,
    ]);
  });

  it("labels a generated migration as a db change", () => {
    assert.deepEqual(
      labelsFor({ paths: ["packages/db/migrations/0007_add_quiz_streak.sql"] }),
      [LABELS.db],
    );
    assert.deepEqual(
      labelsFor({ paths: ["packages/db/migrations/meta/_journal.json"] }),
      [LABELS.db],
    );
  });

  it("labels no db change for a db adapter that names no schema paths", () => {
    const bare = resolve({ repo: "someone/app", humans: { default: "someone" } });
    assert.deepEqual(labelsForKitchen({ paths: ["packages/db/migrations/0007_x.sql"] }, bare), []);
  });

  it("leaves the db client and the pre-squash archive unlabelled", () => {
    assert.deepEqual(
      labelsFor({
        paths: [
          "packages/db/src/client.ts",
          "packages/db/src/migrations/0042_old.sql",
        ],
      }),
      [],
    );
  });

  it("labels anything that changes how the agents run as a skill change", () => {
    for (const path of [
      ".claude/skills/find-work/SKILL.md",
      ".claude/kitchen/scripts/receipt.mjs",
      ".claude/BLOCKERS.md",
      "docs/agents/pr-format.md",
      "CLAUDE.md",
    ])
      assert.deepEqual(labelsFor({ paths: [path] }), [LABELS.skill], path);
  });

  it("leaves other docs unlabelled", () => {
    assert.deepEqual(
      labelsFor({ paths: ["docs/adr/0010-receipts.md", "README.md"] }),
      [],
    );
  });

  it("labels a body naming another PR it depends on", () => {
    const body =
      "| What | Before | After |\n\nDepends on: #242, #245\nNext · merge\n\nCloses #69";
    assert.deepEqual(labelsFor({ body }), [LABELS.depends]);
  });

  it("does not read a Dependencies footer or a blocked Next as a dependency", () => {
    const body = "Dependencies: #245 needs #242\nNext · blocked #128";
    assert.deepEqual(labelsFor({ body }), []);
  });

  it("labels a body carrying a shot as evidence, bare or rendered", () => {
    assert.deepEqual(labelsFor({ body: `| Word modal | ${SHOT} |` }), [
      LABELS.evidence,
    ]);
    assert.deepEqual(labelsFor({ body: `<img src="${SHOT}" width="320">` }), [
      LABELS.evidence,
    ]);
  });

  it("labels a body carrying a shot hosted on an evidence branch as evidence", () => {
    const sha = "a".repeat(40);
    const shot = `https://github.com/someone/app/blob/${sha}/945/home-after.png?raw=true`;
    assert.deepEqual(labelsFor({ body: `<img src="${shot}" width="320">` }), [
      LABELS.evidence,
    ]);
  });

  it("does not count another repo's blob as evidence", () => {
    const sha = "a".repeat(40);
    const shot = `https://github.com/someone/else/blob/${sha}/945/home-after.png?raw=true`;
    assert.deepEqual(labelsFor({ body: shot }), []);
  });

  it("does not count a shot from another host as evidence", () => {
    assert.deepEqual(labelsFor({ body: "https://example.com/after.png" }), []);
  });

  it("does not count a bot footer's image as evidence", () => {
    const footer = `<a href="https://ci.example.com"><img src="https://ci.example.com/logo.png"></a>`;
    assert.deepEqual(labelsFor({ body: footer }), []);
  });

  it("counts no bucket shot when the evidence host lists no prefix", () => {
    const bare = resolve({ repo: "someone/app", humans: { default: "someone" } });
    assert.deepEqual(labelsForKitchen({ body: SHOT }, bare), []);
  });

  it("does not count a link that is not an image as evidence", () => {
    assert.deepEqual(labelsFor({ body: "https://example.com/after.html" }), []);
  });

  it("labels every axis a PR touches at once", () => {
    assert.deepEqual(
      labelsFor({
        paths: [
          "packages/db/migrations/0007_x.sql",
          ".claude/skills/evidence/SKILL.md",
        ],
        body: `Depends on: #242\n${SHOT}`,
      }),
      [LABELS.db, LABELS.skill, LABELS.depends, LABELS.evidence],
    );
  });
});

describe("relabel", () => {
  it("keeps every label it does not own", () => {
    assert.deepEqual(
      relabel(["urgent", "native-change"], { paths: ["CLAUDE.md"] }),
      ["urgent", "native-change", LABELS.skill],
    );
  });

  it("drops an owned label the change no longer earns", () => {
    assert.deepEqual(
      relabel(["ready-for-human", LABELS.db, LABELS.depends], {
        paths: ["src/app/index.tsx"],
      }),
      ["ready-for-human"],
    );
  });

  it("never writes a label twice", () => {
    assert.deepEqual(relabel([LABELS.skill], { paths: ["CLAUDE.md"] }), [
      LABELS.skill,
    ]);
  });
});

describe("the kitchen config", () => {
  it("names each label from kitchen.labels", () => {
    const kitchen = resolve({
      repo: "someone/app",
      humans: { default: "someone" },
      labels: { dbChange: "schema", skillChange: "agents", dependsOnPr: "stacked", evidence: "shots" },
    });
    assert.deepEqual(owned(kitchen), {
      db: "schema",
      skill: "agents",
      depends: "stacked",
      evidence: "shots",
    });
    assert.deepEqual(
      labelsForKitchen({ paths: ["CLAUDE.md"], body: "Depends on: #1" }, kitchen),
      ["agents", "stacked"],
    );
  });

  it("counts an evidence-branch shot only on kitchen.repo", () => {
    const sha = "b".repeat(40);
    const shot = `https://github.com/other/repo/blob/${sha}/1/a.png?raw=true`;
    const kitchen = resolve({ repo: "other/repo", humans: { default: "someone" } });
    assert.deepEqual(labelsForKitchen({ body: shot }, kitchen), [owned(kitchen).evidence]);
    assert.deepEqual(labelsFor({ body: shot }), []);
  });

  it("reads .claude/kitchen.json when no config is given", () => {
    const kitchen = load();
    assert.deepEqual(labelsForKitchen({ paths: ["CLAUDE.md"] }), [kitchen.labels.skillChange]);
    assert.deepEqual(relabelForKitchen([], { paths: ["CLAUDE.md"] }), [kitchen.labels.skillChange]);
  });
});
