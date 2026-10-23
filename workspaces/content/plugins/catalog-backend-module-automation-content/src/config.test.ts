import { ConfigReader, JsonValue } from '@backstage/config';
import { readRegistryConfigs } from './config';

function configWith(registries: Record<string, JsonValue>[]): ConfigReader {
  return new ConfigReader({
    catalog: { providers: { automationContent: { registries } } },
  });
}

describe('readRegistryConfigs', () => {
  it('returns nothing when no registries are configured', () => {
    expect(readRegistryConfigs(new ConfigReader({}))).toEqual([]);
    expect(
      readRegistryConfigs(new ConfigReader({ catalog: { providers: {} } })),
    ).toEqual([]);
  });

  it('reads a valid registry', () => {
    const [entry] = readRegistryConfigs(
      configWith([
        {
          name: 'quay',
          url: 'https://quay.io',
          repositories: ['ansible/ee'],
        },
      ]),
    );

    expect(entry.connection).toMatchObject({
      name: 'quay',
      url: 'https://quay.io',
    });
    expect(entry.connection.repositories).toEqual(['ansible/ee']);
  });

  it('permits plain HTTP, for local development against an insecure registry', () => {
    expect(() =>
      readRegistryConfigs(
        configWith([{ name: 'local', url: 'http://localhost:5000' }]),
      ),
    ).not.toThrow();
  });

  /**
   * The load-time half of the SSRF boundary: an endpoint that is not plain
   * HTTP(S) must never reach a client, because `new URL` happily parses
   * `file:` and `data:` and the fetch would follow.
   */
  it('rejects a URL with a non-HTTP scheme before it can be used', () => {
    expect(() =>
      readRegistryConfigs(
        configWith([{ name: 'quay', url: 'file:///etc/passwd' }]),
      ),
    ).toThrow(
      'automation-content registry "quay": url must start with http:// or https://',
    );
  });

  it('rejects a URL with no scheme at all', () => {
    // `quay.io` looks right to a human; without a scheme it is a relative
    // reference, not an endpoint, and must fail at startup rather than mid-sync.
    expect(() =>
      readRegistryConfigs(configWith([{ name: 'quay', url: 'quay.io' }])),
    ).toThrow('url is not a valid absolute URL');
  });

  it('names the offending registry in the error', () => {
    expect(() =>
      readRegistryConfigs(
        configWith([
          { name: 'good', url: 'https://quay.io' },
          { name: 'bad', url: 'gopher://example.com' },
        ]),
      ),
    ).toThrow('registry "bad"');
  });
});
