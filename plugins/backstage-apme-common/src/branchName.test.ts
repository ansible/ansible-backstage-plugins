/*
 * Copyright Red Hat
 */

import {
  BRANCH_NAME_VALIDATION_MESSAGE,
  validateBranchName,
} from './branchName';

describe('validateBranchName', () => {
  it.each(['feature/fix-1', 'foo./bar', 'release_2026.09'])(
    'accepts %s',
    branchName => {
      expect(validateBranchName(branchName)).toBeUndefined();
    },
  );

  it('allows an omitted branch for Gateway-generated names', () => {
    expect(validateBranchName()).toBeUndefined();
  });

  it.each([
    '',
    'feature//fix',
    'feature/../fix',
    'feature/.hidden',
    'feature/fix.lock',
    'feature/fix.',
    '-feature',
    'HEAD',
    'feature/@{bad}',
    'feature name',
  ])('rejects %s', branchName => {
    expect(validateBranchName(branchName)).toBe(BRANCH_NAME_VALIDATION_MESSAGE);
  });

  it('rejects names longer than 100 characters', () => {
    expect(validateBranchName('a'.repeat(101))).toBe(
      BRANCH_NAME_VALIDATION_MESSAGE,
    );
  });
});
