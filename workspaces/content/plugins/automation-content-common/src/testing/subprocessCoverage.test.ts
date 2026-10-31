/** @jest-environment node */
// Generated with AI assistance: OpenCode (OpenAI)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  createCoverageMap,
  type CoverageMapData,
  type FileCoverageData,
} from 'istanbul-lib-coverage';
import { mergeSubprocessCoverage } from './subprocessCoverage';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'subprocess-coverage-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function fileCoverage(path: string, hits: number): FileCoverageData {
  const loc = { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } };
  return {
    path,
    statementMap: { 0: loc },
    s: { 0: hits },
    fnMap: {},
    f: {},
    branchMap: { 0: { loc, locations: [loc, loc], type: 'if', line: 5 } },
    b: { 0: [hits, 0] },
  };
}

it('merges child hits with existing hits using normalized original source paths', () => {
  const source = resolve(directory, 'scenario.ts');
  const target: CoverageMapData = { [source]: fileCoverage(source, 2) };
  const childSource = relative(process.cwd(), source);
  const report = join(directory, 'coverage.json');
  writeFileSync(
    report,
    JSON.stringify({ [childSource]: fileCoverage(childSource, 3) }),
  );

  mergeSubprocessCoverage(report, target);
  mergeSubprocessCoverage(report, target);

  const coverage = createCoverageMap(target).fileCoverageFor(source);
  expect(Object.keys(target)).toEqual([source]);
  expect(coverage.getLineCoverage()).toEqual({ 5: 8 });
  expect(coverage.b[0]).toEqual([8, 0]);
  // Jest copies coverage between VM contexts without preserving class prototypes.
  const transported = structuredClone(target);
  expect(createCoverageMap(transported).fileCoverageFor(source).s[0]).toBe(8);
});

it('adds a new source without erasing coverage for other files', () => {
  const existing = join(directory, 'existing.ts');
  const source = join(directory, 'scenario.ts');
  const target: CoverageMapData = { [existing]: fileCoverage(existing, 4) };
  const report = join(directory, 'coverage.json');
  writeFileSync(report, JSON.stringify({ [source]: fileCoverage(source, 1) }));
  mergeSubprocessCoverage(report, target);
  expect(createCoverageMap(target).fileCoverageFor(existing).s[0]).toBe(4);
  expect(createCoverageMap(target).fileCoverageFor(source).s[0]).toBe(1);
});

it('fails visibly when child coverage is missing', () => {
  expect(() =>
    mergeSubprocessCoverage(join(directory, 'missing.json'), {}),
  ).toThrow(/ENOENT/);
});

it.each(['{', '{"invalid": {"data": {}}}'])(
  'fails visibly for malformed coverage %s',
  contents => {
    const report = join(directory, 'coverage.json');
    writeFileSync(report, contents);
    expect(() => mergeSubprocessCoverage(report, {})).toThrow();
  },
);
