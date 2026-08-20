#!/usr/bin/env node
/**
 * rhdh-cli export can emit broken GitRepositoriesPage bundle code:
 * - double-patched scrollWidth access on tableContainerDiv refs
 * - missing optional chaining on scrollWidth reads
 *
 * Patch dist-scalprum JS after export so table layout works at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';

/** @type {{ from: string | RegExp, to: string }[]} */
export const SCALPRUM_SCROLL_WIDTH_PATCHES = [
  {
    from: '.tableContainerDiv.current?.tableContainerDiv.current.scrollWidth:0',
    to: '.tableContainerDiv.current?.scrollWidth??0',
  },
  {
    from: /\.tableContainerDiv\.current\.scrollWidth/g,
    to: '.tableContainerDiv.current?.scrollWidth??0',
  },
];

export function fixScalprumScrollWidthInContent(content) {
  let next = content;
  let changed = false;

  for (const { from, to } of SCALPRUM_SCROLL_WIDTH_PATCHES) {
    const patched =
      typeof from === 'string'
        ? next.replaceAll(from, to)
        : next.replace(from, to);
    if (patched !== next) {
      next = patched;
      changed = true;
    }
  }

  return { content: next, changed };
}

export function fixScalprumScrollWidthInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { content: patched, changed } =
    fixScalprumScrollWidthInContent(content);
  if (!changed) {
    return false;
  }
  fs.writeFileSync(filePath, patched, 'utf8');
  return true;
}

export function walkAndFixScalprumScrollWidth(rootDir) {
  if (!fs.existsSync(rootDir)) {
    throw new Error(`scalprum directory not found: ${rootDir}`);
  }

  let fixedFiles = 0;

  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        if (fixScalprumScrollWidthInFile(fullPath)) {
          fixedFiles += 1;
        }
      }
    }
  };

  walk(rootDir);
  return fixedFiles;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error(
      'Usage: node scripts/fix-scalprum-scroll-width.mjs <dist-scalprum-dir>',
    );
    process.exit(1);
  }

  const resolved = path.resolve(target);
  const fixedFiles = walkAndFixScalprumScrollWidth(resolved);
  console.log(
    `Patched scrollWidth access in ${fixedFiles} file(s) under ${resolved}`,
  );
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
