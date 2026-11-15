const VERDICTS = ["done", "findings", "blocked"];

const COUNTS = /^(\d+) found(?:, (\d+) fixed, (\d+) open)?$/;

export function parse(text) {
  const line = String(text ?? "")
    .trim()
    .split("\n")
    .at(-1)
    ?.trim();
  if (!line) return null;

  const [verdict, middle, url, ...rest] = line.split("·").map((part) => part.trim());
  if (rest.length > 0) return null;
  if (!VERDICTS.includes(verdict)) return null;
  if (!url || !/^https:\/\/\S+$/.test(url)) return null;

  if (verdict === "blocked") {
    if (!middle) return null;
    return { verdict, found: 0, fixed: 0, open: 0, reason: middle, url };
  }

  const counts = COUNTS.exec(middle ?? "");
  if (!counts) return null;
  const found = Number(counts[1]);
  const fixed = Number(counts[2] ?? 0);
  const open = Number(counts[3] ?? 0);
  if (fixed + open !== found) return null;

  return { verdict, found, fixed, open, reason: "", url };
}

export function format({ verdict, found = 0, fixed = 0, open = 0, reason = "", url }) {
  if (!VERDICTS.includes(verdict)) throw new Error(`unknown verdict: ${verdict}`);
  if (!url) throw new Error("a receipt names where its detail was posted");
  if (verdict === "blocked") {
    if (!reason) throw new Error("a blocked receipt names its reason");
    return `blocked · ${reason} · ${url}`;
  }
  const counts = found === 0 ? "0 found" : `${found} found, ${fixed} fixed, ${open} open`;
  return `${verdict} · ${counts} · ${url}`;
}
