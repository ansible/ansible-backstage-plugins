// Generated with AI assistance: OpenCode (OpenAI)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'esbuild';
// Test infrastructure only, kept out of the public barrel and production dependencies.
// eslint-disable-next-line @backstage/no-undeclared-imports
import { createInstrumenter } from 'istanbul-lib-instrument';
// eslint-disable-next-line @backstage/no-undeclared-imports
import { createCoverageMap, type CoverageMapData } from 'istanbul-lib-coverage';

/** Instrument the subprocess entry before bundling, keeping original TS locations. */
export function subprocessCoveragePlugin(entry: string): Plugin {
  return {
    name: 'subprocess-coverage',
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, args => {
        if (args.path !== entry) return undefined;
        const instrumenter = createInstrumenter({
          esModules: true,
          parserPlugins: ['typescript'],
        });
        return {
          contents: instrumenter.instrumentSync(
            readFileSync(entry, 'utf8'),
            entry,
          ),
          loader: 'ts',
          resolveDir: dirname(entry),
        };
      });
    },
  };
}

/** Export on normal exit, including a scenario's non-zero failure verdict. */
export const SUBPROCESS_COVERAGE_BANNER = `
process.on('exit', () => {
  require('node:fs').writeFileSync(
    process.env.OCI_SCENARIO_COVERAGE,
    JSON.stringify(globalThis.__coverage__),
  );
});
`;

/** Merge real child hits before Jest gathers coverage and the test removes its temp files. */
export function mergeSubprocessCoverage(
  coveragePath: string,
  target: CoverageMapData,
): void {
  const child = createCoverageMap(
    JSON.parse(readFileSync(coveragePath, 'utf8')),
  );
  const merged = createCoverageMap(target);
  for (const file of child.files()) {
    const coverage = child.fileCoverageFor(file).data;
    // The parent and child must use the same identity for the original source.
    merged.addFileCoverage({ ...coverage, path: resolve(coverage.path) });
  }
  for (const file of merged.files()) {
    // Jest transports this object between VM contexts; class instances lose their
    // toJSON method there, so publish plain file-coverage data rather than wrappers.
    target[file] = merged.fileCoverageFor(file).data;
  }
}
