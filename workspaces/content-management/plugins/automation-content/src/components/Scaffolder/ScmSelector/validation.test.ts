import { validateScmSelector } from './validation';

describe('validateScmSelector', () => {
  it('requires a namespace and repository after a provider is selected with credentials', () => {
    expect(validateScmSelector(undefined, false)).toEqual([]);
    expect(validateScmSelector(undefined, true)).toEqual([]);
    expect(
      validateScmSelector(
        {
          provider: '',
          providerLabel: '',
          org: '',
          repoName: '',
          repoExists: false,
        },
        true,
      ),
    ).toEqual([]);
    expect(
      validateScmSelector(
        {
          provider: 'github',
          providerLabel: 'GitHub',
          org: '',
          repoName: '',
          repoExists: false,
        },
        true,
      ),
    ).toEqual(['Select a namespace after authenticating.']);
    expect(
      validateScmSelector(
        {
          provider: 'github',
          providerLabel: 'GitHub',
          org: 'org',
          repoName: '',
          repoExists: false,
        },
        true,
      ),
    ).toEqual(['Enter a repository name.']);
    expect(
      validateScmSelector(
        {
          provider: 'github',
          providerLabel: 'GitHub',
          org: 'org',
          repoName: 'repo',
          repoExists: false,
        },
        true,
      ),
    ).toEqual([]);
  });
});
