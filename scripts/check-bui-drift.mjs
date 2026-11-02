/*
 * Advisory BUI drift check.
 *
 * Two independent signals, because either one alone is easy to defeat:
 *
 *  1. Unlisted drift - regenerating the baseline from the current tree
 *     produces entries the committed file does not have. This is the normal
 *     case: someone adds a PatternFly/MUI component and never regenerates.
 *  2. Baseline growth - the committed file has entries the base branch does
 *     not. This catches regenerating to silence signal 1.
 *
 * Shrinkage is always fine and reported as informational.
 *
 * Never blocks unless --strict is passed. Exit code is 0 by default so the
 * workflow can stay non-blocking while the ratchet is being proven.
 *
 * Usage:
 *   node scripts/check-bui-drift.mjs [--base origin/main]
 *                                    [--format text|github|json]
 *                                    [--strict]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  added,
  buildBaseline,
  emitBaseline,
  parseBaseline,
  removed,
} from './lib/bui-baseline.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = resolve(repoRoot, 'bui-baseline.yaml');

const argv = process.argv.slice(2);
const flag = name => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : (argv[i + 1] ?? true);
};
const baseRef = flag('base') ?? 'origin/main';
const format = flag('format') ?? 'text';
const strict = argv.includes('--strict');

const EMPTY = { libraries: [], components: [] };

const committedText = existsSync(baselinePath)
  ? readFileSync(baselinePath, 'utf8')
  : '';
const committed = committedText ? parseBaseline(committedText) : EMPTY;
const regenerated = buildBaseline(repoRoot);

let base = EMPTY;
let baseError;
let baseAvailable = false;
try {
  base = parseBaseline(
    execFileSync('git', ['show', `${baseRef}:bui-baseline.yaml`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  baseAvailable = true;
} catch (error) {
  baseError = `no bui-baseline.yaml at ${baseRef} (${error.status ?? 'error'})`;
}

const unlisted = added(committed, regenerated);
// Without a baseline on the base branch every entry looks new, which is true
// but useless - this is the PR that introduces the file.
const grown = baseAvailable ? added(base, committed) : [];
const shrunk = baseAvailable ? removed(base, committed) : [];
const stale = emitBaseline(regenerated) !== emitBaseline(committed);

// Split a comparable key back into something a reviewer can read. Library
// names never contain ':', so the first one separates the kind.
function describe(key) {
  const [kind, ...rest] = key.split(':');
  if (kind === 'library') {
    const name = rest.join(':');
    return { kind, name, label: `library ${name}`, detail: `library ${name}` };
  }
  if (kind === 'library-file') {
    const [name, ...path] = rest;
    return {
      kind,
      name,
      path: path.join(':'),
      label: `${path.join(':')} imports ${name}`,
      detail: `imports ${name}`,
    };
  }
  const [path, ...name] = rest;
  return {
    kind,
    path,
    name: name.join(':'),
    label: `${path} exports ${name.join(':')}`,
    detail: `exports ${name.join(':')}`,
  };
}

const findings = unlisted.map(describe);
const growth = grown.map(describe);

if (format === 'json') {
  console.log(
    JSON.stringify(
      { unlisted: findings, growth, shrunk, baseError, strict },
      null,
      2,
    ),
  );
} else if (format === 'github') {
  if (baseError) console.log(`::notice title=BUI drift::${baseError}`);
  for (const f of findings) {
    const target = f.path ? `file=${f.path},line=1,` : '';
    console.log(`::warning ${target}title=BUI drift::${f.detail}`);
  }
  for (const f of growth) {
    const target = f.path ? `file=${f.path},line=1,` : '';
    console.log(
      `::warning ${target}title=BUI baseline grew::${f.detail} (approved exception?)`,
    );
  }
  console.log(
    `::notice title=BUI drift summary::${findings.length} unlisted, ${growth.length} baseline growth, ${shrunk.length} removed`,
  );
} else {
  const out = [];
  out.push(
    stale
      ? 'BUI drift check - ADVISORY (not blocking)\n'
      : 'BUI drift check - clean\n',
  );

  const LIMIT = 20;
  const section = (title, rows, note) => {
    out.push(`${title} (${rows.length})`);
    if (rows.length === 0) out.push('  none');
    for (const row of rows.slice(0, LIMIT)) out.push(`  ${row.label}`);
    if (rows.length > LIMIT)
      out.push(`  ... and ${rows.length - LIMIT} more (use --format json)`);
    if (rows.length > 0 && note) out.push(`  ${note}`);
    out.push('');
  };

  section(
    'Non-BUI usage not in the baseline',
    findings,
    'Convert to @backstage/ui, or regenerate only with maintainer approval.',
  );
  if (baseAvailable) {
    section(
      `Baseline growth vs ${baseRef}`,
      growth,
      'Growing the baseline is drift; the file may shrink, never grow.',
    );
    section(
      'Removed since the baseline',
      shrunk,
      'Fine - the ratchet went down.',
    );
  } else {
    out.push(`Note: ${baseError}; base comparison skipped.\n`);
  }

  out.push(
    `Grandfathered today: ${committed.components.length} components, ${committed.libraries.length} libraries.`,
  );
  console.log(out.join('\n'));
}

process.exit(strict && (findings.length > 0 || growth.length > 0) ? 1 : 0);
