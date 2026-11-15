import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { render as renderFor, shotUrls as shotUrlsFor } from "./comment-body.mjs";

const SCRIPT = fileURLToPath(new URL("./comment-body.mjs", import.meta.url));
const PREFIX = "https://shots.example.org/bucket/";
const render = (body) => renderFor(body, [PREFIX]);
const shotUrls = (body) => shotUrlsFor(body, [PREFIX]);
const BASE = `${PREFIX}315`;
const SHOT = `${BASE}/welcome-after.png`;
const IMG = `<img src="${SHOT}" width="320">`;
// Written byte-wise: a literal `![` in this file is the thing the sanitizer under test removes.
const BANG = String.fromCharCode(33);

describe("render", () => {
  it("embeds a bare url", () => {
    assert.equal(render(SHOT), IMG);
  });

  it("embeds markdown image syntax", () => {
    assert.equal(render(`${BANG}[welcome](${SHOT})`), IMG);
  });

  it("embeds the link the sanitizer leaves behind", () => {
    assert.equal(render(`[welcome](${SHOT})`), IMG);
    assert.equal(render(`[](${SHOT})`), IMG);
  });

  it("embeds every cell of a row", () => {
    assert.equal(
      render(`| a | ${SHOT} | ${SHOT} |`),
      `| a | ${IMG} | ${IMG} |`,
    );
  });

  it("renders an already-rendered body unchanged", () => {
    assert.equal(render(IMG), IMG);
  });

  it("keeps the prose around a url", () => {
    assert.equal(render(`before ${SHOT} after`), `before ${IMG} after`);
  });

  it("embeds a shot under any listed prefix", () => {
    const other = "https://cdn.example.net/a/b/after.webp";
    assert.equal(
      renderFor(`${SHOT} ${other}`, [PREFIX, "https://cdn.example.net/a/"]),
      `${IMG} <img src="${other}" width="320">`,
    );
  });

  it("leaves a shot from an unlisted host alone", () => {
    const elsewhere = "https://example.com/elsewhere.png";
    const sameHostOtherPath = "https://shots.example.org/avatars/a.png";
    assert.equal(render(elsewhere), elsewhere);
    assert.equal(render(sameHostOtherPath), sameHostOtherPath);
    assert.deepEqual(shotUrls(`${elsewhere} ${sameHostOtherPath}`), []);
  });

  it("embeds nothing when no prefix is configured", () => {
    assert.equal(renderFor(SHOT, []), SHOT);
    assert.deepEqual(shotUrlsFor(SHOT, []), []);
  });

  it("embeds a shot at the end of a sentence", () => {
    assert.equal(render(`See ${SHOT}.`), `See ${IMG}.`);
  });

  it("leaves a url that is not an image alone", () => {
    const page = "https://example.com/after.html";
    assert.equal(render(page), page);
  });

  it("leaves an image url carrying a query alone", () => {
    const query = `${BASE}/home.png?raw=true`;
    assert.equal(render(query), query);
    assert.deepEqual(shotUrls(query), []);
  });

  it("leaves a plain http url alone", () => {
    const insecure = SHOT.replace("https://", "http://");
    assert.equal(render(insecure), insecure);
  });
});

describe("shotUrls", () => {
  it("lists each shot once", () => {
    assert.deepEqual(shotUrls(`${SHOT} ${BASE}/sign-in.png ${SHOT}`), [
      SHOT,
      `${BASE}/sign-in.png`,
    ]);
  });

  it("is empty for a body carrying no shots", () => {
    assert.deepEqual(shotUrls("just prose"), []);
  });
});

describe("the command line", () => {
  const run = (command, body) =>
    execFileSync("node", [SCRIPT, command, PREFIX], { input: body, encoding: "utf8" });

  it("renders on stdout", () => {
    assert.equal(run("render", `a ${SHOT} b`), `a ${IMG} b`);
  });

  it("prints one url per line", () => {
    assert.equal(
      run("urls", `${SHOT} ${BASE}/sign-in.png`),
      `${SHOT}\n${BASE}/sign-in.png`,
    );
  });

  it("refuses an unknown command", () => {
    assert.throws(() => run("post", SHOT), /status 2|Command failed/);
  });
});
