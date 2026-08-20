#!/usr/bin/env node
/**
 * Fail CI when exported scalprum bundles still contain broken scrollWidth access.
 */
import fs from 'node:fs';
import path from 'node:path';

const DOUBLE_PATCH_BUG =
  '.tableContainerDiv.current?.tableContainerDiv.current.scrollWidth';
const PLAIN_SCROLL_WIDTH_BUG = /\.tableContainerDiv\.current\.scrollWidth/;

export function findScalprumScrollWidthViolations(rootDir) {
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
        if (
          content.includes(DOUBLE_PATCH_BUG) ||
          PLAIN_SCROLL_WIDTH_BUG.test(content)
        ) {
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
      'Usage: node scripts/verify-scalprum-scroll-width.mjs <dist-scalprum-dir>',
    );
    process.exit(1);
  }

  const resolved = path.resolve(target);
  const violations = findScalprumScrollWidthViolations(resolved);

  if (violations.length > 0) {
    console.error('Found broken scrollWidth access in scalprum bundles:');
    for (const file of violations) {
      console.error(`  - ${file}`);
    }
    console.error(
      'Run scripts/fix-scalprum-scroll-width.mjs after rhdh-cli plugin export.',
    );
    process.exit(1);
  }

  console.log(`No broken scrollWidth access in ${resolved}`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
