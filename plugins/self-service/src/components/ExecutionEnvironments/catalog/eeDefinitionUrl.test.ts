import { getEEDefinitionFileUrl } from './eeDefinitionUrl';

describe('getEEDefinitionFileUrl', () => {
  it('replaces catalog-info.yaml with ee name .yaml at end of URL', () => {
    const url =
      'https://github.com/org/repo/blob/main/ctx-dir/catalog-info.yaml';
    expect(getEEDefinitionFileUrl(url, 'my-ee')).toBe(
      'https://github.com/org/repo/blob/main/ctx-dir/my-ee.yaml',
    );
  });

  it('strips url: prefix and then replaces catalog-info.yaml', () => {
    const url =
      'url:https://gitlab.com/org/repo/-/blob/main/ee1/catalog-info.yaml';
    expect(getEEDefinitionFileUrl(url, 'ee1')).toBe(
      'https://gitlab.com/org/repo/-/blob/main/ee1/ee1.yaml',
    );
  });

  it('returns URL unchanged when it does not contain catalog-info.yaml', () => {
    const url = 'https://git.example.com/org/repo';
    expect(getEEDefinitionFileUrl(url, 'my-ee')).toBe(
      'https://git.example.com/org/repo',
    );
  });

  it('returns empty string when url is empty', () => {
    expect(getEEDefinitionFileUrl('', 'my-ee')).toBe('');
  });

  it('returns url when eeName is empty', () => {
    const url =
      'https://github.com/org/repo/blob/main/ctx/catalog-info.yaml';
    expect(getEEDefinitionFileUrl(url, '')).toBe(url);
  });
});
