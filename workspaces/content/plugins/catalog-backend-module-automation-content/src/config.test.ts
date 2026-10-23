import { ConfigReader, JsonValue } from '@backstage/config';
import { readRegistryConfigs, registryUrlError } from './config';

function configWith(registries: Record<string, JsonValue>[]): ConfigReader {
  return new ConfigReader({
    catalog: { providers: { automationContent: { registries } } },
  });
}

describe('registryUrlError', () => {
  /**
   * The shared rule: whatever this function accepts, `POST /config/validate`
   * reports as valid and the loader accepts at startup — and vice versa. The
   * parity matters in both directions; a preflight that approves a URL the
   * loader rejects turns a startup failure into a surprise.
   */
  it.each([
    ['https://quay.io'],
    ['http://localhost:5000'],
    // The parser lowercases the scheme; the loader canonicalizes, so this is valid.
    ['HTTPS://QUAY.IO'],
  ])('accepts %s', url => {
    expect(registryUrlError(url)).toBeUndefined();
  });

  it.each([
    ['quay.io', 'is not a valid absolute URL'],
    ['https://', 'is not a valid absolute URL'],
    ['https://quay.io:99999', 'is not a valid absolute URL'],
    ['file:///etc/passwd', 'must start with http:// or https://'],
    ['ftp://quay.io', 'must start with http:// or https://'],
    ['gopher://example.com', 'must start with http:// or https://'],
    ['https://user:secret@quay.io', 'must not embed credentials'],
    ['https://quay.io?token=x', 'must not include a query or fragment'],
    ['https://quay.io#fragment', 'must not include a query or fragment'],
  ])('rejects %s', (url, reason) => {
    expect(registryUrlError(url)).toContain(reason);
  });
});

describe('readRegistryConfigs', () => {
  it('returns nothing when no registries are configured', () => {
    expect(readRegistryConfigs(new ConfigReader({}))).toEqual([]);
    expect(
      readRegistryConfigs(new ConfigReader({ catalog: { providers: {} } })),
    ).toEqual([]);
  });

  it('reads a valid registry in canonical form', () => {
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
      // Canonical: the parser normalizes the empty path to a trailing slash.
      url: 'https://quay.io/',
    });
    expect(entry.connection.repositories).toEqual(['ansible/ee']);
  });

  it('normalizes scheme case and surrounding whitespace to a usable endpoint', () => {
    // The raw string passes URL parsing but breaks the client later: a
    // trailing space makes every concatenated request URL unparseable, and an
    // uppercase scheme yields broken pull references. Canonical form fixes both.
    const [upper] = readRegistryConfigs(
      configWith([{ name: 'quay', url: '  HTTPS://QUAY.IO  ' }]),
    );
    expect(upper.connection.url).toBe('https://quay.io/');
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

  it('rejects embedded credentials and points at the auth fields', () => {
    expect(() =>
      readRegistryConfigs(
        configWith([{ name: 'quay', url: 'https://user:pass@quay.io' }]),
      ),
    ).toThrow('must not embed credentials; use the auth fields instead');
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

  it('never echoes the raw URL — or anything embedded in it — in the error', () => {
    // A typo'd endpoint can carry credentials; the startup error goes to
    // centralized logs, so it must carry the reason, not the value.
    let thrown: unknown;
    try {
      readRegistryConfigs(
        configWith([
          { name: 'quay', url: 'ftp://user:top-secret-token@quay.io' },
        ]),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain('top-secret-token');
  });
});
