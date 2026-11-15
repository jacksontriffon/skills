// Tests for scripts/sync-skills.sh: typed sources, the file lock, and --init expo.
//
//   node --test scripts/tests/*.test.mjs
//
// No network. Each test builds a bare git repo standing in for jacksontriffon/skills and points
// https://github.com/ at it with git's url.insteadOf, so the script runs exactly as shipped.
//
// The kitchen/ tree in that stand-in is a small fixture built to the layout contract, plus this
// checkout's real kitchen/templates/. Set KITCHEN_SOURCE_TREE to a checkout of the skills repo
// (for example slice 4a's kitchen/lift branch) to use its real kitchen/ instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SCRIPT = path.join(REPO, 'scripts/sync-skills.sh');
const EXTERNAL = process.env.KITCHEN_SOURCE_TREE ? path.resolve(process.env.KITCHEN_SOURCE_TREE) : null;

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
};

// ---------------------------------------------------------------------------------------------
// Helpers

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, content, mode) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (mode) fs.chmodSync(file, mode);
};
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (...p) => fs.existsSync(path.join(...p));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim();
const copyDir = (from, to) => fs.cpSync(from, to, { recursive: true });
const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.name === '.git') return [];
  return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
});
const snapshot = (root, files) => Object.fromEntries(files.map((f) => [f, exists(root, f) ? sha256(path.join(root, f)) : null]));

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-skills-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The stand-in for jacksontriffon/skills: portable skills/ plus a kitchen/ tree.
function makeSource(box) {
  const work = path.join(box, 'source-work');
  fs.mkdirSync(work, { recursive: true });

  write(path.join(work, 'skills/alpha/SKILL.md'), '---\nname: alpha\ndescription: portable a\n---\nalpha\n');
  write(path.join(work, 'skills/beta/SKILL.md'), '---\nname: beta\ndescription: portable b\n---\nbeta\n');

  if (EXTERNAL) {
    copyDir(path.join(EXTERNAL, 'kitchen'), path.join(work, 'kitchen'));
    if (!exists(work, 'kitchen/templates')) copyDir(path.join(REPO, 'kitchen/templates'), path.join(work, 'kitchen/templates'));
  } else {
    const k = path.join(work, 'kitchen');
    write(path.join(k, 'skills/find-work/SKILL.md'), '---\nname: find-work\ndescription: k\n---\nfind work\n');
    write(path.join(k, 'skills/find-work/references/loop.md'), 'loop\n');
    write(path.join(k, 'skills/verify-expo/SKILL.md'), '---\nname: verify-expo\ndescription: k\n---\nverify\n');
    write(path.join(k, 'skills/verify-expo/SURFACES.md'), 'surfaces\n');
    write(path.join(k, 'agents/implementer.md'), '---\nname: implementer\n---\nimplement\n');
    write(path.join(k, 'agents/risk-reviewer.md'), '---\nname: risk-reviewer\n---\nreview\n');
    write(path.join(k, 'scripts/kitchen.mjs'), 'console.log("brief")\n');
    write(path.join(k, 'scripts/doctor.mjs'), 'console.log("doctor")\n');
    write(path.join(k, 'scripts/drive.mjs'), 'console.log("drive")\n');
    write(path.join(k, 'scripts/lib/old.mjs'), 'export {}\n');
    write(path.join(k, 'scripts/shoot-pair.sh'), '#!/usr/bin/env bash\necho shoot\n', 0o755);
    write(path.join(k, 'adapters/stack/none/up'), '#!/usr/bin/env bash\necho API_URL=\n', 0o755);
    write(path.join(k, 'docs/loops.md'), 'loops\n');
    write(path.join(k, 'docs/BLOCKERS.core.md'), '| Symptom | Fix |\n');
    write(path.join(k, 'kitchen.schema.json'), '{"type":"object"}\n');
    write(path.join(k, 'workflows/pr-comment.yml'), 'name: pr-comment\n');
    write(path.join(k, 'workflows/verify-expo.yml'), 'name: verify-expo\n');
    copyDir(path.join(REPO, 'kitchen/templates'), path.join(k, 'templates'));
  }

  git(work, 'init', '-q', '-b', 'main');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'source');
  const bare = path.join(box, 'remotes/jacksontriffon/skills.git');
  fs.mkdirSync(path.dirname(bare), { recursive: true });
  git(box, 'clone', '-q', '--bare', work, bare);
  git(work, 'remote', 'add', 'origin', bare);

  const commit = (msg) => {
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', msg);
    git(work, 'push', '-q', 'origin', 'main');
  };
  return { work, bare, commit };
}

// A project repo with the script dropped in where the README says to put it.
function makeProject(box, name, files = {}) {
  const root = path.join(box, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  for (const [p, content] of Object.entries(files)) write(path.join(root, p), content);
  write(path.join(root, '.claude/scripts/sync-skills.sh'), fs.readFileSync(SCRIPT), 0o755);
  return root;
}

function run(box, root, args, script = path.join(root, '.claude/scripts/sync-skills.sh')) {
  const r = spawnSync('bash', [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...GIT_ENV,
      SKILLS_SYNC_NO_PROMPT: '1',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `url.file://${path.join(box, 'remotes')}/.insteadOf`,
      GIT_CONFIG_VALUE_0: 'https://github.com/',
    },
  });
  return { ...r, out: `${r.stdout}\n${r.stderr}` };
}

const lockRows = (root) => fs.readFileSync(path.join(root, '.claude/skills.lock'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));

const TYPED_SOURCES = 'jacksontriffon/skills|main|skills\njacksontriffon/skills|main|kitchen|kitchen\n';

// Every path the layout contract maps the fixture kitchen to (the fixture only; an external tree
// is checked against the manifest instead).
const FIXTURE_DESTS = [
  '.claude/skills/find-work/SKILL.md',
  '.claude/skills/find-work/references/loop.md',
  '.claude/skills/verify-expo/SKILL.md',
  '.claude/skills/verify-expo/SURFACES.md',
  '.claude/agents/implementer.md',
  '.claude/agents/risk-reviewer.md',
  '.claude/kitchen/scripts/kitchen.mjs',
  '.claude/kitchen/scripts/doctor.mjs',
  '.claude/kitchen/scripts/drive.mjs',
  '.claude/kitchen/scripts/lib/old.mjs',
  '.claude/kitchen/scripts/shoot-pair.sh',
  '.claude/kitchen/adapters/stack/none/up',
  '.claude/kitchen/docs/loops.md',
  '.claude/kitchen/docs/BLOCKERS.core.md',
  '.claude/kitchen/kitchen.schema.json',
  '.github/workflows/kitchen-pr-comment.yml',
  '.github/workflows/kitchen-verify-expo.yml',
];

// Where the contract sends one kitchen-relative path, or null for templates/ and stray files.
function contractDest(rel) {
  let m;
  if ((m = rel.match(/^skills\/([^/]+)\/(.+)$/))) return `.claude/skills/${m[1]}/${m[2]}`;
  if ((m = rel.match(/^agents\/([^/]+\.md)$/))) return `.claude/agents/${m[1]}`;
  if ((m = rel.match(/^(scripts|adapters|docs)\/(.+)$/))) return `.claude/kitchen/${m[1]}/${m[2]}`;
  if (rel === 'kitchen.schema.json') return '.claude/kitchen/kitchen.schema.json';
  if ((m = rel.match(/^workflows\/([^/]+)\.yml$/))) return `.github/workflows/kitchen-${m[1]}.yml`;
  return null;
}

const STARTERS = [
  '.claude/kitchen.json',
  'kitchen-denylist.txt',
  '.claude/settings.json',
  '.claude/BLOCKERS.md',
  'docs/agents/issue-tracker.md',
  'docs/agents/triage-labels.md',
  'docs/agents/domain.md',
  '.maestro/config.yaml',
  '.maestro/flows/home.yaml',
  'docs/design/README.md',
  'docs/design/DEVIATIONS.md',
  'CLAUDE.md',
  'package.json',
];

// ---------------------------------------------------------------------------------------------
// Typed sync

test('a kitchen source syncs every part to its place in the contract and locks each file', (t) => {
  const box = sandbox(t);
  const src = makeSource(box);
  const root = makeProject(box, 'proj', {
    '.claude/skills.sources': TYPED_SOURCES,
    '.claude/skills/own-skill/SKILL.md': 'project owned\n',
    '.claude/agents/own-agent.md': 'project owned\n',
    '.claude/kitchen/notes.md': 'project owned\n',
    '.github/workflows/ci.yml': 'name: ci\n',
  });

  const r = run(box, root, []);
  assert.equal(r.status, 0, r.out);

  const k = path.join(src.work, 'kitchen');
  const expected = walk(k).map((rel) => [rel, contractDest(rel)]).filter(([, to]) => to);
  if (!EXTERNAL) assert.deepEqual(expected.map(([, to]) => to).sort(), [...FIXTURE_DESTS].sort());

  const rows = lockRows(root);
  const fileRows = new Map(rows.filter((r) => r[0].includes('/')).map((r) => [r[0], r]));
  for (const [rel, to] of expected) {
    assert.ok(exists(root, to), `${to} was not written`);
    assert.equal(sha256(path.join(root, to)), sha256(path.join(k, rel)), `${to} differs from upstream`);
    const row = fileRows.get(to);
    assert.ok(row, `lock has no row for ${to}`);
    assert.equal(row.length, 6);
    assert.equal(row[1], 'jacksontriffon/skills');
    assert.equal(row[5], sha256(path.join(k, rel)), `lock hash for ${to}`);
  }
  assert.equal(fileRows.size, expected.length, 'lock owns exactly the synced files');

  // Executable bits survive.
  if (!EXTERNAL) {
    assert.ok(fs.statSync(path.join(root, '.claude/kitchen/scripts/shoot-pair.sh')).mode & 0o100);
    assert.ok(fs.statSync(path.join(root, '.claude/kitchen/adapters/stack/none/up')).mode & 0o100);
  }

  // Templates are --init's alone.
  assert.ok(!walk(root).some((f) => f.includes('templates/')), 'templates were synced');

  // The portable skills still sync as before: one five-column row per directory.
  for (const name of ['alpha', 'beta']) {
    assert.ok(exists(root, `.claude/skills/${name}/SKILL.md`));
    const row = rows.find((r) => r[0] === name);
    assert.ok(row, `no lock row for ${name}`);
    assert.equal(row.length, 5);
  }

  // Project files are untouched.
  for (const f of ['.claude/skills/own-skill/SKILL.md', '.claude/agents/own-agent.md', '.claude/kitchen/notes.md']) {
    assert.equal(fs.readFileSync(path.join(root, f), 'utf8'), 'project owned\n');
  }
  assert.equal(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'), 'name: ci\n');

  // A bare re-run reproduces the tree exactly.
  const before = snapshot(root, walk(root));
  const again = run(box, root, []);
  assert.equal(again.status, 0, again.out);
  assert.deepEqual(snapshot(root, walk(root)), before);
});

test('a re-sync deletes only owned files the source dropped', (t) => {
  const box = sandbox(t);
  const src = makeSource(box);
  const root = makeProject(box, 'proj', {
    '.claude/skills.sources': TYPED_SOURCES,
    '.claude/kitchen/scripts/lib/project-helper.mjs': 'project owned\n',
    '.claude/agents/own-agent.md': 'project owned\n',
    '.github/workflows/kitchen-local.yml': 'project owned\n',
  });
  assert.equal(run(box, root, []).status, 0);

  // Drop one of each part upstream: an agent, a nested script, a whole skill, a workflow, and
  // the whole adapters tree. Change one file and add another.
  const k = path.join(src.work, 'kitchen');
  const agent = fs.readdirSync(path.join(k, 'agents')).filter((f) => f.endsWith('.md')).sort().pop();
  const nested = walk(path.join(k, 'scripts')).find((f) => f.includes('/')) || walk(path.join(k, 'scripts'))[0];
  const skill = fs.readdirSync(path.join(k, 'skills')).sort().pop();
  const workflow = fs.readdirSync(path.join(k, 'workflows')).filter((f) => f.endsWith('.yml')).sort().pop();
  const changed = walk(path.join(k, 'docs'))[0];
  fs.rmSync(path.join(k, 'agents', agent));
  fs.rmSync(path.join(k, 'scripts', nested));
  fs.rmSync(path.join(k, 'skills', skill), { recursive: true });
  fs.rmSync(path.join(k, 'workflows', workflow));
  const hadAdapters = exists(k, 'adapters');
  fs.rmSync(path.join(k, 'adapters'), { recursive: true, force: true });
  write(path.join(k, 'docs', changed), 'changed upstream\n');
  write(path.join(k, 'scripts/brand-new.mjs'), 'console.log("new")\n');
  src.commit('drop some files');

  const r = run(box, root, ['--latest']);
  assert.equal(r.status, 0, r.out);

  const gone = [
    `.claude/agents/${agent}`,
    `.claude/kitchen/scripts/${nested}`,
    `.claude/skills/${skill}`,
    `.github/workflows/kitchen-${workflow}`,
  ];
  if (hadAdapters) gone.push('.claude/kitchen/adapters');
  for (const p of gone) assert.ok(!exists(root, p), `${p} should be gone`);

  // Owned and kept: updated in place. New upstream: added.
  assert.equal(fs.readFileSync(path.join(root, '.claude/kitchen/docs', changed), 'utf8'), 'changed upstream\n');
  assert.ok(exists(root, '.claude/kitchen/scripts/brand-new.mjs'));

  // Never owned: never touched, even inside a directory the sync tidies.
  assert.equal(fs.readFileSync(path.join(root, '.claude/kitchen/scripts/lib/project-helper.mjs'), 'utf8'), 'project owned\n');
  assert.ok(exists(root, '.claude/agents/own-agent.md'));
  assert.ok(exists(root, '.github/workflows/kitchen-local.yml'));

  const paths = lockRows(root).map((row) => row[0]);
  for (const p of gone) assert.ok(!paths.some((q) => q === p || q.startsWith(`${p}/`)), `lock still names ${p}`);
  assert.ok(paths.includes('.claude/kitchen/scripts/brand-new.mjs'));
  assert.ok(r.out.includes(`removed .claude/agents/${agent} — no longer upstream`), r.out);
});

test('a project file in the kitchen\'s way stops the sync; an identical one is adopted', (t) => {
  const box = sandbox(t);
  const src = makeSource(box);
  const k = path.join(src.work, 'kitchen');
  const firstAgent = fs.readdirSync(path.join(k, 'agents')).find((f) => f.endsWith('.md'));
  const scriptFile = walk(path.join(k, 'scripts'))[0];

  const clash = makeProject(box, 'clash', {
    '.claude/skills.sources': TYPED_SOURCES,
    [`.claude/agents/${firstAgent}`]: 'the project wrote this\n',
  });
  const r = run(box, clash, []);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /exists and the lock does not own it/);
  assert.equal(fs.readFileSync(path.join(clash, `.claude/agents/${firstAgent}`), 'utf8'), 'the project wrote this\n');
  assert.ok(!exists(clash, `.claude/kitchen/scripts/${scriptFile}`), 'a refused sync wrote files');
  assert.ok(!exists(clash, '.claude/skills.lock'), 'a refused sync wrote the lock');

  const same = makeProject(box, 'same', {
    '.claude/skills.sources': TYPED_SOURCES,
    [`.claude/agents/${firstAgent}`]: fs.readFileSync(path.join(k, 'agents', firstAgent)),
  });
  const ok = run(box, same, []);
  assert.equal(ok.status, 0, ok.out);
  assert.ok(lockRows(same).some((row) => row[0] === `.claude/agents/${firstAgent}`));
});

test('a skills-only project syncs as it did before typed sources', (t) => {
  const box = sandbox(t);
  makeSource(box);
  const root = makeProject(box, 'proj', { '.claude/skills/own/SKILL.md': 'mine\n' });

  const r = run(box, root, []);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(fs.readdirSync(path.join(root, '.claude/skills')).sort(), ['alpha', 'beta', 'own']);
  assert.ok(!exists(root, '.claude/kitchen') && !exists(root, '.claude/agents') && !exists(root, '.github'));
  const lock = fs.readFileSync(path.join(root, '.claude/skills.lock'), 'utf8');
  assert.ok(!lock.includes('sha256'), 'a skills-only lock has no file-row header');
  for (const row of lockRows(root)) assert.equal(row.length, 5);

  // Byte-for-byte the tree main's script produces, when main is reachable from this checkout.
  let old;
  try { old = git(REPO, 'show', 'origin/main:scripts/sync-skills.sh'); } catch { /* shallow CI checkout */ }
  if (old && !old.includes('--init')) {
    const legacy = makeProject(box, 'legacy', { '.claude/skills/own/SKILL.md': 'mine\n' });
    write(path.join(legacy, '.claude/scripts/sync-skills.sh'), old + '\n', 0o755);
    const lr = run(box, legacy, []);
    assert.equal(lr.status, 0, lr.out);
    const files = walk(legacy).filter((f) => f.startsWith('.claude/skills/'));
    assert.deepEqual(files.sort(), walk(root).filter((f) => f.startsWith('.claude/skills/')).sort());
    assert.deepEqual(snapshot(root, files), snapshot(legacy, files));
    const sortRows = (p) => lockRows(p).map((r) => r.join('\t')).sort();
    assert.deepEqual(sortRows(root), sortRows(legacy));
  }
});

// ---------------------------------------------------------------------------------------------
// --init expo

const CREATE_EXPO_APP = {
  'package.json': JSON.stringify({
    name: 'my-app', main: 'expo-router/entry', version: '1.0.0',
    scripts: { start: 'expo start', web: 'expo start --web' },
    dependencies: { expo: '~54.0.0', 'expo-router': '~6.0.0', react: '19.1.0', 'react-native': '0.81.0' },
    devDependencies: { typescript: '~5.9.2' },
    private: true,
  }, null, 2) + '\n',
  'package-lock.json': '{"lockfileVersion": 3}\n',
  'app.json': JSON.stringify({
    expo: {
      name: 'my-app', slug: 'my-app', scheme: 'myapp',
      ios: { bundleIdentifier: 'com.example.myapp' },
      android: { package: 'com.example.myapp' },
    },
  }, null, 2) + '\n',
  'app/_layout.tsx': 'export default function Layout() { return null }\n',
  'app/index.tsx': 'export default function Home() { return null }\n',
  'tsconfig.json': '{"extends": "expo/tsconfig.base"}\n',
};

const PNPM_MONOREPO = {
  'package.json': JSON.stringify({ name: 'mono', private: true, scripts: { build: 'turbo build' }, devDependencies: { turbo: '^2.0.0' } }, null, 2) + '\n',
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - \"packages/*\"\n",
  'turbo.json': '{"tasks": {}}\n',
  'apps/mobile/package.json': JSON.stringify({ name: 'mobile', dependencies: { expo: '~54.0.0', 'expo-router': '~6.0.0' } }, null, 2) + '\n',
  'apps/mobile/app.config.ts': "export default {\n  name: 'mobile',\n  scheme: 'mono',\n  ios: { bundleIdentifier: 'com.example.mono' },\n}\n",
  'apps/mobile/src/app/index.tsx': 'export default function Home() { return null }\n',
  'apps/web/package.json': JSON.stringify({ name: 'web', dependencies: { next: '15.0.0' } }, null, 2) + '\n',
  'packages/ui/package.json': JSON.stringify({ name: 'ui', peerDependencies: { expo: '*' }, devDependencies: { expo: '~54.0.0' } }, null, 2) + '\n',
  'node_modules/expo/package.json': JSON.stringify({ name: 'expo', dependencies: { expo: 'x' } }) + '\n',
};

function assertStarters(root) {
  for (const f of STARTERS) assert.ok(exists(root, f), `${f} was not written`);
  assert.equal(fs.statSync(path.join(root, 'kitchen-denylist.txt')).size, 0, 'the empty denylist is zero bytes');

  const settings = json(path.join(root, '.claude/settings.json'));
  const commands = settings.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(commands.includes('node "$CLAUDE_PROJECT_DIR/.claude/kitchen/scripts/kitchen.mjs" brief'));
  assert.deepEqual(settings.permissions.allow, ['Edit(.claude/tmp/**)', 'Write(.claude/tmp/**)', 'Bash(*)', 'mcp__github']);

  const scripts = json(path.join(root, 'package.json')).scripts;
  assert.equal(scripts['kitchen:doctor'], 'node .claude/kitchen/scripts/doctor.mjs');
  assert.equal(scripts.drive, 'node .claude/kitchen/scripts/drive.mjs');
  assert.equal(scripts['test:scripts'], 'node --test ".claude/scripts/*.test.mjs" ".claude/kitchen/scripts/*.test.mjs"');

  const kitchen = json(path.join(root, '.claude/kitchen.json'));
  assert.equal(kitchen.flows, '.maestro');
  assert.equal(kitchen.design, 'docs/design');
  assert.ok(kitchen.humans.default);
  assert.deepEqual(Object.fromEntries(Object.entries(kitchen.adapters).map(([k, v]) => [k, v.use])), {
    stack: 'supabase-local', db: 'supabase-migrations', auth: 'supabase-auth', errors: 'none', evidenceHost: 'git-branch',
  });
  assert.equal(fs.readFileSync(path.join(root, '.maestro/config.yaml'), 'utf8'), 'flows:\n  - "flows/*.yaml"\n');

  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.equal(claude.match(/<!-- kitchen:start -->/g).length, 1);

  const sources = fs.readFileSync(path.join(root, '.claude/skills.sources'), 'utf8');
  assert.match(sources, /^jacksontriffon\/skills\|main\|skills$/m);
  assert.match(sources, /^jacksontriffon\/skills\|main\|kitchen\|kitchen$/m);

  // Vendored: the kitchen and the portable skills.
  assert.ok(exists(root, '.claude/kitchen/scripts/kitchen.mjs'));
  assert.ok(exists(root, '.claude/kitchen/scripts/doctor.mjs'));
  assert.ok(exists(root, '.claude/skills/alpha/SKILL.md'));

  // No placeholder survives anywhere init wrote.
  for (const f of STARTERS) assert.doesNotMatch(fs.readFileSync(path.join(root, f), 'utf8'), /\{\{[A-Z_]+\}\}/, f);
}

test('--init expo into a create-expo-app repo writes the starter files', (t) => {
  const box = sandbox(t);
  makeSource(box);
  const root = makeProject(box, 'app', CREATE_EXPO_APP);
  git(root, 'remote', 'add', 'origin', 'git@github.com:example-org/my-app.git');

  const r = run(box, root, ['--init', 'expo']);
  assert.equal(r.status, 0, r.out);
  assertStarters(root);

  const kitchen = json(path.join(root, '.claude/kitchen.json'));
  assert.equal(kitchen.repo, 'example-org/my-app');
  assert.equal(kitchen.packageManager, 'npm');
  assert.match(r.out, /Workspace tool:\s+none/);
  assert.deepEqual(kitchen.expo, {
    appDir: '.', routesDir: 'app', appId: 'com.example.myapp', scheme: 'myapp', nativeDirs: ['ios', 'android'],
  });
  assert.match(fs.readFileSync(path.join(root, '.maestro/flows/home.yaml'), 'utf8'), /^appId: com\.example\.myapp$/m);

  // The app's own scripts survive beside the kitchen's.
  const pkg = json(path.join(root, 'package.json'));
  assert.equal(pkg.scripts.start, 'expo start');
  assert.equal(pkg.main, 'expo-router/entry');
});

test('--init expo into a pnpm monorepo finds the app in its workspace', (t) => {
  const box = sandbox(t);
  makeSource(box);
  const root = makeProject(box, 'mono', PNPM_MONOREPO);

  const r = run(box, root, ['--init', 'expo']);
  assert.equal(r.status, 0, r.out);
  assertStarters(root);

  const kitchen = json(path.join(root, '.claude/kitchen.json'));
  assert.equal(kitchen.packageManager, 'pnpm');
  assert.match(r.out, /Workspace tool:\s+turbo/);
  assert.deepEqual(kitchen.expo, {
    appDir: 'apps/mobile',
    routesDir: 'apps/mobile/src/app',
    appId: 'com.example.mono',
    scheme: 'mono',
    nativeDirs: ['apps/mobile/ios', 'apps/mobile/android'],
  });
  assert.ok(!exists(root, 'apps/mobile/.claude'), 'starters go at the repo root');
  assert.equal(json(path.join(root, 'package.json')).scripts.build, 'turbo build');
});

test('a second --init overwrites nothing', (t) => {
  const box = sandbox(t);
  makeSource(box);
  const root = makeProject(box, 'app', {
    ...CREATE_EXPO_APP,
    'CLAUDE.md': '# My app\n\nHouse rules.\n',
    '.claude/settings.json': JSON.stringify({ model: 'opus', permissions: { deny: ['Bash(rm -rf *)'] } }, null, 2) + '\n',
  });

  assert.equal(run(box, root, ['--init', 'expo']).status, 0);

  // What was there before init survives the first run.
  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(claude.startsWith('# My app\n\nHouse rules.\n'));
  const settings = json(path.join(root, '.claude/settings.json'));
  assert.equal(settings.model, 'opus');
  assert.deepEqual(settings.permissions.deny, ['Bash(rm -rf *)']);

  // The project makes the starters its own...
  write(path.join(root, '.claude/BLOCKERS.md'), 'ours now\n');
  write(path.join(root, 'docs/agents/domain.md'), 'ours now\n');
  const kitchen = json(path.join(root, '.claude/kitchen.json'));
  kitchen.repo = 'someone/else';
  write(path.join(root, '.claude/kitchen.json'), JSON.stringify(kitchen) + '\n');
  const pkg = json(path.join(root, 'package.json'));
  pkg.scripts.drive = 'echo custom';
  write(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  write(path.join(root, '.claude/skills.sources'), fs.readFileSync(path.join(root, '.claude/skills.sources'), 'utf8') + '# ours\n');

  const tracked = [...STARTERS, '.claude/skills.sources'];
  const before = snapshot(root, tracked);

  // ...and the second run leaves every one of them alone.
  const r = run(box, root, ['--init', 'expo']);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(snapshot(root, tracked), before);
  assert.doesNotMatch(r.out, /\bwrote\b/);
  assert.match(r.out, /already has a "drive" script; kept yours/);
});

test('--init asks rather than guesses when there is no Expo app or more than one', (t) => {
  const box = sandbox(t);
  makeSource(box);

  const none = makeProject(box, 'none', { 'package.json': '{"name":"plain","dependencies":{"react":"19"}}\n' });
  const r0 = run(box, none, ['--init', 'expo']);
  assert.equal(r0.status, 2, r0.out);
  assert.match(r0.out, /No package here lists expo/);
  assert.match(r0.out, /--app <dir>/);
  assert.ok(!exists(none, '.claude/skills.sources') && !exists(none, '.claude/skills'), 'a run that asks writes nothing');

  const two = makeProject(box, 'two', {
    'package.json': '{"name":"two","private":true,"workspaces":["apps/*"]}\n',
    'yarn.lock': '\n',
    'apps/one/package.json': '{"name":"one","dependencies":{"expo":"~54.0.0"}}\n',
    'apps/two/package.json': '{"name":"two","dependencies":{"expo":"~54.0.0"}}\n',
  });
  const r2 = run(box, two, ['--init', 'expo']);
  assert.equal(r2.status, 2, r2.out);
  assert.match(r2.out, /More than one package lists expo/);
  assert.match(r2.out, /apps\/one/);
  assert.match(r2.out, /apps\/two/);
  assert.ok(!exists(two, '.claude/skills.sources'));

  const r3 = run(box, two, ['--init', 'expo', '--app', 'apps/two']);
  assert.equal(r3.status, 0, r3.out);
  const kitchen = json(path.join(two, '.claude/kitchen.json'));
  assert.equal(kitchen.expo.appDir, 'apps/two');
  assert.equal(kitchen.packageManager, 'yarn');
  assert.match(r3.out, /Workspace tool:\s+yarn-workspaces/);
});

test('--init with no lockfile records pnpm', (t) => {
  const box = sandbox(t);
  makeSource(box);
  const files = { ...CREATE_EXPO_APP };
  delete files['package-lock.json'];
  const root = makeProject(box, 'app', files);
  const r = run(box, root, ['--init', 'expo']);
  assert.equal(r.status, 0, r.out);
  assert.equal(json(path.join(root, '.claude/kitchen.json')).packageManager, 'pnpm');
  assert.match(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), /`pnpm kitchen:doctor`/);
});
