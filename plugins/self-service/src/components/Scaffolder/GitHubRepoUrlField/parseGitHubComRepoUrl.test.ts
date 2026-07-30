/*
 * Copyright Red Hat
 */

import { parseGitHubComRepoUrl } from './parseGitHubComRepoUrl';

describe('parseGitHubComRepoUrl', () => {
  it('parses https github.com owner/repo', () => {
    const result = parseGitHubComRepoUrl('https://github.com/ansible/apme');
    expect(result).toEqual({
      ok: true,
      value: {
        owner: 'ansible',
        repo: 'apme',
        httpsUrl: 'https://github.com/ansible/apme',
        repoUrlPicker: 'github.com?owner=ansible&repo=apme',
      },
    });
  });

  it('parses git@ and .git suffix', () => {
    const result = parseGitHubComRepoUrl('git@github.com:ansible/apme.git');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.owner).toBe('ansible');
      expect(result.value.repo).toBe('apme');
      expect(result.value.httpsUrl).toBe('https://github.com/ansible/apme');
    }
  });

  it('parses tree URL suggested branch', () => {
    const result = parseGitHubComRepoUrl(
      'https://github.com/ansible/apme/tree/devel',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.suggestedBranch).toBe('devel');
      expect(result.value.repo).toBe('apme');
    }
  });

  it('rejects gitlab and other hosts', () => {
    const result = parseGitHubComRepoUrl('https://gitlab.com/o/r');
    expect(result).toEqual({
      ok: false,
      error: 'Only github.com repositories are supported right now.',
    });
  });

  it('rejects incomplete paths', () => {
    const result = parseGitHubComRepoUrl('https://github.com/only-owner');
    expect(result.ok).toBe(false);
  });

  it('rejects empty', () => {
    expect(parseGitHubComRepoUrl('').ok).toBe(false);
  });
});
