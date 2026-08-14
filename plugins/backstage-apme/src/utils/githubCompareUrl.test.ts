/*
 * Copyright Red Hat
 */

import {
  buildGithubCompareUrl,
  buildGithubBranchUrl,
  prFilesUrl,
} from './githubCompareUrl';

describe('buildGithubCompareUrl', () => {
  it('builds GitHub compare URL', () => {
    expect(
      buildGithubCompareUrl(
        'https://github.com/acme/demo',
        'main',
        'apme/remediate-abc',
      ),
    ).toBe(
      'https://github.com/acme/demo/compare/main...apme%2Fremediate-abc',
    );
  });

  it('returns null when inputs are incomplete', () => {
    expect(buildGithubCompareUrl(null, 'main', 'feature')).toBeNull();
    expect(buildGithubCompareUrl('https://github.com/a/b', '', 'feature')).toBeNull();
  });
});

describe('buildGithubBranchUrl', () => {
  it('builds GitHub tree URL for branch names with slashes', () => {
    expect(
      buildGithubBranchUrl(
        'https://github.com/acme/demo',
        'apme/remediate-8a38230f',
      ),
    ).toBe(
      'https://github.com/acme/demo/tree/apme/remediate-8a38230f',
    );
  });

  it('returns null when inputs are incomplete', () => {
    expect(buildGithubBranchUrl(null, 'main')).toBeNull();
    expect(buildGithubBranchUrl('https://github.com/a/b', '')).toBeNull();
  });
});

describe('prFilesUrl', () => {
  it('appends /files when missing', () => {
    expect(prFilesUrl('https://github.com/org/repo/pull/1')).toBe(
      'https://github.com/org/repo/pull/1/files',
    );
  });

  it('preserves existing /files suffix', () => {
    expect(prFilesUrl('https://github.com/org/repo/pull/1/files')).toBe(
      'https://github.com/org/repo/pull/1/files',
    );
  });
});
