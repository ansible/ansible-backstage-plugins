/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/** The validation message used for branch names rejected before submission. */
export const BRANCH_NAME_VALIDATION_MESSAGE =
  'Invalid branch name. Use 1–100 characters containing letters, digits, ., _, /, or -, and follow Git branch naming rules.';

/**
 * Returns a validation message for a branch name, or undefined when valid.
 * Undefined means that the Gateway may generate the branch name.
 */
export function validateBranchName(branchName?: string): string | undefined {
  if (branchName === undefined) {
    return undefined;
  }
  if (
    branchName.length === 0 ||
    branchName.length > 100 ||
    !/^[A-Za-z0-9._/-]+$/.test(branchName)
  ) {
    return BRANCH_NAME_VALIDATION_MESSAGE;
  }
  if (
    branchName.includes('..') ||
    branchName.startsWith('/') ||
    branchName.endsWith('/') ||
    branchName.includes('//') ||
    branchName.includes('@{') ||
    branchName.startsWith('-') ||
    branchName === 'HEAD' ||
    branchName.endsWith('.')
  ) {
    return BRANCH_NAME_VALIDATION_MESSAGE;
  }

  const components = branchName.split('/');
  if (
    components.some(
      component => component.startsWith('.') || component.endsWith('.lock'),
    )
  ) {
    return BRANCH_NAME_VALIDATION_MESSAGE;
  }
  return undefined;
}

export function assertValidBranchName(branchName?: string): void {
  const error = validateBranchName(branchName);
  if (error) {
    throw new Error(error);
  }
}
