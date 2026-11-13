/*
 * Regenerates bui-baseline.yaml, the frozen inventory of pre-BUI UI usage
 * that the BUI drift check permits to keep existing.
 *
 * Policy: the file may shrink, never grow. Output is deliberately stable
 * (sorted, no timestamps or commit shas) so that a regeneration diff shows
 * only real changes.
 *
 * Usage: node scripts/generate-bui-baseline.mjs [--check]
 *   --check  exit 1 if bui-baseline.yaml is out of date
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBaseline, emitBaseline } from './lib/bui-baseline.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repoRoot, 'bui-baseline.yaml');
const output = emitBaseline(buildBaseline(repoRoot));

if (process.argv.includes('--check')) {
  const current = existsSync(outputPath)
    ? readFileSync(outputPath, 'utf8')
    : '';
  if (current !== output) {
    console.error(
      'bui-baseline.yaml is out of date. Run: node scripts/generate-bui-baseline.mjs',
    );
    process.exit(1);
  }
  process.exit(0);
}

writeFileSync(outputPath, output);
const model = buildBaseline(repoRoot);
console.log(
  `wrote ${relative(repoRoot, outputPath)}: ${model.libraries.length} libraries, ${model.components.length} components`,
);
