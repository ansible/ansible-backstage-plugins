import { ConfigReader } from '@backstage/config';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRegistryConfigs } from './config';
// Test infrastructure, deliberately outside the barrel: the generator must
// never reach a published bundle. The deep import resolves to the same
// transformed source every other import of this package uses.
// eslint-disable-next-line @backstage/no-forbidden-package-imports
import { generateTlsTestFixtures } from '@ansible/automation-content-common/src/testing/tlsCertificates';

const FIXTURES = generateTlsTestFixtures();

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
});
