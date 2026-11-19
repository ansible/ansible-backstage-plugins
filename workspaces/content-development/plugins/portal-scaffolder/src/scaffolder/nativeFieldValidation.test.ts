import {
  validateEEFileName,
  validateEETags,
  validateScmSelector,
} from './nativeFieldValidation';

describe('native picker validation', () => {
  it('allows empty optional names but rejects whitespace-only filenames', () => {
    expect(validateEEFileName(undefined)).toEqual([]);
    expect(validateEEFileName('')).toEqual([]);
    expect(validateEEFileName('   ')).toEqual(['Name is required']);
    expect(validateEEFileName('valid-ee')).toEqual([]);
    expect(validateEEFileName('invalid/name')).not.toEqual([]);
  });

  it('validates non-empty tags while allowing empty optional values', () => {
    expect(validateEETags(undefined)).toEqual([]);
    expect(validateEETags([])).toEqual([]);
    expect(validateEETags([''])).toEqual([]);
    expect(validateEETags(['   '])).toEqual(['Tag 1: Tag is required']);
    expect(validateEETags(['execution-environment', 'valid+tag'])).toEqual([]);
    expect(validateEETags(['Invalid Tag'])).toHaveLength(1);
  });

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
