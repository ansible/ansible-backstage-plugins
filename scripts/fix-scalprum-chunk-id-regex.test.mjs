import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  fixScalprumChunkIdRegexInFile,
  walkAndFixScalprumChunkIdRegex,
} from './fix-scalprum-chunk-id-regex.mjs';
import { findScalprumChunkIdRegexViolations } from './verify-scalprum-chunk-id-regex.mjs';

test('fixScalprumChunkIdRegexInFile patches webpack skip regex', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalprum-fix-'));
  const file = path.join(dir, 'bundle.js');
  fs.writeFileSync(
    file,
    'else if(/^(5(277|3|478)|1942)$/.test(h))e[h]=0;',
    'utf8',
  );

  assert.equal(fixScalprumChunkIdRegexInFile(file), true);
  assert.equal(
    fs.readFileSync(file, 'utf8'),
    'else if(/^(5(277|478)|1942)$/.test(h))e[h]=0;',
  );
  assert.equal(fixScalprumChunkIdRegexInFile(file), false);
});

test('walkAndFixScalprumChunkIdRegex patches nested scalprum files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalprum-walk-'));
  const nested = path.join(dir, 'static');
  fs.mkdirSync(nested);
  fs.writeFileSync(
    path.join(nested, 'main.js'),
    'if(/^(5(277|3|478)|484)$/.test(h))e[h]=0;',
    'utf8',
  );

  assert.equal(walkAndFixScalprumChunkIdRegex(dir), 1);
  assert.deepEqual(findScalprumChunkIdRegexViolations(dir), []);
});

test('findScalprumChunkIdRegexViolations reports buggy bundles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalprum-verify-'));
  fs.writeFileSync(
    path.join(dir, 'bad.js'),
    'if(/^(5(277|3|478)|484)$/.test(h))e[h]=0;',
    'utf8',
  );

  const violations = findScalprumChunkIdRegexViolations(dir);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /bad\.js$/);
});
