import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PUSH_KEY,
  STALLED_KEY,
  TICKET_WINDOW_MINUTES,
  classify,
  nowFrom,
  release,
  releaseForm,
} from "./claims.mjs";

const NOW = "2026-11-03T04:00:00Z";
const at = (minutesAgo) =>
  new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString().replace(".000Z", "Z");

let nextId = 100;
const claim = (body, { created = 5, updated = created, id = ++nextId } = {}) => ({
  id,
  body,
  created_at: at(created),
  updated_at: at(updated),
});
const driving = (opts) => claim("🤖 **Driving** · #431 · step 5 · 2026-11-03T03:55Z", opts);
const claimed = (opts) => claim("🤖 **Claimed** · #128 · 2026-11-03T03:55Z", opts);
const released = (outcome, opts) =>
  claim(`🤖 **Released** · #431 · ${outcome} · 2026-11-03T03:55Z`, opts);

describe("releaseForm", () => {
  it("reads done", () => assert.equal(releaseForm(released("done")), "done"));
  it("reads a block, with or without its issue", () => {
    assert.equal(releaseForm(released("blocked · #1020")), "blocked");
    assert.equal(releaseForm(released("blocked")), "blocked");
  });
  it("reads a lost race", () => assert.equal(releaseForm(released("lost to 4001")), "lost"));
  it("reads any other stop as reasoned", () => {
    assert.equal(releaseForm(released("stopped before the fix lap: session limited to claude/x")), "reasoned");
    assert.equal(releaseForm(claim("🤖 **Released** · #431 · 2026-11-03T03:55Z")), "reasoned");
  });
  it("reads the time wherever it sits", () =>
    assert.equal(releaseForm(claim("🤖 **Released** · #431 · 2026-11-03T03:55Z · done")), "done"));
  it("reads a fix-top-error release the same way", () =>
    assert.equal(
      releaseForm(claim("🤖 **Released** · error `ab12` · done · 2026-11-03T03:55Z")),
      "done",
    ));
  it("is null for a comment that is not a release", () => {
    assert.equal(releaseForm(driving()), null);
    assert.equal(releaseForm(claim("looks good")), null);
  });
});

describe("a claim", () => {
  it("is live when it was posted and edited minutes ago", () => {
    const [only] = classify([driving({ created: 10, updated: 2 })], { now: NOW }).claims;
    assert.equal(only.state, "live");
  });

  it("is live past 90 minutes of age while each edit keeps it fresh", () => {
    const result = classify([driving({ created: 300, updated: 30 })], { now: NOW });
    assert.equal(result.claims[0].state, "live");
    assert.equal(result.taken, true);
  });

  it("is expired once its last edit is past the window", () => {
    const result = classify([driving({ created: 200, updated: 95 })], { now: NOW });
    assert.equal(result.claims[0].state, "expired");
    assert.equal(result.taken, false);
  });

  it("is still live at the edge of the window", () =>
    assert.equal(
      classify([driving({ created: 200, updated: 90 })], { now: NOW }).claims[0].state,
      "live",
    ));

  it("is expired at 24 hours from creation however fresh its edits", () =>
    assert.equal(
      classify([driving({ created: 24 * 60, updated: 1 })], { now: NOW }).claims[0].state,
      "expired",
    ));

  it("falls back to its creation time when it was never edited", () => {
    const comment = { ...driving({ created: 120 }) };
    delete comment.updated_at;
    assert.equal(classify([comment], { now: NOW }).claims[0].state, "expired");
  });

  it("takes the window a caller asks for", () => {
    const comments = [claimed({ created: 150, updated: 150 })];
    assert.equal(classify(comments, { now: NOW }).claims[0].state, "expired");
    assert.equal(classify(comments, { now: NOW, window: 180 }).claims[0].state, "live");
  });

  it("reads the ticket window by name", () => {
    const comments = [claimed({ created: 150, updated: 150 })];
    assert.equal(classify(comments, { now: NOW, window: "ticket" }).claims[0].state, "live");
    assert.equal(TICKET_WINDOW_MINUTES, 180);
  });

  it("is released once edited to Released, however fresh", () => {
    const result = classify([released("done", { created: 10, updated: 1 })], { now: NOW });
    assert.equal(result.claims[0].state, "released");
    assert.equal(result.taken, false);
  });

  it("counts Claimed and Driving the same", () => {
    assert.equal(classify([claimed()], { now: NOW }).taken, true);
    assert.equal(classify([driving()], { now: NOW }).taken, true);
  });

  it("ignores a comment that is no claim", () => {
    const result = classify([claim("looks good"), claim("🧱 **Blocked** · `a:b`")], { now: NOW });
    assert.deepEqual(result.claims, []);
    assert.equal(result.taken, false);
  });
});

describe("the winner", () => {
  it("is the lowest id among live claims", () => {
    const late = driving({ id: 900, created: 3 });
    const early = driving({ id: 700, created: 6 });
    assert.equal(classify([late, early], { now: NOW }).winner, 700);
  });

  it("skips an expired claim for a later live one", () => {
    const dead = driving({ id: 700, created: 200, updated: 200 });
    const alive = driving({ id: 900, created: 3 });
    assert.equal(classify([dead, alive], { now: NOW }).winner, 900);
  });

  it("is null when nothing is live", () =>
    assert.equal(classify([released("done")], { now: NOW }).winner, null));
});

describe("a stalled PR", () => {
  const stop = (reason, minutesAgo) =>
    claim(`🤖 **Released** · #431 · ${reason} · 2026-11-03T03:55Z`, { created: minutesAgo });

  it("is three reasoned releases, newest three, with nothing live", () => {
    const result = classify(
      [stop("stopped: a", 300), stop("stopped: b", 200), stop("stopped: c", 100)],
      { now: NOW },
    );
    assert.equal(result.stalled, true);
    assert.deepEqual(result.reasons, ["stopped: a", "stopped: b", "stopped: c"]);
  });

  it("is not three when one is done", () =>
    assert.equal(
      classify([stop("stopped: a", 300), stop("done", 200), stop("stopped: c", 100)], { now: NOW }).stalled,
      false,
    ));

  it("is not three when one is a lost race or a block", () => {
    const lost = classify([stop("stopped: a", 300), stop("lost to 4001", 200), stop("stopped: c", 100)], { now: NOW });
    const blocked = classify([stop("stopped: a", 300), stop("blocked · #12", 200), stop("stopped: c", 100)], { now: NOW });
    assert.equal(lost.stalled, false);
    assert.equal(blocked.stalled, false);
  });

  it("is not stalled while the newest claim is live", () =>
    assert.equal(
      classify([stop("stopped: a", 300), stop("stopped: b", 200), driving({ created: 3 })], { now: NOW }).stalled,
      false,
    ));

  it("counts a claim that expired unreleased as a stop, since the run that held it died", () => {
    const result = classify([stop("stopped: a", 300), driving({ created: 250, updated: 200 }), stop("stopped: c", 100)], { now: NOW });
    assert.equal(result.stalled, true);
    assert.equal(result.key, STALLED_KEY);
    assert.deepEqual(result.reasons, ["stopped: a", "expired unreleased · step 5", "stopped: c"]);
  });

  it("reads a claim with no time it can parse as expired, never live forever", () => {
    const result = classify([{ id: 1, body: "🤖 **Driving** · #431 · step 1" }], { now: NOW });
    assert.equal(result.taken, false);
    assert.equal(result.claims[0].state, "expired");
  });

  it("is not stalled with two releases", () =>
    assert.equal(classify([stop("stopped: a", 300), stop("stopped: b", 200)], { now: NOW }).stalled, false));

  it("orders by posting time, not by id", () => {
    const oldest = { ...stop("stopped: a", 300), id: 999 };
    const middle = { ...stop("stopped: b", 200), id: 1 };
    const newest = { ...stop("stopped: c", 100), id: 5 };
    assert.deepEqual(classify([oldest, middle, newest], { now: NOW }).reasons, [
      "stopped: a",
      "stopped: b",
      "stopped: c",
    ]);
  });

  it("is keyed to the refused push when every reason says so", () => {
    const result = classify(
      [
        stop("stopped after code review: fix lap needs a push to claude/other", 300),
        stop("stopped before the fix lap: session limited to claude/x", 200),
        stop("stopped before the fix lap: session limited to claude/x", 100),
      ],
      { now: NOW },
    );
    assert.equal(result.key, PUSH_KEY);
  });

  it("is keyed to infra:drive-stalled when a reason mentions a push that is not the PR's branch", () => {
    for (const reason of [
      "push-shots.sh failed to push to evidence/1",
      "could not push shots, 403",
      "stopped: no push needed but CI red",
      "push-shots.sh refused to push to evidence/1",
      "push to evidence/1 refused",
    ]) {
      const result = classify([stop(reason, 300), stop(reason, 200), stop(reason, 100)], { now: NOW });
      assert.equal(result.key, STALLED_KEY, reason);
    }
  });

  it("is keyed to infra:drive-stalled when any reason is something else", () => {
    const result = classify(
      [stop("stopped: a push was refused", 300), stop("stopped: check red", 200), stop("stopped: a push was refused", 100)],
      { now: NOW },
    );
    assert.equal(result.key, STALLED_KEY);
  });

  it("has no key when it is not stalled", () =>
    assert.equal(classify([driving()], { now: NOW }).key, null));
});

describe("now", () => {
  it("is the posting time of the claim just written, GitHub's clock", () => {
    const mine = driving({ id: 4242, created: 7 });
    assert.equal(nowFrom([claim("x"), mine], 4242), at(7));
  });

  it("is read from that claim when classify is given its id", () => {
    const mine = driving({ id: 4242, created: 7 });
    const result = classify([mine], { nowFromId: 4242 });
    assert.equal(result.claims[0].state, "live");
  });

  it("refuses an id that is not in the comments", () =>
    assert.throws(() => nowFrom([driving()], 1), /no comment 1/));
});

describe("release", () => {
  it("writes each form the parser reads back", () => {
    const ts = "2026-11-03T04:00Z";
    const done = release({ subject: "#431", outcome: "done", ts });
    const blocked = release({ subject: "#431", outcome: "blocked", issue: 1020, ts });
    const lost = release({ subject: "#431", outcome: "lost", to: 4001, ts });
    assert.equal(done, "🤖 **Released** · #431 · done · 2026-11-03T04:00Z");
    assert.equal(blocked, "🤖 **Released** · #431 · blocked · #1020 · 2026-11-03T04:00Z");
    assert.equal(lost, "🤖 **Released** · #431 · lost to 4001 · 2026-11-03T04:00Z");
    for (const [text, form] of [[done, "done"], [blocked, "blocked"], [lost, "lost"]])
      assert.equal(releaseForm({ body: text }), form);
  });

  it("refuses a form it does not know", () =>
    assert.throws(() => release({ subject: "#431", outcome: "stopped early", ts: "x" }), /outcome/));
});
