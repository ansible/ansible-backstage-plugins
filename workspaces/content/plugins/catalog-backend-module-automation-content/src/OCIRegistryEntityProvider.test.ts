import { registryLinkUrl } from './OCIRegistryEntityProvider';

/**
 * The registry URL is stored in canonical form, where a bare host gains a
 * trailing slash. The link used to be built by gluing strings, which produced
 * `https://quay.io//repo`. Both URL shapes must now join to exactly one slash.
 */
describe('registryLinkUrl', () => {
  it.each([
    ['https://quay.io', 'https://quay.io/ansible/ee'],
    ['https://quay.io/', 'https://quay.io/ansible/ee'],
  ])('joins %s without doubling the slash', (registryUrl, expected) => {
    expect(registryLinkUrl(registryUrl, 'ansible/ee')).toBe(expected);
  });

  it('keeps a sub-path mount in the link', () => {
    // The parser replaces the last path segment when joining a relative
    // reference, so a sub-path mount would silently lose its prefix. The
    // join must normalise the base to end with a slash first.
    expect(
      registryLinkUrl('https://host.example.com/harbor-proxy', 'ansible/ee'),
    ).toBe('https://host.example.com/harbor-proxy/ansible/ee');
    expect(
      registryLinkUrl('https://host.example.com/harbor-proxy/', 'ansible/ee'),
    ).toBe('https://host.example.com/harbor-proxy/ansible/ee');
  });

  it('keeps the configured scheme, and assumes https when there is none', () => {
    // Forcing `http://` here would downgrade HTTPS registries.
    expect(registryLinkUrl('http://localhost:5000', 'demo/ee')).toBe(
      'http://localhost:5000/demo/ee',
    );
    expect(registryLinkUrl('host.example.com', 'ansible/ee')).toBe(
      'https://host.example.com/ansible/ee',
    );
  });
});
