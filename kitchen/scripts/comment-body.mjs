// An agent's own comment tool strips the `!` from `![alt](url)` and escapes a raw `<img>`, so
// a screenshot it posts arrives as a link or as inert text. Whichever of those forms survived,
// the reader gets the image.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { escapeRegExp, load } from "./kitchen.mjs";

// Only the listed prefixes: the sanitizer exists to stop an agent being talked into embedding
// an arbitrary host, and that reasoning does not stop applying here.
export function embedPrefixes(kitchen = load()) {
  return kitchen.adapters.evidenceHost.embedPrefixes ?? [];
}

function shot(prefixes) {
  if (prefixes.length === 0) return null;
  const listed = prefixes.map(escapeRegExp).join("|");
  return String.raw`(?:${listed})[^\s)"'<>]+\.(?:png|jpe?g|gif|webp)(?![\w/?#&=%-])`;
}

// Unsized, a 1280px-wide screenshot sets the width of its table column and squashes every
// other cell in the row.
const WIDTH = 320;

export function shotUrls(body, prefixes = embedPrefixes()) {
  const pattern = shot(prefixes);
  if (!pattern) return [];
  return [...new Set(body.match(new RegExp(pattern, "gi")) ?? [])];
}

export function render(body, prefixes = embedPrefixes()) {
  const pattern = shot(prefixes);
  if (!pattern) return body;
  // The lookbehind leaves a URL that already sits in an <img> alone, so rendering twice is
  // the same as rendering once.
  const embedded = new RegExp(
    String.raw`!?\[[^\]]*\]\((${pattern})\)|(?<!src=")(${pattern})`,
    "gi",
  );
  return body.replace(
    embedded,
    (_match, linked, bare) => `<img src="${linked ?? bare}" width="${WIDTH}">`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...given] = process.argv.slice(2);
  const prefixes = given.length > 0 ? given : embedPrefixes();
  const body = readFileSync(0, "utf8");
  if (command === "urls") process.stdout.write(shotUrls(body, prefixes).join("\n"));
  else if (command === "render") process.stdout.write(render(body, prefixes));
  else {
    process.stderr.write("usage: comment-body.mjs <urls|render> [prefix...] < body.md\n");
    process.exit(2);
  }
}
