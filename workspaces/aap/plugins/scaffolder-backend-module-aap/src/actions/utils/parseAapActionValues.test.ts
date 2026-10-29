/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { InputError } from '@backstage/errors';
import { z } from 'zod';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './parseAapActionValues';

/** Runs `fn` and returns the thrown value, or fails the test if nothing was thrown. */
function catchThrown(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('Expected function to throw');
}

describe('parseAapActionValues', () => {
  const schema = z.object({ a: z.string().min(1) });

  it('returns parsed data on success', () => {
    expect(parseAapActionValues(schema, { a: 'x' }, 'test:action')).toEqual({
      a: 'x',
    });
  });

  it('throws InputError with action id and issue detail when validation fails', () => {
    const e = catchThrown(() =>
      parseAapActionValues(schema, { a: '' }, 'my:action'),
    );
    expect(e).toBeInstanceOf(InputError);
    expect((e as InputError).message).toContain(
      'Invalid input passed to action my:action',
    );
    expect((e as InputError).message).toMatch(
      /a:.*String must contain at least 1 character/,
    );
  });

  it('uses "values" in detail path when issue path is empty (root)', () => {
    const s = z.string().min(3);
    const e = catchThrown(() => parseAapActionValues(s, 'ab', 'root:action'));
    expect(e).toBeInstanceOf(InputError);
    expect((e as InputError).message).toContain('values:');
  });
});

describe('rethrowPreservingInputError', () => {
  it('rethrows InputError unchanged', () => {
    const err = new InputError('bad input');
    expect(() => rethrowPreservingInputError(err)).toThrow(err);
  });

  it('wraps Error with message and clears stack', () => {
    const e = catchThrown(() =>
      rethrowPreservingInputError(new Error('from service')),
    );
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toBe('from service');
    expect((e as Error).stack).toBe('');
  });

  it('uses default message for Error with empty message', () => {
    const empty = new Error('ignored');
    empty.message = '';
    expect(() => rethrowPreservingInputError(empty)).toThrow(
      'Something went wrong.',
    );
  });

  it('uses default message for non-Error throws', () => {
    expect(() => rethrowPreservingInputError('string throw')).toThrow(
      'Something went wrong.',
    );
    expect(() => rethrowPreservingInputError(null)).toThrow(
      'Something went wrong.',
    );
    expect(() => rethrowPreservingInputError(undefined)).toThrow(
      'Something went wrong.',
    );
  });
});
