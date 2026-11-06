import {
  CredentialRedactor,
  REDACTED,
  publicUrl,
  redactorForConnections,
} from './CredentialRedactor';
import type { RegistryAuth, RegistryConnection } from '../oci/types';
import { fakeRegistryCredentials } from '../testing/fakeCredentials';

const FAKE_CREDENTIALS = fakeRegistryCredentials();
const FAKE_PASSWORD = FAKE_CREDENTIALS.password;
const FAKE_URL_PASSWORD_DECODED = FAKE_CREDENTIALS.urlPasswordDecoded;
const FAKE_URL_PASSWORD_ENCODED = FAKE_CREDENTIALS.urlPasswordEncoded;

function connection(
  auth: RegistryAuth,
  url = 'https://mock.registry',
): RegistryConnection {
  return { name: 'mock', url, auth };
}

describe('CredentialRedactor', () => {
  describe('addSecret', () => {
    it('registers secrets discovered at runtime, such as exchanged tokens', () => {
      const redactor = new CredentialRedactor();
      const text = 'Bearer eyJhbGciOiJ9.zzz';
      expect(redactor.redact(text)).toBe(text);

      redactor.addSecret('eyJhbGciOiJ9.zzz');
      expect(redactor.redact(text)).toBe('Bearer [REDACTED]');
    });

    it('ignores values too short or blank to redact safely', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('');
      redactor.addSecret('   ');
      redactor.addSecret('x');
      redactor.addSecret(undefined);

      const text = 'extra x-ray boxes';
      expect(redactor.redact(text)).toBe(text);
    });

    it('replaces a secret that contains another secret as a whole', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('ab');
      redactor.addSecret('abc');
      expect(redactor.redact('abc and ab')).toBe('[REDACTED] and [REDACTED]');
    });

    it('bounds runtime secrets per owner without evicting another owner', () => {
      const redactor = new CredentialRedactor();
      redactor.addRuntimeSecret('runtime-token-owner-b', 86_400_000, 'owner-b');
      for (let i = 0; i <= 1000; i++) {
        redactor.addRuntimeSecret(
          `runtime-token-owner-a-${i}`,
          86_400_000,
          'owner-a',
        );
      }

      expect(redactor.redact('runtime-token-owner-b')).toBe('[REDACTED]');
      expect(redactor.redact('runtime-token-owner-a-0')).toBe(
        'runtime-token-owner-a-0',
      );
      expect(redactor.redact('runtime-token-owner-a-1000')).toBe('[REDACTED]');
    });

    it('prunes expired runtime tokens for each owner', () => {
      jest.useFakeTimers();
      try {
        const redactor = new CredentialRedactor();
        redactor.addRuntimeSecret('runtime-token-expired', 0, 'owner-a');
        redactor.addRuntimeSecret('runtime-token-live', 86_400_000, 'owner-b');
        jest.advanceTimersByTime(60 * 60 * 1000 + 1);

        expect(redactor.redact('runtime-token-expired')).toBe(
          'runtime-token-expired',
        );
        expect(redactor.redact('runtime-token-live')).toBe('[REDACTED]');
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps configured short secrets but rejects short runtime tokens', () => {
      const configured = new CredentialRedactor();
      configured.addSecret('short');
      const runtimeOnly = new CredentialRedactor();
      runtimeOnly.addRuntimeSecret('short', 86_400_000, 'owner');

      expect(configured.redact('short')).toBe('[REDACTED]');
      expect(runtimeOnly.redact('short')).toBe('short');
    });
  });

  describe('redact', () => {
    it('replaces every occurrence, not just the first', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      expect(redactor.redact(`${FAKE_PASSWORD} then ${FAKE_PASSWORD}`)).toBe(
        '[REDACTED] then [REDACTED]',
      );
    });

    it('treats regex metacharacters literally', () => {
      const redactor = new CredentialRedactor();
      const secret = 'p@$$w.*+?[](){}|^\\-örd';
      redactor.addSecret(secret);
      expect(redactor.redact(`password: ${secret}`)).toBe(
        'password: [REDACTED]',
      );
    });

    it('returns the same string reference when nothing matches', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const text = 'nothing to see';
      expect(redactor.redact(text)).toBe(text);
    });
  });

  describe('redactValue', () => {
    it('deep-copies nested structures, leaving the original untouched', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const original = {
        password: FAKE_PASSWORD,
        nested: { token: FAKE_PASSWORD, safe: 'plain' },
        list: [FAKE_PASSWORD, 42, true, null],
      };

      const out = redactor.redactValue(original) as typeof original;
      expect(out.password).toBe('[REDACTED]');
      expect(out.nested.token).toBe('[REDACTED]');
      expect(out.nested.safe).toBe('plain');
      expect(out.list[0]).toBe('[REDACTED]');
      expect(out.list[1]).toBe(42);
      expect(out.list[2]).toBe(true);
      expect(out.list[3]).toBeNull();

      expect(original.password).toBe(FAKE_PASSWORD);
      expect(original.nested.token).toBe(FAKE_PASSWORD);
    });

    it('passes Dates through untouched, by reference', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const when = new Date('2026-10-26T12:00:00Z');

      const out = redactor.redactValue({ when, note: FAKE_PASSWORD }) as {
        when: Date;
        note: string;
      };
      expect(out.when).toBe(when);
      expect(out.note).toBe('[REDACTED]');
    });

    it('redacts secret keys and preserves __proto__ as data', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const original = JSON.parse(
        `{"${FAKE_PASSWORD}":"value","__proto__":{"polluted":true},"safe":1}`,
      ) as Record<string, unknown>;

      const out = redactor.redactValue(original) as Record<string, unknown>;

      expect(out[REDACTED]).toBe('value');
      expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
      const protoData = Object.getOwnPropertyDescriptor(out, '__proto__')
        ?.value as { polluted?: boolean };
      expect(protoData.polluted).toBe(true);
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it('marks self-referencing structures instead of looping forever', () => {
      const redactor = new CredentialRedactor();
      const node: Record<string, unknown> = { name: 'self' };
      node.self = node;

      const out = redactor.redactValue(node) as Record<string, unknown>;
      expect(out.name).toBe('self');
      expect(out.self).toBe('[circular]');
    });

    it('stops at a sane depth so hostile payloads cannot blow the stack', () => {
      const redactor = new CredentialRedactor();
      let deep: Record<string, unknown> = { leaf: FAKE_PASSWORD };
      for (let i = 0; i < 50; i++) {
        deep = { layer: deep };
      }

      const out = redactor.redactValue(deep);
      let node: unknown = out;
      let found = false;
      for (
        let i = 0;
        i < 20 && node !== null && typeof node === 'object';
        i++
      ) {
        node = (node as { layer?: unknown }).layer;
        if (node === '[truncated]') {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('copies arbitrarily deep structures when the caller raises the cap', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      let deep: Record<string, unknown> = { leaf: FAKE_PASSWORD };
      for (let i = 0; i < 15; i++) {
        deep = { layer: deep };
      }

      const out = redactor.redactValue(deep, { maxDepth: 64 });
      expect(JSON.stringify(out)).toContain('[REDACTED]');
      expect(JSON.stringify(out)).not.toContain('[truncated]');
    });

    it('copies Error objects, redacting message, stack and cause', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const original = new Error(`auth failed for ${FAKE_PASSWORD}`);
      original.name = 'RegistryError';
      original.stack = `Error: at /registry/${FAKE_PASSWORD} line 3`;
      (original as { cause?: unknown }).cause = new Error(
        `token ${FAKE_PASSWORD} rejected`,
      );

      const out = redactor.redactValue(original);
      expect(out).toBeInstanceOf(Error);
      const copy = out as Error;
      expect(copy.message).toBe('auth failed for [REDACTED]');
      expect(copy.name).toBe('RegistryError');
      expect(copy.stack).not.toContain(FAKE_PASSWORD);
      const cause = (copy as { cause?: unknown }).cause as Error;
      expect(cause).toBeInstanceOf(Error);
      expect(cause.message).toBe('token [REDACTED] rejected');
    });
  });

  describe('redactErrorText', () => {
    it('walks cause chains, redacting every link', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('abc123');
      const root = new Error('fetch failed');
      const inner = new Error('rejected');
      (root as { cause?: unknown }).cause = inner;
      (inner as { cause?: unknown }).cause = 'Bearer abc123';

      expect(redactor.redactErrorText(root)).toBe(
        'fetch failed: rejected: Bearer [REDACTED]',
      );
    });

    it('terminates cause cycles instead of looping forever', () => {
      const redactor = new CredentialRedactor();
      const loop = new Error('loop');
      (loop as { cause?: unknown }).cause = loop;
      expect(redactor.redactErrorText(loop)).toBe(
        'loop: (cause chain truncated)',
      );
    });

    it('caps pathological chains at a bounded depth', () => {
      const redactor = new CredentialRedactor();
      let root: unknown = new Error('link-14');
      for (let i = 13; i >= 0; i--) {
        const next = new Error(`link-${i}`);
        (next as { cause?: unknown }).cause = root;
        root = next;
      }

      const text = redactor.redactErrorText(root);
      expect(text.split(': ')).toHaveLength(11);
      expect(text).toContain('(cause chain truncated)');
    });

    it('renders a thrown primitive redacted', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      expect(redactor.redactErrorText(FAKE_PASSWORD)).toBe('[REDACTED]');
    });

    it('renders objects without a message as an unknown error', () => {
      expect(new CredentialRedactor().redactErrorText({})).toBe(
        'unknown error',
      );
    });

    it.each([
      [null, 'null'],
      [undefined, 'undefined'],
      [42, '42'],
      [false, 'false'],
      [new Error(''), 'unknown error'],
      [{ message: 42 }, 'unknown error'],
    ])(
      'renders the rejection value %p as %p, without object stringification',
      (error, message) => {
        expect(new CredentialRedactor().redactErrorText(error)).toBe(message);
      },
    );

    it('redacts a rejection value that quotes a secret', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      expect(redactor.redactErrorText(`password is ${FAKE_PASSWORD}`)).toBe(
        'password is [REDACTED]',
      );
    });
  });

  describe('redactErrorInPlace', () => {
    it('cleans message, stack and cause of the original error', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const root = new Error(`auth failed for ${FAKE_PASSWORD}`);
      root.stack = `Error: at /registry/${FAKE_PASSWORD} line 3`;
      const inner = new Error(`token ${FAKE_PASSWORD} rejected`);
      (root as { cause?: unknown }).cause = inner;

      redactor.redactErrorInPlace(root);

      expect(root.message).toBe('auth failed for [REDACTED]');
      expect(root.stack).not.toContain(FAKE_PASSWORD);
      expect(inner.message).toBe('token [REDACTED] rejected');
    });

    it('redacts enumerable error fields outside the standard properties', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const error = new Error('request failed') as Error & { body?: string };
      error.body = `payload contains ${FAKE_PASSWORD}`;

      expect(redactor.redactErrorInPlace(error)).toBe(true);
      expect(error.body).toBe('payload contains [REDACTED]');
    });

    it('leaves values that are not errors alone', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      expect(() => redactor.redactErrorInPlace(FAKE_PASSWORD)).not.toThrow();
      expect(redactor.redactErrorInPlace(FAKE_PASSWORD)).toBe(false);
      expect(() => redactor.redactErrorInPlace(null)).not.toThrow();
    });

    it('continues through a cause after a non-string message', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const root = {
        message: 42,
        cause: new Error(`nested ${FAKE_PASSWORD}`),
      };

      expect(redactor.redactErrorInPlace(root)).toBe(false);
      expect(redactor.redactErrorText(root)).toBe(
        `unknown error: nested [REDACTED]`,
      );
    });

    it('terminates on a cause cycle', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const loop: Error & { cause?: unknown } = new Error(
        `loop ${FAKE_PASSWORD}`,
      );
      loop.cause = loop;

      expect(() => redactor.redactErrorInPlace(loop)).not.toThrow();
      expect(loop.message).toBe('loop [REDACTED]');
    });

    it('reports when an error has a read-only message', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const timeout = new DOMException(
        `request timed out for ${FAKE_PASSWORD}`,
        'TimeoutError',
      );

      expect(redactor.redactErrorInPlace(timeout)).toBe(false);
      expect(redactor.redactErrorText(timeout)).toBe(
        'request timed out for [REDACTED]',
      );
    });

    it('reports when an Error is frozen', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret(FAKE_PASSWORD);
      const frozen = Object.freeze(new Error(`frozen ${FAKE_PASSWORD}`));

      expect(redactor.redactErrorInPlace(frozen)).toBe(false);
      expect(redactor.redactErrorText(frozen)).toBe('frozen [REDACTED]');
    });
  });
});

describe('redactorForConnections', () => {
  it('collects basic-auth passwords', () => {
    const redactor = redactorForConnections([
      connection({
        type: 'basic',
        username: 'ci-bot',
        password: FAKE_PASSWORD,
      }),
    ]);
    expect(redactor.redact(`password=${FAKE_PASSWORD}`)).toBe(
      'password=[REDACTED]',
    );
  });

  it('collects the base64 form a basic header actually puts on the wire', () => {
    const onTheWire = Buffer.from(`ci-bot:${FAKE_PASSWORD}`, 'utf8').toString(
      'base64',
    );
    const redactor = redactorForConnections([
      connection({
        type: 'basic',
        username: 'ci-bot',
        password: FAKE_PASSWORD,
      }),
    ]);
    expect(redactor.redact(`Authorization: Basic ${onTheWire}`)).toBe(
      'Authorization: Basic [REDACTED]',
    );
  });

  it('collects pre-issued bearer tokens', () => {
    const redactor = redactorForConnections([
      connection({ type: 'bearer', token: FAKE_CREDENTIALS.token }),
    ]);
    expect(redactor.redact(`Bearer ${FAKE_CREDENTIALS.token}`)).toBe(
      'Bearer [REDACTED]',
    );
  });

  it('still collects the password field when the declared type is not basic', () => {
    const redactor = redactorForConnections([
      connection({ type: 'bearer', password: FAKE_PASSWORD }),
    ]);
    expect(redactor.redact(`pw=${FAKE_PASSWORD}`)).toBe('pw=[REDACTED]');
  });

  it('collects credentials embedded in the registry URL itself', () => {
    const redactor = redactorForConnections([
      connection(
        { type: 'anonymous' },
        `https://ci:${FAKE_PASSWORD}@registry.example.com`,
      ),
    ]);
    expect(
      redactor.redact(
        `GET https://ci:${FAKE_PASSWORD}@registry.example.com/v2/`,
      ),
    ).toBe('GET https://ci:[REDACTED]@registry.example.com/v2/');
  });

  it('collects a URL-embedded password in both its spellings', () => {
    // The URL password percent-encodes inside a URL. Text quoting the URL
    // carries the encoded form; text quoting the configuration carries the
    // decoded one. Both must be recognised.
    const redactor = redactorForConnections([
      connection(
        { type: 'anonymous' },
        `https://ci:${FAKE_URL_PASSWORD_ENCODED}@registry.example.com`,
      ),
    ]);
    expect(
      redactor.redact(
        `${FAKE_URL_PASSWORD_ENCODED} and ${FAKE_URL_PASSWORD_DECODED}`,
      ),
    ).toBe('[REDACTED] and [REDACTED]');
  });

  it('gathers secrets across multiple connections', () => {
    const redactor = redactorForConnections([
      connection({ type: 'basic', username: 'a', password: 'one-secret' }),
      connection({ type: 'bearer', token: 'two-secret' }),
    ]);
    expect(redactor.redact('one-secret two-secret')).toBe(
      '[REDACTED] [REDACTED]',
    );
  });

  it('leaves anonymous registries alone', () => {
    const redactor = redactorForConnections([
      connection({ type: 'anonymous' }),
    ]);
    const text = 'GET /v2/ — 200 OK';
    expect(redactor.redact(text)).toBe(text);
  });
});

describe('publicUrl', () => {
  it('removes userinfo, query and fragment, keeping host and path', () => {
    expect(
      publicUrl(`https://ci:${FAKE_PASSWORD}@registry.example.com/v2/path`),
    ).toBe('https://registry.example.com/v2/path');
    expect(publicUrl('https://registry.example.com/?token=abc#frag')).toBe(
      'https://registry.example.com',
    );
  });

  it('keeps protocol, port and a registry mounted under a path', () => {
    expect(publicUrl('http://registry.example.com:8443/registry')).toBe(
      'http://registry.example.com:8443/registry',
    );
  });

  it('returns a clean root URL without a trailing slash', () => {
    expect(publicUrl('https://mock.registry/')).toBe('https://mock.registry');
  });

  it('reduces an unparseable URL to a placeholder rather than echoing it', () => {
    expect(publicUrl('not a URL?token=secret')).toBe('(unparseable URL)');
  });

  it('passes undefined through', () => {
    expect(publicUrl(undefined)).toBeUndefined();
  });
});
