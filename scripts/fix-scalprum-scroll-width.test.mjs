import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  fixScalprumScrollWidthInContent,
  fixScalprumScrollWidthInFile,
  walkAndFixScalprumScrollWidth,
} from './fix-scalprum-scroll-width.mjs';
import { findScalprumScrollWidthViolations } from './verify-scalprum-scroll-width.mjs';

test('fixScalprumScrollWidthInContent repairs double-patched scrollWidth', () => {
  const input =
    'const w=el.tableContainerDiv.current?.tableContainerDiv.current.scrollWidth:0;';
  const { content, changed } = fixScalprumScrollWidthInContent(input);

  assert.equal(changed, true);
  assert.equal(
    content,
    'const w=el.tableContainerDiv.current?.scrollWidth??0;',
  );
});

test('fixScalprumScrollWidthInContent adds optional chaining on scrollWidth', () => {
  const input = 'const w=el.tableContainerDiv.current.scrollWidth;';
  const { content, changed } = fixScalprumScrollWidthInContent(input);

  assert.equal(changed, true);
  assert.equal(
    content,
    'const w=el.tableContainerDiv.current?.scrollWidth??0;',
  );
});

test('fixScalprumScrollWidthInFile is idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalprum-scroll-'));
  const file = path.join(dir, 'bundle.js');
  fs.writeFileSync(file, 'x.tableContainerDiv.current.scrollWidth', 'utf8');

  assert.equal(fixScalprumScrollWidthInFile(file), true);
  assert.equal(
    fs.readFileSync(file, 'utf8'),
    'x.tableContainerDiv.current?.scrollWidth??0',
  );
  assert.equal(fixScalprumScrollWidthInFile(file), false);
});

test('walkAndFixScalprumScrollWidth patches nested scalprum files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalprum-scroll-walk-'));
  const nested = path.join(dir, 'static');
  fs.mkdirSync(nested);
  fs.writeFileSync(
    path.join(nested, 'main.js'),
    'x.tableContainerDiv.current.scrollWidth',
    'utf8',
  );

  assert.equal(walkAndFixScalprumScrollWidth(dir), 1);
  assert.deepEqual(findScalprumScrollWidthViolations(dir), []);
});

test('findScalprumScrollWidthViolations reports broken bundles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalprum-scroll-verify-'));
  fs.writeFileSync(
    path.join(dir, 'bad.js'),
    'x.tableContainerDiv.current?.tableContainerDiv.current.scrollWidth:0',
    'utf8',
  );

  const violations = findScalprumScrollWidthViolations(dir);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /bad\.js$/);
});
