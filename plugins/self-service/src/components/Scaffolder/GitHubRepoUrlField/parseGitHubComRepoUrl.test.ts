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

  it('rejects http github.com URLs', () => {
    const result = parseGitHubComRepoUrl('http://github.com/acme/playbooks');
    expect(result).toEqual({
      ok: false,
      error: 'URL must use https:// (github.com only).',
    });
  });

  it('rejects encoded separators and non-ASCII owner names', () => {
    expect(parseGitHubComRepoUrl('https://github.com/%2F/repo').ok).toBe(false);
    expect(parseGitHubComRepoUrl('https://github.com/аcme/repo').ok).toBe(
      false,
    );
  });

  it('rejects malformed branch escapes without throwing', () => {
    expect(() =>
      parseGitHubComRepoUrl('https://github.com/acme/playbooks/tree/%'),
    ).not.toThrow();
    expect(
      parseGitHubComRepoUrl('https://github.com/acme/playbooks/tree/%').ok,
    ).toBe(false);
  });

  it('strips an encoded .git suffix after decoding', () => {
    const result = parseGitHubComRepoUrl(
      'https://github.com/acme/playbooks%2Egit',
    );
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
});
