import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const IDENT = /[\w\u0080-\uffff]/;

// Reads the SQL once and returns two strings of the same length: `shown` has the comments blanked,
// and `code` also has every literal, quoted identifier and dollar-quoted body blanked to `_`, so a
// rule reads keywords and nothing else, and a hit can still be shown as the author wrote it.
function readSql(sql) {
  let shown = "";
  let code = "";
  const keep = (text) => {
    shown += text;
    code += text;
  };
  const blank = (text) => {
    shown += text;
    code += text.replace(/[^\n]/g, "_");
  };
  let i = 0;
  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];
    if (char === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      shown += " ".repeat(stop - i);
      code += " ".repeat(stop - i);
      i = stop;
    } else if (char === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") (depth++, (j += 2));
        else if (sql[j] === "*" && sql[j + 1] === "/") (depth--, (j += 2));
        else j++;
      }
      const text = sql.slice(i, j);
      shown += text.replace(/[^\n]/g, " ");
      code += text.replace(/[^\n]/g, " ");
      i = j;
    } else if (char === "'" || char === '"') {
      const escapes = char === "'" && /^[eE]$/.test(sql[i - 1] ?? "") && !IDENT.test(sql[i - 2] ?? " ");
      let j = i + 1;
      while (j < sql.length) {
        if (escapes && sql[j] === "\\") j += 2;
        else if (sql[j] === char && sql[j + 1] === char) j += 2;
        else if (sql[j] === char) break;
        else j++;
      }
      const closed = j < sql.length;
      keep(char);
      blank(sql.slice(i + 1, Math.min(j, sql.length)));
      if (closed) keep(char);
      i = closed ? j + 1 : sql.length;
    } else if (char === "$" && !IDENT.test(sql[i - 1] ?? " ") && sql[i - 1] !== "$") {
      const open = /^\$(?:[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*)?\$/.exec(sql.slice(i));
      if (!open) {
        keep(char);
        i++;
        continue;
      }
      const close = sql.indexOf(open[0], i + open[0].length);
      const bodyEnd = close === -1 ? sql.length : close;
      keep(open[0]);
      blank(sql.slice(i + open[0].length, bodyEnd));
      if (close !== -1) keep(open[0]);
      i = close === -1 ? sql.length : close + open[0].length;
    } else {
      keep(char);
      i++;
    }
  }
  return { shown, code };
}

function splitAt(text, separator, { nested }) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (nested && text[i] === "(") depth++;
    else if (nested && text[i] === ")") depth = Math.max(0, depth - 1);
    else if (text[i] === separator && depth === 0) {
      parts.push([from, i]);
      from = i + 1;
    }
  }
  parts.push([from, text.length]);
  return parts;
}

const depthZero = (text) => {
  let depth = 0;
  let out = "";
  for (const char of text) {
    if (char === "(") depth++;
    out += depth === 0 ? char : " ";
    if (char === ")") depth = Math.max(0, depth - 1);
  }
  return out;
};

const normalise = (text) => text.replace(/\s+/g, " ").trim();

const SPLIT = "split it into its own migration ticket, applied from the base branch once nothing reads the old shape";
const HAS_DEFAULT = /\b(DEFAULT|SERIAL|BIGSERIAL|SMALLSERIAL|GENERATED)\b/i;
const NOT_A_COLUMN = /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE|LIKE)\b/i;
const DATA_FREE = /^(CREATE\s+(OR\s+REPLACE\s+)?(CONSTRAINT\s+)?(TRIGGER|POLICY|RULE)|ALTER\s+POLICY|GRANT|REVOKE|ALTER\s+DEFAULT\s+PRIVILEGES)\b/i;

function clauseWhy(clause) {
  const top = depthZero(clause);
  if (/^DROP\b/i.test(clause)) return `drops a column or constraint existing code may read; ${SPLIT}`;
  if (/^ALTER\s+(COLUMN\s+)?\S+\s+(SET\s+DATA\s+)?TYPE\b/i.test(clause)) {
    return "changes a column's type, which a script cannot tell widens from narrows";
  }
  if (/^ALTER\s+(COLUMN\s+)?\S+\s+SET\s+NOT\s+NULL\b/i.test(clause)) {
    return "adds NOT NULL to a column rows may already leave empty";
  }
  const add = /^ADD\s+(COLUMN\s+)?(IF\s+NOT\s+EXISTS\s+)?(?=\S)/i.exec(clause);
  if (add && (add[1] || !NOT_A_COLUMN.test(clause.slice(add[0].length)))) {
    if (/\bNOT\s+NULL\b/i.test(top) && !HAS_DEFAULT.test(top)) return "adds a NOT NULL column with no default";
  }
  return null;
}

function statementWhy(code) {
  if (/^DO\b/i.test(code)) {
    return "a DO block runs SQL this check cannot read; write its statements out, each one an expand, so it can be held to the rule";
  }
  if (/^DROP\b/i.test(code)) return `drops something existing code may read; ${SPLIT}`;
  if (/\bRENAME\b/i.test(code)) return "renames something existing code names";
  const reads = code.replace(/\bON\s+(DELETE|UPDATE)\b/gi, " ");
  if (!DATA_FREE.test(code) && /\b(DELETE|UPDATE|TRUNCATE)\b/i.test(reads)) return "rewrites rows that already exist";
  if (/^ALTER\s+TABLE\b/i.test(code)) {
    const prefix = /^ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(ONLY\s+)?\S+\s*/i.exec(code);
    const body = code.slice(prefix?.[0].length ?? 0);
    for (const [from, to] of splitAt(body, ",", { nested: true })) {
      const why = clauseWhy(body.slice(from, to).trim());
      if (why) return why;
    }
  }
  return null;
}

export function contractStatements(sql) {
  const { shown, code } = readSql(sql);
  return splitAt(code, ";", { nested: false }).flatMap(([from, to]) => {
    const statement = code.slice(from, to).trim();
    if (!statement) return [];
    const why = statementWhy(normalise(statement));
    return why ? [{ statement: normalise(shown.slice(from, to)), why }] : [];
  });
}

// What `apply` says when a file it was asked to print for the shared database is not an expand.
export function applyRefusal(tag, sql) {
  const found = contractStatements(sql);
  if (found.length === 0) return null;
  return `${tag} is a contract, and \`apply\` would put it on the database every branch and the app share:\n  ${found
    .map(({ statement, why }) => `${statement} — ${why}`)
    .join("\n  ")}\nA contract is applied from the base branch, once the code stops reading the old shape, with --allow-contract. \`--record-only\` writes the ledger row alone and needs neither.`;
}

// A drizzle directory lists its migrations in a journal; a directory of <version>_<name>.sql files is its own list.
export function tagsIn(migrations) {
  const journal = join(migrations, "meta/_journal.json");
  if (existsSync(journal)) return JSON.parse(readFileSync(journal, "utf8")).entries.map((entry) => entry.tag);
  return readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.slice(0, -".sql".length))
    .sort();
}

const EMPTY_NOTE =
  ", as a custom migration is: write its SQL, and hold it to the same rule — an expand only, which this script cannot check until the file has statements.";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [migrations, ...before] = process.argv.slice(2);
  const written = tagsIn(migrations).filter((tag) => !before.includes(tag));
  const refused = [];
  for (const tag of written) {
    const sql = readFileSync(join(migrations, `${tag}.sql`), "utf8");
    if (!sql.trim()) {
      process.stderr.write(
        `${tag} is empty${process.env.EXPAND_EMPTY_NOTE ?? EMPTY_NOTE}\n`,
      );
    }
    for (const { statement, why } of contractStatements(sql)) refused.push(`${tag}: ${statement} — ${why}`);
  }
  if (refused.length > 0) {
    process.stderr.write(
      `a migration written from a branch is an expand, and this is a contract. It is its own ticket, applied from the base branch once the code stops reading the old shape. The files are left where they were written, for you to see and undo:\n  ${refused.join("\n  ")}\n`,
    );
    process.exit(1);
  }
  for (const tag of written) process.stdout.write(`${tag}\n`);
}
