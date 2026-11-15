// A parser for the YAML a Maestro flow is written in, so drive.mjs needs Playwright and nothing else.
// It reads block maps and sequences, flow collections on one line, plain, single- and double-quoted
// scalars on one line, comments, and `---` between documents, with the core schema's types. Anything
// else — block scalars, anchors, tags, a scalar over several lines, a tab after a colon — is refused
// by line number rather than guessed at, and so is a plain scalar the `yaml` package rejects: one with
// a `: ` in it, or starting with `@`, a backtick or `%`. maestro-yaml.test.mjs holds it to what the `yaml` package makes of every
// file in the project's flows.

const MARKER = /^---(?:[ \t]|$)/;

function refuse(no, message) {
  throw new Error(`line ${no}: ${message}`);
}

const quoteEnd = (text, start) => {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (quote === '"' && text[i] === "\\") i++;
    else if (text[i] === quote) {
      if (quote === "'" && text[i + 1] === "'") i++;
      else return i + 1;
    }
  }
  return -1;
};

// A quote opens a quoted scalar only where a scalar starts, so the apostrophe in "you're" is text.
function withoutComment(text) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const startsScalar = i === 0 || /[\s[{,]/.test(text[i - 1]);
    if ((char === '"' || char === "'") && startsScalar) {
      const end = quoteEnd(text, i);
      if (end === -1) return text.trimEnd();
      i = end - 1;
    } else if (char === "#" && startsScalar) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text.trimEnd();
}

const ESCAPES = { n: "\n", t: "\t", r: "\r", 0: "\0", a: "\x07", b: "\b", f: "\f", v: "\v", e: "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\x85", _: "\xa0", L: " ", P: " " };

function unquote(token, no) {
  const body = token.slice(1, -1);
  if (token[0] === "'") return body.replaceAll("''", "'");
  return body.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/gs, (_, escape) => {
    if (escape.length > 1) return String.fromCodePoint(Number.parseInt(escape.slice(1), 16));
    if (!(escape in ESCAPES)) refuse(no, `the escape \\${escape} is not supported`);
    return ESCAPES[escape];
  });
}

const INT = /^[-+]?[0-9]+$/;
const FLOAT = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;

function plain(text) {
  if (text === "" || text === "~" || /^(?:null|Null|NULL)$/.test(text)) return null;
  if (/^(?:true|True|TRUE)$/.test(text)) return true;
  if (/^(?:false|False|FALSE)$/.test(text)) return false;
  if (INT.test(text)) return Number.parseInt(text, 10);
  if (/^0o[0-7]+$/.test(text)) return Number.parseInt(text.slice(2), 8);
  if (/^0x[0-9a-fA-F]+$/.test(text)) return Number.parseInt(text.slice(2), 16);
  if (FLOAT.test(text)) return Number.parseFloat(text);
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(text)) return text.startsWith("-") ? -Infinity : Infinity;
  if (/^\.(?:nan|NaN|NAN)$/.test(text)) return Number.NaN;
  return text;
}

function flow(text, no) {
  let at = 0;
  const skip = () => {
    while (text[at] === " ") at++;
  };
  const fail = (what) => refuse(no, `${what} in a flow collection`);

  function scalar(stops) {
    skip();
    if (text[at] === '"' || text[at] === "'") {
      const end = quoteEnd(text, at);
      if (end === -1) refuse(no, "a quoted string must close on the same line");
      const token = text.slice(at, end);
      at = end;
      return unquote(token, no);
    }
    const start = at;
    while (at < text.length && !stops.includes(text[at]) && !(text[at] === ":" && (text[at + 1] === " " || text[at + 1] === undefined))) at++;
    return plain(text.slice(start, at).trim());
  }

  function value() {
    skip();
    if (text[at] === "[") {
      at++;
      const items = [];
      for (skip(); text[at] !== "]"; skip()) {
        if (at >= text.length) fail("a missing ]");
        items.push(value());
        skip();
        if (text[at] === ",") at++;
        else if (text[at] !== "]") fail("something other than , or ]");
      }
      at++;
      return items;
    }
    if (text[at] === "{") {
      at++;
      const entries = [];
      for (skip(); text[at] !== "}"; skip()) {
        if (at >= text.length) fail("a missing }");
        const key = scalar(",}");
        skip();
        let item = null;
        if (text[at] === ":") {
          at++;
          item = value();
        }
        entries.push([String(key), item]);
        skip();
        if (text[at] === ",") at++;
        else if (text[at] !== "}") fail("something other than , or }");
      }
      at++;
      return Object.fromEntries(entries);
    }
    return scalar(",]}");
  }

  const result = value();
  skip();
  if (at < text.length) fail("text after the end");
  return result;
}

function inline(text, no) {
  const first = text[0];
  if (first === "|" || first === ">") refuse(no, "block scalars (| and >) are not supported");
  if (first === "&") refuse(no, "anchors (&) are not supported");
  if (first === "*") refuse(no, "aliases (*) are not supported");
  if (first === "!") refuse(no, "tags (!) are not supported");
  if (first === "[" || first === "{") return flow(text, no);
  if (first === '"' || first === "'") {
    const end = quoteEnd(text, 0);
    if (end === -1) refuse(no, "a quoted string must close on the same line");
    if (end !== text.length) refuse(no, "text after the closing quote");
    return unquote(text, no);
  }
  if (first === "@" || first === "`") refuse(no, `a plain scalar cannot start with ${first}; quote it`);
  if (first === "%") refuse(no, "a plain scalar cannot start with %; quote it");
  if (/:\t/.test(text)) refuse(no, "a tab after a colon is not supported; use a space");
  if (/:(?:[ ]|$)/.test(text)) refuse(no, 'a plain scalar cannot contain ": "; quote it, or it is a mapping inside a mapping');
  return plain(text);
}

const isItem = (text) => text === "-" || text.startsWith("- ");

function splitKey(text) {
  if (text[0] === "[" || text[0] === "{") return null;
  if (text[0] === '"' || text[0] === "'") {
    const end = quoteEnd(text, 0);
    if (end === -1) return null;
    const after = text.slice(end).trimStart();
    if (after !== ":" && !after.startsWith(": ")) return null;
    return { key: unquote(text.slice(0, end), 0), rest: after.slice(1).trim() };
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ":" && (i + 1 === text.length || text[i + 1] === " ")) {
      return i === 0 ? null : { key: text.slice(0, i).trimEnd(), rest: text.slice(i + 1).trim() };
    }
  }
  return null;
}

function parseChunk(lines) {
  let pos = 0;

  function node(indent) {
    const line = lines[pos];
    if (isItem(line.text)) return sequence(line.indent);
    if (splitKey(line.text)) return mapping(line.indent);
    pos++;
    if (lines[pos]?.indent > line.indent) refuse(lines[pos].no, "a scalar cannot continue on the next line");
    return inline(line.text, line.no);
  }

  function sequence(indent) {
    const items = [];
    while (pos < lines.length && lines[pos].indent === indent && isItem(lines[pos].text)) {
      const line = lines[pos];
      const rest = line.text === "-" ? "" : line.text.slice(1).trimStart();
      if (rest === "") {
        pos++;
        items.push(lines[pos]?.indent > indent ? node(lines[pos].indent) : null);
      } else {
        const column = indent + (line.text.length - rest.length);
        lines[pos] = { ...line, indent: column, text: rest };
        items.push(node(column));
      }
    }
    return items;
  }

  function mapping(indent) {
    const entries = [];
    const seen = new Set();
    while (pos < lines.length && lines[pos].indent === indent) {
      const line = lines[pos];
      const pair = splitKey(line.text);
      if (!pair && /:\t/.test(line.text)) refuse(line.no, "a tab after a colon is not supported; use a space");
      if (!pair) refuse(line.no, 'expected "key: value" here');
      if (seen.has(pair.key)) refuse(line.no, `duplicate key "${pair.key}"`);
      seen.add(pair.key);
      pos++;
      const next = lines[pos];
      let value = null;
      if (pair.rest === "") {
        if (next?.indent > indent) value = node(next.indent);
        else if (next?.indent === indent && isItem(next.text)) value = sequence(indent);
      } else {
        value = inline(pair.rest, line.no);
        if (next?.indent > indent) refuse(next.no, "a scalar cannot continue on the next line");
      }
      entries.push([pair.key, value]);
    }
    return Object.fromEntries(entries);
  }

  if (lines.length === 0) return null;
  const value = node(lines[0].indent);
  if (pos < lines.length) refuse(lines[pos].no, "the indent matches no level above it");
  return value;
}

export function parseDocuments(text) {
  const chunks = [[]];
  text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((raw, index) => {
      const no = index + 1;
      if (MARKER.test(raw)) {
        if (withoutComment(raw.slice(3).trim()) !== "") refuse(no, "content on the same line as --- is not supported");
        chunks.push([]);
        return;
      }
      if (raw.startsWith("...")) refuse(no, "a document end marker (...) is not supported");
      if (raw.startsWith("%")) refuse(no, "a directive is not supported");
      if (/^\s*$/.test(raw)) return;
      const spaces = raw.match(/^[ \t]*/)[0];
      if (spaces.includes("\t")) refuse(no, "a tab cannot indent");
      const content = raw.slice(spaces.length);
      if (content.startsWith("#")) return;
      chunks.at(-1).push({ no, indent: spaces.length, text: withoutComment(content) });
    });
  return chunks.filter((lines, index) => index > 0 || lines.length > 0).map(parseChunk);
}
