import { registryLinkUrl } from './OCIRegistryEntityProvider';

/**
 * The registry URL arrives in canonical form from configuration (see
 * `registryUrlError`): absolute http(s), no trailing whitespace, a bare host
 * carrying a trailing slash. Both URL shapes must join to exactly one slash.
 */
describe('registryLinkUrl', () => {
  it.each([
    ['https://quay.io', 'ansible/ee', 'https://quay.io/ansible/ee'],
    ['https://quay.io/', 'ansible/ee', 'https://quay.io/ansible/ee'],
    ['http://localhost:5000', 'demo/ee', 'http://localhost:5000/demo/ee'],
    [
      'https://host.example.com/harbor-proxy',
      'ansible/ee',
      'https://host.example.com/harbor-proxy/ansible/ee',
    ],
    [
      'https://host.example.com/harbor-proxy/',
      'ansible/ee',
      'https://host.example.com/harbor-proxy/ansible/ee',
    ],
  ])(
    'joins %s and %s into a single-slash link',
    (registryUrl, repository, expected) => {
      expect(registryLinkUrl(registryUrl, repository)).toBe(expected);
    },
  );

  /**
   * The repository name is registry-controlled: on any registry that allows
   * pushes, whoever pushed the repository chose it. These names must become
   * harmless path text under the configured registry — never a link with its
   * own scheme, host, query, or fragment.
   */
  it.each([
    // The literal is the attack payload under test, not a script URL in
    // production code; the lint rule exists for the latter.
    // eslint-disable-next-line no-script-url
    'javascript:alert(1)',
    'data:text/html,x',
    '//evil.example/x',
    'https://evil.example/x',
    '../../../escape',
    'repo?redirect=evil',
    'repo#fragment',
  ])('neutralises the hostile repository name %s', repository => {
    const url = registryLinkUrl('https://quay.io', repository);
    expect(url).toBeDefined();
    expect(url!.startsWith('https://quay.io/')).toBe(true);
    const parsed = new URL(url!);
    expect(parsed.origin).toBe('https://quay.io');
    expect(parsed.search).toBe('');
    expect(parsed.hash).toBe('');
  });

  it('returns no link for names that are empty or only traversal', () => {
    expect(registryLinkUrl('https://quay.io', '')).toBeUndefined();
    expect(registryLinkUrl('https://quay.io', '..')).toBeUndefined();
    expect(registryLinkUrl('https://quay.io', '/..//./')).toBeUndefined();
  });
});
