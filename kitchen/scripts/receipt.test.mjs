import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { format, parse } from "./receipt.mjs";

const POSTED = "https://github.com/someone/app/pull/431#issuecomment-1";

describe("parse", () => {
  it("reads a clean pass", () =>
    assert.deepEqual(parse(`done · 0 found · ${POSTED}`), {
      verdict: "done",
      found: 0,
      fixed: 0,
      open: 0,
      reason: "",
      url: POSTED,
    }));

  it("reads a partial fix", () =>
    assert.deepEqual(parse(`findings · 3 found, 2 fixed, 1 open · ${POSTED}`), {
      verdict: "findings",
      found: 3,
      fixed: 2,
      open: 1,
      reason: "",
      url: POSTED,
    }));

  it("reads a blocker's reason", () =>
    assert.deepEqual(parse(`blocked · no verification bucket · ${POSTED}`), {
      verdict: "blocked",
      found: 0,
      fixed: 0,
      open: 0,
      reason: "no verification bucket",
      url: POSTED,
    }));

  it("takes the last line, so a phase may narrate above it", () =>
    assert.equal(parse(`I looked at everything.\n\ndone · 0 found · ${POSTED}`)?.verdict, "done"));

  it("refuses a verdict it does not know", () =>
    assert.equal(parse(`green · 0 found · ${POSTED}`), null));

  it("refuses a receipt with no url", () =>
    assert.equal(parse("done · 0 found"), null));

  it("refuses prose", () => assert.equal(parse("Everything went fine!"), null));

  it("refuses findings that do not add up", () =>
    assert.equal(parse(`findings · 3 found, 2 fixed, 2 open · ${POSTED}`), null));
});

describe("format", () => {
  it("round-trips a pass", () => {
    const line = format({ verdict: "done", found: 0, url: POSTED });
    assert.equal(line, `done · 0 found · ${POSTED}`);
    assert.equal(parse(line)?.verdict, "done");
  });

  it("round-trips findings", () => {
    const line = format({ verdict: "findings", found: 3, fixed: 2, open: 1, url: POSTED });
    assert.equal(line, `findings · 3 found, 2 fixed, 1 open · ${POSTED}`);
    assert.deepEqual(parse(line)?.open, 1);
  });

  it("round-trips a blocker", () => {
    const line = format({ verdict: "blocked", reason: "no verification bucket", url: POSTED });
    assert.equal(line, `blocked · no verification bucket · ${POSTED}`);
    assert.equal(parse(line)?.reason, "no verification bucket");
  });

  it("refuses to format a blocker with no reason", () =>
    assert.throws(() => format({ verdict: "blocked", url: POSTED })));
});
