import { Git } from './scm';
import * as isomorphic from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

jest.mock('isomorphic-git');
jest.mock('node:fs');
import fs from 'node:fs';

describe('ansible-aap:scm', () => {
  const git = Git.fromAuth({});
  const dir = 'mockDirectory';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should init', async () => {
    const defaultBranch = 'main';
    await git.init({ dir, defaultBranch });
    expect(isomorphic.init).toHaveBeenCalledWith({
      fs,
      dir,
      defaultBranch,
    });
  });

  it('should clone', async () => {
    const url = 'http://github.com/some/repo';

    await git.clone({ url, dir });

    expect(isomorphic.clone).toHaveBeenCalledWith({
      fs,
      http,
      url,
      dir,
      singleBranch: true,
      depth: 1,
      onProgress: expect.any(Function),
      headers: {
        'user-agent': 'git/@isomorphic-git',
      },
      onAuth: expect.any(Function),
    });
  });

  it('should checkout', async () => {
    const ref = 'master';
    await git.checkout({ dir, ref });
    expect(isomorphic.checkout).toHaveBeenCalledWith({
      fs,
      dir,
      ref,
    });
  });

  it('should create branch', async () => {
    const ref = 'master';
    await git.createBranch({ dir, ref });
    expect(isomorphic.branch).toHaveBeenCalledWith({
      fs,
      dir,
      ref,
    });
  });

  it('should create branch and checkout', async () => {
    const ref = 'master';
    await git.createAndCheckout({ dir, ref });
    expect(isomorphic.branch).toHaveBeenCalledWith({
      fs,
      dir,
      ref,
    });
    expect(isomorphic.checkout).toHaveBeenCalledWith({
      fs,
      dir,
      ref,
    });
  });

  it('should fetch', async () => {
    const remote = 'http://github.com/some/repo';
    await git.fetch({ dir, remote });
    expect(isomorphic.fetch).toHaveBeenCalledWith({
      fs,
      http,
      remote,
      dir,
      tags: false,
      onProgress: expect.any(Function),
      headers: {
        'user-agent': 'git/@isomorphic-git',
      },
      onAuth: expect.any(Function),
    });
  });

  it('should commit and push', async () => {
    const url = 'http://github.com/some/repo';
    const branch = 'main';
    const gitAuthorInfo = { name: 'testUser', email: 'test@email' };
    const commitMessage = 'Mock commit message';
    await git.commitAndPush({ url, dir, branch, gitAuthorInfo, commitMessage });
    expect(isomorphic.add).toHaveBeenCalledWith({
      fs,
      dir,
      filepath: '.',
    });
    expect(isomorphic.commit).toHaveBeenCalledWith({
      fs,
      dir,
      message: commitMessage,
      author: gitAuthorInfo,
      committer: gitAuthorInfo,
    });

    expect(isomorphic.push).toHaveBeenCalledWith({
      fs,
      dir,
      http,
      onProgress: expect.any(Function),
      remoteRef: `refs/heads/${branch}`,
      remote: 'origin',
      headers: {
        'user-agent': 'git/@isomorphic-git',
      },
      url: url,
      onAuth: expect.any(Function),
      corsProxy: '',
    });
  });
});
