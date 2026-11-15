import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { format, owner, parse, readHumans, title } from "./blocked.mjs";

const blocker = {
  key: "secrets:expo-token",
  stopped: "evidence",
  error: "`eas whoami` → Not logged in",
  tried: "BLOCKERS native row · no EXPO_TOKEN in env",
  next: "add EXPO_TOKEN to the environment's secrets",
};

describe("format", () => {
  it("writes the header, then one bullet a field", () =>
    assert.equal(
      format(blocker),
      [
        "🧱 **Blocked** · `secrets:expo-token`",
        "",
        "- **Stopped at** · evidence",
        "- **Error** · `eas whoami` → Not logged in",
        "- **Tried** · BLOCKERS native row · no EXPO_TOKEN in env",
        "- **Next** · add EXPO_TOKEN to the environment's secrets",
        "",
      ].join("\n"),
    ));

  it("leaves out a field it was not given", () =>
    assert.doesNotMatch(format(blocker), /Human/));

  it("refuses a key that is not area:slug", () =>
    assert.throws(() => format({ ...blocker, key: "EXPO token" })));

  it("refuses a blocker with no next step", () =>
    assert.throws(() => format({ ...blocker, next: "" })));
});

describe("parse", () => {
  it("reads back what format wrote", () =>
    assert.deepEqual(parse(format(blocker)), {
      ...blocker,
      area: "secrets",
      issue: null,
      blocks: [],
      human: null,
    }));

  it("reads the blocker issue as a number", () =>
    assert.equal(parse(format({ ...blocker, issue: "#612" })).issue, 612));

  it("reads every PR the issue blocks", () =>
    assert.deepEqual(parse(format({ ...blocker, blocks: "#431, #445" })).blocks, [431, 445]));

  it("reads the human issue as a number", () =>
    assert.equal(parse(format({ ...blocker, human: "#560" })).human, 560));

  it("rejects a comment with no header", () =>
    assert.equal(parse("- **Stopped at** · evidence\n- **Next** · x"), null));

  it("rejects a comment missing Next", () =>
    assert.equal(parse("🧱 **Blocked** · `code:x`\n\n- **Stopped at** · evidence\n"), null));
});

describe("title", () => {
  it("names the blocker issue after its key", () =>
    assert.equal(title("secrets:expo-token"), "🧱 secrets:expo-token"));

  it("refuses a key that is not area:slug", () => assert.throws(() => title("EXPO token")));
});

describe("owner", () => {
  const humans = { default: "someone", areas: { billing: "payer" } };

  it("takes the area's handle", () =>
    assert.equal(owner("billing:actions", humans), "@payer"));

  it("falls back to the default for an unlisted area", () =>
    assert.equal(owner("code:flaky-selector", humans), "@someone"));

  it("kitchen.json names a default owner", () =>
    assert.match(readHumans().default, /^[A-Za-z0-9-]+$/));
});
