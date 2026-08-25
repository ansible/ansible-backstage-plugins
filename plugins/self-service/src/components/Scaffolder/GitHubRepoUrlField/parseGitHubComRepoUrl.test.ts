/*
 * Copyright Red Hat
 */

import { parseGitHubComRepoUrl } from './parseGitHubComRepoUrl';

describe('parseGitHubComRepoUrl', () => {
  it('parses https github.com owner/repo', () => {
    const result = parseGitHubComRepoUrl('https://github.com/acme/playbooks');
    expect(result).toEqual({
      ok: true,
      value: {
        owner: 'acme',
        repo: 'playbooks',
        httpsUrl: 'https://github.com/acme/playbooks',
        repoUrlPicker: 'github.com?owner=acme&repo=playbooks',
      },
    });
  });

  it('parses git@ and .git suffix', () => {
    const result = parseGitHubComRepoUrl('git@github.com:acme/playbooks.git');
    expect(result).toEqual({
      ok: true,
      value: {
        owner: 'acme',
        repo: 'playbooks',
        httpsUrl: 'https://github.com/acme/playbooks',
        repoUrlPicker: 'github.com?owner=acme&repo=playbooks',
      },
    });
  });

  it('parses tree URL suggested branch', () => {
    const result = parseGitHubComRepoUrl(
      'https://github.com/acme/playbooks/tree/devel',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        owner: 'acme',
        repo: 'playbooks',
        httpsUrl: 'https://github.com/acme/playbooks',
        repoUrlPicker: 'github.com?owner=acme&repo=playbooks',
        suggestedBranch: 'devel',
      },
    });
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
