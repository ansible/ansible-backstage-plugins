import { ConfigReader, JsonValue } from '@backstage/config';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRegistryConfigs } from './config';
// Test infrastructure, deliberately outside the barrel: the generator must
// never reach a published bundle. The deep import resolves to the same
// transformed source every other import of this package uses.
// eslint-disable-next-line @backstage/no-forbidden-package-imports
import { generateTlsTestFixtures } from '@ansible/automation-content-common/src/testing/tlsCertificates';

const FIXTURES = generateTlsTestFixtures();
const directories: string[] = [];

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  readFileSync: jest.fn(jest.requireActual('node:fs').readFileSync),
}));

afterEach(() => {
  directories
    .splice(0)
    .forEach(dir => rmSync(dir, { recursive: true, force: true }));
});

function read(registries: Array<Record<string, unknown>>) {
  return readRegistryConfigs(
    new ConfigReader({
      catalog: { providers: { automationContent: { registries } } },
    } as never),
  );
}

/**
 * A CA bundle on disk, as an operator would mount one: a real certificate,
 * generated at runtime — nothing secret is committed.
 */
function caBundleOnDisk(pem: string = FIXTURES.ca): string {
  const dir = mkdtempSync(join(tmpdir(), 'registry-ca-'));
  directories.push(dir);
  const path = join(dir, 'ca.pem');
  writeFileSync(path, pem);
  return path;
}

describe('readRegistryConfigs: transport trust', () => {
  const registry = { name: 'mock', url: 'https://mock.registry' };

  it('leaves insecure unset by default — verification is the default', () => {
    expect(read([registry])[0].connection.insecure).toBeUndefined();
  });

  it('passes an explicit insecure: true through', () => {
    expect(read([{ ...registry, insecure: true }])[0].connection.insecure).toBe(
      true,
    );
  });

  it('passes an explicit insecure: false through', () => {
    expect(
      read([{ ...registry, insecure: false }])[0].connection.insecure,
    ).toBe(false);
  });

  it('rejects a value that is neither boolean nor a recognized truthy string', () => {
    expect(() => read([{ ...registry, insecure: 'maybe' }])).toThrow(
      /boolean/i,
    );
  });

  it('coerces a YAML-style truthy string, as Backstage config does', () => {
    // The opt-out still ends up explicit: whatever reaches the client as true
    // is warned about at construction.
    expect(
      read([{ ...registry, insecure: 'yes' }])[0].connection.insecure,
    ).toBe(true);
  });
});

describe('readRegistryConfigs: CA bundles', () => {
  const registry = { name: 'mock', url: 'https://mock.registry' };

  it('reads caFile contents into the connection, so verification stays on', () => {
    const caFile = caBundleOnDisk();
    const [entry] = read([{ ...registry, caFile }]);

    expect(entry.connection.ca).toBe(FIXTURES.ca);
    expect(entry.connection.insecure).toBeUndefined();
  });

  it('accepts a multi-certificate bundle, validating every block', () => {
    const caFile = caBundleOnDisk(
      `${FIXTURES.ca}${FIXTURES.trustedServer.cert}`,
    );
    const [entry] = read([{ ...registry, caFile }]);

    expect(entry.connection.ca).toContain('BEGIN CERTIFICATE');
  });

  it('leaves ca unset when no bundle is configured', () => {
    expect(read([registry])[0].connection.ca).toBeUndefined();
  });

  it('fails at startup when the bundle cannot be read, naming the registry', () => {
    expect(() =>
      read([{ ...registry, caFile: '/nonexistent/ca.pem' }]),
    ).toThrow(/mock.*ca\.pem.*ENOENT/);
  });

  it('fails at startup when the bundle contains no certificate', () => {
    const caFile = caBundleOnDisk('plainly not a certificate\n');
    expect(() => read([{ ...registry, caFile }])).toThrow(
      /no PEM certificate found/,
    );
  });

  it('fails at startup when a certificate in the bundle does not parse', () => {
    // PEM markers around garbage: readable, structured, and still not a
    // certificate any TLS stack would trust.
    const caFile = caBundleOnDisk(
      '-----BEGIN CERTIFICATE-----\nnot really, but readable\n-----END CERTIFICATE-----\n',
    );
    expect(() => read([{ ...registry, caFile }])).toThrow(
      /invalid certificate in bundle/,
    );
  });

  it('refuses caFile combined with the insecure opt-out', () => {
    const caFile = caBundleOnDisk();
    expect(() => read([{ ...registry, caFile, insecure: true }])).toThrow(
      /caFile.*insecure|insecure.*caFile/,
    );
  });

  it('keeps verification enabled for a bundle with insecure explicitly false', () => {
    const caFile = caBundleOnDisk();
    expect(
      read([{ ...registry, caFile, insecure: false }])[0].connection,
    ).toMatchObject({
      ca: FIXTURES.ca,
      insecure: false,
    });
  });

  it('rejects an unterminated PEM block', () => {
    const caFile = caBundleOnDisk('-----BEGIN CERTIFICATE-----\ntruncated');
    expect(() => read([{ ...registry, caFile }])).toThrow(
      /no PEM certificate found/,
    );
  });

  it('accepts a complete certificate followed by an unterminated fragment', () => {
    const pem = `${FIXTURES.ca}\n-----BEGIN CERTIFICATE-----\ntruncated`;
    const caFile = caBundleOnDisk(pem);
    expect(read([{ ...registry, caFile }])[0].connection.ca).toBe(pem);
  });

  it('validates later certificates as well as the first block', () => {
    const caFile = caBundleOnDisk(
      `${FIXTURES.ca}\n-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----`,
    );
    expect(() => read([{ ...registry, caFile }])).toThrow(
      /invalid certificate in bundle/,
    );
  });

  it('reports read failures that have no filesystem error code', () => {
    jest.mocked(readFileSync).mockImplementationOnce(() => {
      throw new Error('mount unavailable');
    });
    expect(() => read([{ ...registry, caFile: '/mounted/ca.pem' }])).toThrow(
      /mock.*ca\.pem.*mount unavailable/,
    );
  });
});

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
