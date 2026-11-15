import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PUSH_KEY = "connectors:session-pr-branch-push";
export const STALLED_KEY = "infra:drive-stalled";

export const WINDOW_MINUTES = 90;
export const TICKET_WINDOW_MINUTES = 180;
const CAP_MINUTES = 24 * 60;

const HEAD = /^🤖 \*\*(Driving|Claimed|Released)\*\*/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;
const BLOCKED = /^blocked(?: · #\d+)?$/;
const LOST = /^lost to \d+$/;
const PUSH_REFUSAL =
  /\bpush(?:ing)?\b[^\n]*\bclaude\/|\blimited to\b[^\n]*\bclaude\/|\bmay not push\b/i;

const minutes = (from, to) => (Date.parse(to) - Date.parse(from)) / 60_000;

const header = (comment) => HEAD.exec(String(comment.body ?? ""))?.[1] ?? null;

const outcome = (comment) =>
  String(comment.body ?? "")
    .split("\n")[0]
    .split(" · ")
    .map((part) => part.trim())
    .slice(2)
    .filter((part) => !TIME.test(part))
    .join(" · ");

export function releaseForm(comment) {
  if (header(comment) !== "Released") return null;
  const text = outcome(comment);
  if (text === "done") return "done";
  if (BLOCKED.test(text)) return "blocked";
  if (LOST.test(text)) return "lost";
  return "reasoned";
}

export function nowFrom(comments, id) {
  const found = comments.find((comment) => comment.id === id);
  if (!found) throw new Error(`no comment ${id} to read the time from`);
  return found.created_at;
}

function state(comment, now, window) {
  if (header(comment) === "Released") return "released";
  const edited = comment.updated_at ?? comment.created_at;
  const age = minutes(comment.created_at, now);
  const idle = minutes(edited, now);
  if (!Number.isFinite(age) || !Number.isFinite(idle)) return "expired";
  if (age >= CAP_MINUTES) return "expired";
  if (idle > window) return "expired";
  return "live";
}

// A run that died never wrote its release, so its claim only expires; three of those in a row
// are the same stuck lap as three reasoned stops.
const stopped = (claim) =>
  claim.form === "reasoned" || (claim.form === null && claim.state === "expired");

const stopReason = (claim) =>
  claim.form === null ? `expired unreleased${claim.reason ? ` · ${claim.reason}` : ""}` : claim.reason;

export function classify(comments, { now, nowFromId, window = WINDOW_MINUTES } = {}) {
  const minutesAllowed = window === "ticket" ? TICKET_WINDOW_MINUTES : window;
  const clock = now ?? (nowFromId === undefined ? undefined : nowFrom(comments, nowFromId));
  if (!clock) throw new Error("classify needs now, or the id of a comment to read it from");

  const claims = comments
    .filter((comment) => header(comment))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id)
    .map((comment) => ({
      id: comment.id,
      kind: header(comment),
      state: state(comment, clock, minutesAllowed),
      form: releaseForm(comment),
      reason: outcome(comment),
    }));

  const live = claims.filter((claim) => claim.state === "live");
  const newest = claims.slice(-3);
  const stalled = live.length === 0 && newest.length === 3 && newest.every(stopped);
  const reasons = stalled ? newest.map(stopReason) : [];

  return {
    claims: claims.map(({ id, kind, state: claimState }) => ({ id, kind, state: claimState })),
    taken: live.length > 0,
    winner: live.length > 0 ? Math.min(...live.map((claim) => claim.id)) : null,
    stalled,
    reasons,
    key: stalled ? (reasons.every((reason) => PUSH_REFUSAL.test(reason)) ? PUSH_KEY : STALLED_KEY) : null,
  };
}

export function release({ subject, outcome: kind, issue, to, ts }) {
  const head = `🤖 **Released** · ${subject}`;
  if (kind === "done") return `${head} · done · ${ts}`;
  if (kind === "blocked") return `${head} · blocked${issue ? ` · #${issue}` : ""} · ${ts}`;
  if (kind === "lost" && to) return `${head} · lost to ${to} · ${ts}`;
  throw new Error(`outcome is done, blocked or lost (with the id it lost to), not "${kind}"`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  const input = command ? JSON.parse(readFileSync(0, "utf8")) : null;
  if (command === "classify") {
    const everything = Object.values(input.items).flat();
    const now = input.now ?? nowFrom(everything, input.nowFromId);
    const result = Object.fromEntries(
      Object.entries(input.items).map(([name, comments]) => [
        name,
        classify(comments, { now, window: input.window }),
      ]),
    );
    console.log(JSON.stringify(result));
  } else if (command === "release") {
    console.log(release(input));
  } else {
    process.stderr.write(
      'usage: claims.mjs classify < {"now"|"nowFromId","window"?,"items":{"<name>":[comments]}} · claims.mjs release < {"subject","outcome","issue"?,"to"?,"ts"}\n',
    );
    process.exit(2);
  }
}
