#!/usr/bin/env node
/**
 * Webpack compileBooleanMatcher can group numeric chunk ids 5277, 53, and 5478
 * into the regex 5(277|3|478), which falsely treats chunk 53 as preloaded.
 * GitRepositoriesPage (and other routes) call n.e(53) for module-federation
 * consumes; skipping load causes ChunkLoadError at runtime in scalprum hubs.
 */
import fs from 'node:fs';
import path from 'node:path';

const BUGGY_PATTERN = '5(277|3|478)';
const FIXED_PATTERN = '5(277|478)';

export function fixScalprumChunkIdRegexInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(BUGGY_PATTERN)) {
    return false;
  }
  fs.writeFileSync(
    filePath,
    content.replaceAll(BUGGY_PATTERN, FIXED_PATTERN),
    'utf8',
  );
  return true;
}

export function walkAndFixScalprumChunkIdRegex(rootDir) {
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
        if (fixScalprumChunkIdRegexInFile(fullPath)) {
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
      'Usage: node scripts/fix-scalprum-chunk-id-regex.mjs <dist-scalprum-dir>',
    );
    process.exit(1);
  }

  const resolved = path.resolve(target);
  const fixedFiles = walkAndFixScalprumChunkIdRegex(resolved);
  console.log(
    `Patched webpack chunk-id regex in ${fixedFiles} file(s) under ${resolved}`,
  );
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
