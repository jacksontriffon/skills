import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";

import { load } from "./kitchen.mjs";
import { parseDocuments } from "./maestro-yaml.mjs";

import { ROOT, VENDORED } from "./layout.mjs";

const SCRIPTS = fileURLToPath(new URL("./", import.meta.url));

const reference = (text) => parseAllDocuments(text).map((document) => document.toJS());

const yamlUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return yamlUnder(path);
    return /\.ya?ml$/.test(entry.name) ? [path] : [];
  });

describe("every Maestro file in the project", () => {
  const files = yamlUnder(VENDORED ? join(ROOT, load().flows) : fileURLToPath(new URL("./fixtures/maestro", import.meta.url)));

  it("is found, so the comparison below is not over nothing", () => {
    assert.ok(files.length > 0);
    assert.ok(files.some((file) => file.endsWith("config.yaml")));
  });

  for (const file of files) {
    it(`${relative(ROOT, file)} parses to what the yaml package makes of it`, () => {
      const text = readFileSync(file, "utf8");
      assert.deepEqual(parseDocuments(text), reference(text));
    });
  }
});

const AGREES = {
  "plain scalars take the core schema's types": "a: 1\nb: -2\nc: 3.5\nd: 1e3\ne: 0x1F\nf: 0o17\ng: true\nh: False\ni: null\nj: ~\nk:\nl: .inf\nm: hello world\nn: 1.2.3\no: yes\np: 007\n",
  "a plain scalar may hold quotes, commas, colons not followed by a space, and a #": "a: you're done, 5 to go\nb: http://localhost:8081/x\nc: a#b\nd: ${LINK_PREFIX}/home\n",
  "an inline comment ends a plain scalar": "a: one # two\nb: three   #four\n",
  "double quotes carry escapes, and a # inside them is text": 'a: "x \\"y\\" \\\\ \\n \\t \\u00e9 # not a comment"   # a comment\nb: ""\n',
  "single quotes double their own": "a: 'it''s # fine'\nb: ''\n",
  "quoted keys": '"a b": 1\n\'c: d\': 2\n',
  "a block sequence of scalars": "- a\n- 1\n- true\n- \"q\"\n",
  "a sequence at the same indent as its key": "tags:\n- a\n- b\nafter: 1\n",
  "a sequence indented under its key": "tags:\n  - a\n  - b\nafter: 1\n",
  "a map inside a sequence item, its keys at the item's column": "- tapOn:\n    id: x\n    optional: true\n- key: v\n  other: w\n",
  "a nested sequence": "- - a\n  - b\n- - c\n",
  "a key with no value, then a sibling": "a:\nb: 1\n",
  "an item that is a bare key": "- launchApp\n- waitForAnimationToEnd\n",
  "deep nesting": "a:\n  b:\n    c:\n      - d: 1\n        e:\n          - f\n",
  "comments between entries and at the ends": "# top\na: 1\n\n# middle\n\nb:\n  # inside\n  - c\n# bottom\n",
  "two documents": "appId: x\ntags:\n  - a\n---\n- openLink: y\n",
  "a leading ---": "---\na: 1\n",
  "comments before the first ---": "# header\n---\na: 1\n",
  "a trailing ---": "a: 1\n---\n",
  "three documents": "a: 1\n---\n- b\n---\nc: 2\n",
  "an empty text": "",
  "a text of comments only": "# nothing\n",
  "CRLF line endings": "appId: x\r\n---\r\n- openLink: y\r\n- tapOn:\r\n    id: z\r\n",
  "no newline at the end": "a: 1",
  "a --- with a comment after it": "a: 1\n--- # next\n- b\n",
  "a value that looks like a document marker": "a: ---\nb: --- x\n",
  "a key that starts like a number": "1: a\n2.5: b\n",
};

describe("the parser agrees with the yaml package on the syntax a flow can use", () => {
  for (const [what, text] of Object.entries(AGREES)) {
    it(what, () => {
      assert.deepEqual(parseDocuments(text), reference(text));
    });
  }

  it("flow sequences and maps", () => {
    const text = "a: [1, two, \"three\", [4]]\nb: {x: 1, y: [2, 3], z: {w: v}}\nc: []\nd: {}\n";
    assert.deepEqual(parseDocuments(text), reference(text));
  });
});

describe("what the parser does not read, it refuses by line and does not guess", () => {
  const REFUSED = {
    "a literal block scalar": ["a: |\n  text\n", /line 1.*block scalar/i],
    "a folded block scalar": ["a: >\n  text\n", /line 1.*block scalar/i],
    "an anchor": ["a: &x 1\nb: *x\n", /line 1.*anchor/i],
    "an alias": ["b: *x\n", /line 1.*alias/i],
    "a tag": ["a: !!str 1\n", /line 1.*tag/i],
    "a tab for indentation": ["a:\n\t- b\n", /line 2.*tab/i],
    "a plain scalar that continues on the next line": ["a: one\n  two\n", /line 2/],
    "a double-quoted string that runs over a line": ['a: "one\n  two"\n', /line 1.*quote/i],
    "a document end marker": ["a: 1\n...\n", /line 2/],
    "a directive": ["%YAML 1.2\n---\na: 1\n", /line 1.*directive/i],
    "a key with no colon": ["a: 1\nb\n", /line 2/],
    "an indent that does not match any level": ["a:\n    b: 1\n  c: 2\n", /line 3.*indent/i],
    "a duplicate key": ["a: 1\na: 2\n", /line 2.*duplicate/i],
  };

  for (const [what, [text, message]] of Object.entries(REFUSED)) {
    it(`throws on ${what}`, () => {
      assert.throws(() => parseDocuments(text), message);
    });
  }
});

const yamlRejects = (text) => parseAllDocuments(text).some((document) => document.errors.length > 0);

describe("what the yaml package rejects, the parser refuses by line too", () => {
  const BOTH_REFUSE = {
    "a plain scalar with a colon and a space in it": ["text: Total: 5\n", /line 1.*:/],
    "the same inside a sequence item": ["- tapOn:\n    text: Total: 5\n", /line 2/],
    "the same on a later line": ["a: 1\nb: x\nc: y: z\n", /line 3/],
    "a plain scalar item with a colon and a space in it": ["- a: b: c\n", /line 1/],
    "a plain scalar that starts with @": ["a: @mention\n", /line 1.*@/],
    "a plain scalar that starts with a backtick": ["a: `code`\n", /line 1.*`/],
    "a plain scalar item that starts with @": ["- @mention\n", /line 1.*@/],
    "a plain scalar item that starts with a backtick": ["- `code`\n", /line 1.*`/],
    "a plain scalar that starts with %": ["a: %x\n", /line 1.*%/],
    "a plain scalar with a colon and a tab in it": ["a: x:\ty\n", /line 1/],
  };

  for (const [what, [text, message]] of Object.entries(BOTH_REFUSE)) {
    it(`${what}: yaml errors, and so does the parser, naming the line`, () => {
      assert.equal(yamlRejects(text), true, "the yaml package accepts this, so it is not a case");
      assert.throws(() => parseDocuments(text), message);
    });
  }

  const QUOTED_OR_FINE = {
    "a quoted scalar with a colon and a space": 'text: "Total: 5"\n',
    "a single-quoted scalar with a colon and a space": "text: 'Total: 5'\n",
    "a colon with no space after it": "a: Total:5\n",
    "an @ that is not first": "a: user@example.test\n",
    "a quoted scalar that starts with @": 'a: "@mention"\n',
    "a backtick that is not first": "a: x`y\n",
    "a flow map with a value": "a: {b: c}\n",
  };

  for (const [what, text] of Object.entries(QUOTED_OR_FINE)) {
    it(`still reads ${what}, as the yaml package does`, () => {
      assert.equal(yamlRejects(text), false);
      assert.deepEqual(parseDocuments(text), reference(text));
    });
  }

  it("a leading byte order mark is dropped, as the yaml package drops it, instead of renaming the first key", () => {
    const text = "\uFEFFappId: x\n---\n- launchApp\n";
    assert.deepEqual(parseDocuments(text), reference(text));
    assert.deepEqual(Object.keys(parseDocuments(text)[0]), ["appId"]);
  });

  it("a byte order mark on a text of comments only reads as no document, as it does for yaml", () => {
    const text = "\uFEFF# nothing\n";
    assert.deepEqual(parseDocuments(text), reference(text));
  });

  for (const [what, text] of Object.entries({
    "a tab after a key's colon": "a:\tb\n",
    "a tab after a colon in a sequence item": "- a:\tb\n",
    "a tab after a colon on a later line": "a: 1\nb:\tc\n",
  })) {
    it(`refuses ${what} by line, which a plain scalar would swallow whole`, () => {
      assert.throws(() => parseDocuments(text), /line \d.*tab/i);
    });
  }
});

describe("drive.mjs and the rest of the kitchen's scripts", () => {
  const scripts = readdirSync(SCRIPTS).filter((name) => /\.mjs$/.test(name) && !/\.test\.mjs$|-stub\.mjs$|-fixtures\.mjs$/.test(name));

  it("import Playwright and Node's own modules and each other, and nothing else", () => {
    const outside = scripts.flatMap((name) =>
      [...readFileSync(join(SCRIPTS, name), "utf8").matchAll(/^import .*? from "([^"]+)";?$/gm)]
        .map((match) => match[1])
        .filter((specifier) => !specifier.startsWith("node:") && !specifier.startsWith("./") && specifier !== "playwright")
        .map((specifier) => `${name}: ${specifier}`),
    );
    assert.deepEqual(outside, []);
  });

  it("drive.mjs reads its flows through the parser here", () => {
    const text = readFileSync(join(SCRIPTS, "drive.mjs"), "utf8");
    assert.match(text, /from "\.\/maestro-yaml\.mjs"/);
    assert.doesNotMatch(text, /from "yaml"/);
  });
});
