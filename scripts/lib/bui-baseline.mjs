/*
 * Shared logic for the BUI drift guard.
 *
 * The baseline file is generated, so it only has to model what we emit:
 * a top-level `libraries:` list (name/reason/files) and a
 * `components:` list (path/name). Parsing is strict on purpose - anything
 * unexpected is an error, never a silent skip - and the round-trip
 * property (parse(emit(model)) deep-equals model) is covered by tests.
 *
 * Kept dependency-free so the check can run before `yarn install`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-types',
  'coverage',
  '.git',
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), files);
    } else {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

// Library imports are tracked in .ts as well as .tsx: a helper module that
// pulls in a non-BUI kit is drift even though it exports no component.
const isSourceFile = (root, p) =>
  /\.tsx?$/.test(p) &&
  !/\.d\.ts$/.test(p) &&
  !/\.(test|spec|stories)\.tsx?$/.test(p) &&
  relative(root, p).split(sep).includes('src');

// Non-BUI UI kits, matched as package prefixes so that packages this file
// has never heard of (@mui/x-data-grid, @patternfly/react-table) are caught
// the first time someone imports them.
const NON_BUI_LIBRARY_MATCHERS = [
  name => name === '@backstage/core-components',
  name => name === 'styled-components',
  name => name.startsWith('@material-ui/'),
  name => name.startsWith('@mui/'),
  name => name.startsWith('@patternfly/react-'),
  name => name.startsWith('@emotion/'),
];

/** '@mui/x-data-grid/foo' -> '@mui/x-data-grid'; 'react-dom/client' -> 'react-dom'. */
export function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

export function isNonBuiLibrary(name) {
  return NON_BUI_LIBRARY_MATCHERS.some(matches => matches(name));
}

// Static imports, side-effect imports, dynamic import() and require() all
// count: a lazily loaded MUI bundle is still MUI.
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g;

function importedPackages(source) {
  const names = new Set();
  for (const match of source.matchAll(SPECIFIER)) {
    const name = packageName(match[1]);
    if (isNonBuiLibrary(name)) names.add(name);
  }
  return names;
}

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const DECLARED = /(?:const|let|var|function|class)\s+([A-Z][A-Za-z0-9_]*)/g;
const DIRECT_EXPORT =
  /export\s+(?:const|let|var|function|class)\s+([A-Z][A-Za-z0-9_]*)/g;
const DEFAULT_EXPORT =
  /export\s+default\s+(?:(?:function|class)\s+)?([A-Z][A-Za-z0-9_]*)\s*;?/g;
const NAMED_EXPORT = /export\s*\{([^}]*)\}(?!\s*from)/g;

// A component counts when it is declared and exported from the same file.
// `export { Foo } from './x'` is a re-export and deliberately skipped.
export function exportedComponents(source) {
  const declared = new Set();
  for (const match of source.matchAll(DECLARED)) declared.add(match[1]);

  const names = new Set();
  const add = (name, local = name) => {
    if (declared.has(local) && /^[A-Z][A-Za-z0-9_]*$/.test(name))
      names.add(name);
  };

  for (const match of source.matchAll(DIRECT_EXPORT)) add(match[1]);
  for (const match of source.matchAll(DEFAULT_EXPORT)) add(match[1]);
  for (const match of source.matchAll(NAMED_EXPORT)) {
    for (const part of match[1].split(',')) {
      // `Internal as PublicButton` exports the alias but declares the local name.
      const [local, exported] = part
        .trim()
        .split(/\s+as\s+/)
        .map(s => s?.trim());
      if (local) add(exported ?? local, local);
    }
  }

  return [...names].filter(
    n =>
      !/^use[A-Z]/.test(n) && // hooks
      !/(Props|Type|Context)$/.test(n) && // type helpers
      !/^[A-Z0-9_]+$/.test(n), // constants such as FOO_PATH
  );
}

export function buildBaseline(root) {
  const files = walk(join(root, 'workspaces')).filter(f =>
    isSourceFile(root, f),
  );
  const filesByLibrary = new Map();
  const components = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(root, file).split(sep).join('/');
    const hits = [...importedPackages(source)];
    if (hits.length === 0) continue;
    for (const lib of hits) {
      if (!filesByLibrary.has(lib)) filesByLibrary.set(lib, []);
      filesByLibrary.get(lib).push(rel);
    }
    if (!rel.endsWith('.tsx')) continue;
    for (const name of exportedComponents(source))
      components.push({ path: rel, name });
  }

  components.sort(
    (a, b) => byCodePoint(a.path, b.path) || byCodePoint(a.name, b.name),
  );

  const libraries = [...filesByLibrary.keys()].sort(byCodePoint).map(lib => {
    const users = filesByLibrary.get(lib);
    const workspaces = [...new Set(users.map(u => u.split('/')[1]))].sort(
      byCodePoint,
    );
    const count = users.length === 1 ? '1 file' : `${users.length} files`;
    const scope =
      workspaces.length === 1
        ? `${count}, confined to ${workspaces[0]}`
        : `${count} across ${workspaces.length} workspaces (${workspaces.join(', ')})`;
    return {
      name: lib,
      reason: `Pre-BUI design requirements; ${scope}`,
      files: [...new Set(users)].sort(byCodePoint),
    };
  });

  return { libraries, components };
}

const quote = value => `'${String(value).replace(/'/g, "''")}'`;

const HEADER = `# bui-baseline.yaml
#
# Frozen inventory of pre-BUI UI usage, generated by
# scripts/generate-bui-baseline.mjs. Do not edit by hand; run
# \`yarn bui:baseline\` instead.
#
# Every entry below predates @backstage/ui and was built to pre-BUI design
# requirements. The exception is historical, not a design choice: new code
# should use @backstage/ui.
#
# Policy: this file may shrink, never grow. A pull request that adds a line
# here is adding BUI drift.
`;

export function emitBaseline({ libraries, components }) {
  const lines = [HEADER, 'libraries:'];
  for (const lib of libraries) {
    lines.push(`  - name: ${quote(lib.name)}`);
    lines.push(`    reason: ${quote(lib.reason)}`);
    lines.push('    files:');
    for (const file of lib.files) lines.push(`      - ${quote(file)}`);
  }
  lines.push('', 'components:');
  for (const c of components) {
    lines.push(`  - path: ${quote(c.path)}`);
    lines.push(`    name: ${quote(c.name)}`);
  }
  return `${lines.join('\n')}\n`;
}

const unquote = raw => {
  const value = raw.trim();
  if (!value.startsWith("'") || !value.endsWith("'")) {
    throw new Error(`expected a single-quoted scalar, got: ${value}`);
  }
  return value.slice(1, -1).replace(/''/g, "'");
};

/** Parses the emitted format. Throws on anything it does not understand. */
export function parseBaseline(text) {
  const model = { libraries: [], components: [] };
  let section = null;
  let library = null;
  let inFiles = false;

  text.split('\n').forEach((line, index) => {
    const where = `bui-baseline.yaml:${index + 1}`;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;

    if (trimmed === 'libraries:' || trimmed === 'components:') {
      section = trimmed.slice(0, -1);
      library = null;
      inFiles = false;
      return;
    }

    if (section === 'libraries') {
      if (trimmed.startsWith('- name: ')) {
        library = { name: unquote(trimmed.slice(8)), reason: '', files: [] };
        model.libraries.push(library);
        inFiles = false;
      } else if (trimmed.startsWith('reason: ') && library) {
        library.reason = unquote(trimmed.slice(8));
      } else if (trimmed === 'files:' && library) {
        inFiles = true;
      } else if (trimmed.startsWith('- ') && library && inFiles) {
        library.files.push(unquote(trimmed.slice(2)));
      } else {
        throw new Error(`${where}: unexpected line: ${trimmed}`);
      }
      return;
    }

    if (section === 'components') {
      if (trimmed.startsWith('- path: ')) {
        model.components.push({ path: unquote(trimmed.slice(8)), name: '' });
      } else if (trimmed.startsWith('name: ')) {
        const current = model.components.at(-1);
        if (!current) throw new Error(`${where}: name before path`);
        current.name = unquote(trimmed.slice(6));
      } else {
        throw new Error(`${where}: unexpected line: ${trimmed}`);
      }
      return;
    }

    throw new Error(`${where}: content before a section header`);
  });

  return model;
}

/** Flat comparable keys: library, library file, and component. */
export function entryKeys(model) {
  const keys = new Set();
  for (const lib of model.libraries) {
    keys.add(`library:${lib.name}`);
    for (const file of lib.files) keys.add(`library-file:${lib.name}:${file}`);
  }
  for (const c of model.components) keys.add(`component:${c.path}:${c.name}`);
  return keys;
}

/** Entries present in `head` but not in `base`, i.e. drift. */
export function added(base, head) {
  const before = entryKeys(base);
  return [...entryKeys(head)].filter(key => !before.has(key)).sort();
}

/** Entries present in `base` but gone in `head`, i.e. legitimate shrinkage. */
export function removed(base, head) {
  const after = entryKeys(head);
  return [...entryKeys(base)].filter(key => !after.has(key)).sort();
}
