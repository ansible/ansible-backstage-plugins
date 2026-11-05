import {
  CredentialRedactor,
  publicUrl,
  redactorForConnections,
} from './CredentialRedactor';
import type { RegistryAuth, RegistryConnection } from '../oci/types';

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
  });

  describe('redact', () => {
    it('replaces every occurrence, not just the first', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('hunter2');
      expect(redactor.redact('hunter2 then hunter2')).toBe(
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
      redactor.addSecret('hunter2');
      const text = 'nothing to see';
      expect(redactor.redact(text)).toBe(text);
    });
  });

  describe('redactValue', () => {
    it('deep-copies nested structures, leaving the original untouched', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('hunter2');
      const original = {
        password: 'hunter2',
        nested: { token: 'hunter2', safe: 'plain' },
        list: ['hunter2', 42, true, null],
      };

      const out = redactor.redactValue(original) as typeof original;
      expect(out.password).toBe('[REDACTED]');
      expect(out.nested.token).toBe('[REDACTED]');
      expect(out.nested.safe).toBe('plain');
      expect(out.list[0]).toBe('[REDACTED]');
      expect(out.list[1]).toBe(42);
      expect(out.list[2]).toBe(true);
      expect(out.list[3]).toBeNull();

      expect(original.password).toBe('hunter2');
      expect(original.nested.token).toBe('hunter2');
    });

    it('passes Dates through untouched, by reference', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('hunter2');
      const when = new Date('2026-10-26T12:00:00Z');

      const out = redactor.redactValue({ when, note: 'hunter2' }) as {
        when: Date;
        note: string;
      };
      expect(out.when).toBe(when);
      expect(out.note).toBe('[REDACTED]');
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
      let deep: Record<string, unknown> = { leaf: 'hunter2' };
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
      redactor.addSecret('hunter2');
      let deep: Record<string, unknown> = { leaf: 'hunter2' };
      for (let i = 0; i < 15; i++) {
        deep = { layer: deep };
      }

      const out = redactor.redactValue(deep, { maxDepth: 64 });
      expect(JSON.stringify(out)).toContain('[REDACTED]');
      expect(JSON.stringify(out)).not.toContain('[truncated]');
    });

    it('copies Error objects, redacting message, stack and cause', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('hunter2');
      const original = new Error('auth failed for hunter2');
      original.name = 'RegistryError';
      original.stack = 'Error: at /registry/hunter2 line 3';
      (original as { cause?: unknown }).cause = new Error(
        'token hunter2 rejected',
      );

      const out = redactor.redactValue(original);
      expect(out).toBeInstanceOf(Error);
      const copy = out as Error;
      expect(copy.message).toBe('auth failed for [REDACTED]');
      expect(copy.name).toBe('RegistryError');
      expect(copy.stack).not.toContain('hunter2');
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
      redactor.addSecret('hunter2');
      expect(redactor.redactErrorText('hunter2')).toBe('[REDACTED]');
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
      redactor.addSecret('hunter2');
      expect(redactor.redactErrorText('password is hunter2')).toBe(
        'password is [REDACTED]',
      );
    });
  });

  describe('redactErrorInPlace', () => {
    it('cleans message, stack and cause of the original error', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('hunter2');
      const root = new Error('auth failed for hunter2');
      root.stack = 'Error: at /registry/hunter2 line 3';
      const inner = new Error('token hunter2 rejected');
      (root as { cause?: unknown }).cause = inner;

      redactor.redactErrorInPlace(root);

      expect(root.message).toBe('auth failed for [REDACTED]');
      expect(root.stack).not.toContain('hunter2');
      expect(inner.message).toBe('token [REDACTED] rejected');
    });

    it('leaves values that are not errors alone', () => {
      const redactor = new CredentialRedactor();
      expect(() => redactor.redactErrorInPlace('hunter2')).not.toThrow();
      expect(() => redactor.redactErrorInPlace(null)).not.toThrow();
    });

    it('terminates on a cause cycle', () => {
      const redactor = new CredentialRedactor();
      redactor.addSecret('hunter2');
      const loop: Error & { cause?: unknown } = new Error('loop hunter2');
      loop.cause = loop;

      expect(() => redactor.redactErrorInPlace(loop)).not.toThrow();
      expect(loop.message).toBe('loop [REDACTED]');
    });
  });
});

describe('redactorForConnections', () => {
  it('collects basic-auth passwords', () => {
    const redactor = redactorForConnections([
      connection({ type: 'basic', username: 'ci-bot', password: 'hunter2' }),
    ]);
    expect(redactor.redact('password=hunter2')).toBe('password=[REDACTED]');
  });

  it('collects the base64 form a basic header actually puts on the wire', () => {
    const onTheWire = Buffer.from('ci-bot:hunter2', 'utf8').toString('base64');
    const redactor = redactorForConnections([
      connection({ type: 'basic', username: 'ci-bot', password: 'hunter2' }),
    ]);
    expect(redactor.redact(`Authorization: Basic ${onTheWire}`)).toBe(
      'Authorization: Basic [REDACTED]',
    );
  });

  it('collects pre-issued bearer tokens', () => {
    const redactor = redactorForConnections([
      connection({ type: 'bearer', token: 's3cr3t-t0ken' }),
    ]);
    expect(redactor.redact('Bearer s3cr3t-t0ken')).toBe('Bearer [REDACTED]');
  });

  it('still collects the password field when the declared type is not basic', () => {
    const redactor = redactorForConnections([
      connection({ type: 'bearer', password: 'hunter2' }),
    ]);
    expect(redactor.redact('pw=hunter2')).toBe('pw=[REDACTED]');
  });

  it('collects credentials embedded in the registry URL itself', () => {
    const redactor = redactorForConnections([
      connection(
        { type: 'anonymous' },
        'https://ci:hunter2@registry.example.com',
      ),
    ]);
    expect(
      redactor.redact('GET https://ci:hunter2@registry.example.com/v2/'),
    ).toBe('GET https://ci:[REDACTED]@registry.example.com/v2/');
  });

  it('collects a URL-embedded password in both its spellings', () => {
    // `p@ss` percent-encodes to `p%40ss` inside a URL. Text quoting the URL
    // carries the encoded form; text quoting the configuration carries the
    // decoded one. Both must be recognised.
    const redactor = redactorForConnections([
      connection(
        { type: 'anonymous' },
        'https://ci:p%40ss@registry.example.com',
      ),
    ]);
    expect(redactor.redact('p%40ss and p@ss')).toBe(
      '[REDACTED] and [REDACTED]',
    );
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
    expect(publicUrl('https://ci:hunter2@registry.example.com/v2/path')).toBe(
      'https://registry.example.com/v2/path',
    );
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
