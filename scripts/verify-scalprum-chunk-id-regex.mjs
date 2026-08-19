#!/usr/bin/env node
/**
 * Fail CI when exported scalprum bundles still contain the buggy webpack
 * chunk-id skip regex (false match on chunk 53).
 */
import fs from 'node:fs';
import path from 'node:path';

const BUGGY_PATTERN = '5(277|3|478)';

export function findScalprumChunkIdRegexViolations(rootDir) {
  if (!fs.existsSync(rootDir)) {
    throw new Error(`scalprum directory not found: ${rootDir}`);
  }

  const violations = [];

  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(BUGGY_PATTERN)) {
          violations.push(fullPath);
        }
      }
    }
  };

  walk(rootDir);
  return violations;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error(
      'Usage: node scripts/verify-scalprum-chunk-id-regex.mjs <dist-scalprum-dir>',
    );
    process.exit(1);
  }

  const resolved = path.resolve(target);
  const violations = findScalprumChunkIdRegexViolations(resolved);

  if (violations.length > 0) {
    console.error(
      `Found buggy webpack chunk-id regex (${BUGGY_PATTERN}) in scalprum bundles:`,
    );
    for (const file of violations) {
      console.error(`  - ${file}`);
    }
    console.error(
      'Run scripts/fix-scalprum-chunk-id-regex.mjs after rhdh-cli plugin export.',
    );
    process.exit(1);
  }

  console.log(`No buggy webpack chunk-id regex in ${resolved}`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
