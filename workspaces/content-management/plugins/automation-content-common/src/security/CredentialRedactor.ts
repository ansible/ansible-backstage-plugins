/**
 * Credential redaction for registry connections.
 *
 * The plugin handles operator-supplied credentials: registry passwords,
 * pre-issued bearer tokens, and passwords embedded in registry URLs. Every
 * place that turns those credentials into text — log lines, error messages,
 * API responses — must pass that text through a redactor built from the same
 * connections. The Backstage logger already masks config values marked
 * `@visibility secret`, but that protection covers logs only, and only when
 * the value survives config parsing unchanged. This module is the boundary
 * that holds regardless of logger, transport, or encoding.
 */

import type { RegistryConnection } from '../oci/types';

/** The single replacement marker used for every secret. */
export const REDACTED = '[REDACTED]';

/**
 * Secrets shorter than this are not registered. A one-character secret would
 * shred ordinary words out of every log line while protecting nothing: no
 * real credential is a single character. Backstage's own config secret
 * enumerator draws the same line.
 */
const MIN_SECRET_LENGTH = 2;

/** Runtime tokens need more entropy than operator passwords to be registered. */
const MIN_RUNTIME_SECRET_LENGTH = 8;

/** Keep runtime tokens for a grace period after their registry-side expiry. */
const RUNTIME_SECRET_GRACE_MS = 60 * 60 * 1000;

/** Prevent a registry-provided lifetime from disabling expiry pruning. */
export const MAX_RUNTIME_SECRET_TTL_MS = 24 * 60 * 60 * 1000;

/** Fixed prefix size used to narrow literal secret candidates while scanning. */
const SECRET_PREFIX_LENGTH = 8;

/** Match the per-client OCI token-cache capacity. */
const MAX_RUNTIME_SECRETS_PER_OWNER = 1_000;

/** How many `cause` links redactErrorText walks before giving up. */
const MAX_CAUSE_DEPTH = 10;

/** How deep redactValue copies before replacing the rest of the subtree. */
const MAX_VALUE_DEPTH = 10;

const CIRCULAR = '[circular]';
const TRUNCATED = '[truncated]';
const CAUSE_CHAIN_TRUNCATED = '(cause chain truncated)';
const UNKNOWN_ERROR = 'unknown error';

export class CredentialRedactor {
  /** O(1) membership index for registered secrets. */
  private readonly secretIndex = new Set<string>();

  /** Prefix index for the literal redaction scanner. */
  private readonly secretBuckets = new Map<string, Set<string>>();

  /** Secrets supplied by configuration and therefore retained for process life. */
  private readonly persistentSecrets = new Set<string>();

  /** Owner -> runtime-minted token -> expiry. Each inner map is FIFO. */
  private readonly runtimeSecrets = new Map<string, Map<string, number>>();

  /** Runtime token -> owners that can still use it. */
  private readonly runtimeSecretOwners = new Map<string, Set<string>>();

  private nextRuntimePruneAt = 0;

  /**
   * Register a secret to redact.
   *
   * Values that are not strings, blank, or below the minimum length are
   * ignored; registering the same value twice is a no-op. The value is kept
   * verbatim — trimming it here would stop the redactor from recognising the
   * secret as it actually appears in output.
   */
  addSecret(value: string | undefined | null): void {
    if (typeof value !== 'string') return;
    if (value.trim().length < MIN_SECRET_LENGTH) return;
    this.persistentSecrets.add(value);
    this.insertSecret(value);
  }

  /**
   * Register a short-lived bearer token without allowing runtime churn to grow
   * the redaction set forever. Each owner has the same capacity as its OCI
   * token cache, so one owner cannot evict a token another owner can still use.
   */
  addRuntimeSecret(
    value: string | undefined | null,
    ttlMs: number,
    owner: string,
  ): boolean {
    if (typeof value !== 'string' || value.length < MIN_RUNTIME_SECRET_LENGTH)
      return false;

    const now = Date.now();
    this.pruneRuntimeSecrets(now);
    const ownerSecrets =
      this.runtimeSecrets.get(owner) ?? new Map<string, number>();
    if (
      ownerSecrets.size >= MAX_RUNTIME_SECRETS_PER_OWNER &&
      !ownerSecrets.has(value)
    ) {
      this.evictOldestRuntimeSecret(owner);
    }
    ownerSecrets.delete(value);
    const safeTtl = Number.isFinite(ttlMs)
      ? Math.min(Math.max(0, ttlMs), MAX_RUNTIME_SECRET_TTL_MS)
      : MAX_RUNTIME_SECRET_TTL_MS;
    const expiresAt = now + safeTtl + RUNTIME_SECRET_GRACE_MS;
    ownerSecrets.set(value, expiresAt);
    this.runtimeSecrets.set(owner, ownerSecrets);
    const owners = this.runtimeSecretOwners.get(value) ?? new Set<string>();
    owners.add(owner);
    this.runtimeSecretOwners.set(value, owners);
    this.insertSecret(value);
    this.nextRuntimePruneAt = Math.min(
      this.nextRuntimePruneAt || Number.POSITIVE_INFINITY,
      expiresAt,
    );
    this.pruneRuntimeSecrets(now);
    return true;
  }

  /** Release a runtime token when the owning client evicts it from its cache. */
  releaseRuntimeSecret(value: string, owner: string): void {
    const ownerSecrets = this.runtimeSecrets.get(owner);
    if (!ownerSecrets?.delete(value)) return;
    this.removeRuntimeOwner(value, owner);
    if (ownerSecrets.size === 0) this.runtimeSecrets.delete(owner);
  }

  private evictOldestRuntimeSecret(owner: string): void {
    const ownerSecrets = this.runtimeSecrets.get(owner);
    if (!ownerSecrets?.size) return;

    let oldest: string | undefined;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [secret, expiresAt] of ownerSecrets) {
      if (expiresAt < oldestExpiry) {
        oldestExpiry = expiresAt;
        oldest = secret;
      }
    }
    if (oldest !== undefined) this.releaseRuntimeSecret(oldest, owner);
  }

  private insertSecret(value: string): void {
    if (this.secretIndex.has(value)) return;
    this.secretIndex.add(value);
    const prefix = value.slice(0, SECRET_PREFIX_LENGTH);
    const bucket = this.secretBuckets.get(prefix) ?? new Set<string>();
    bucket.add(value);
    this.secretBuckets.set(prefix, bucket);
  }

  private pruneRuntimeSecrets(now: number): void {
    if (
      this.runtimeSecrets.size === 0 ||
      this.nextRuntimePruneAt === 0 ||
      now < this.nextRuntimePruneAt
    )
      return;

    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const [owner, ownerSecrets] of this.runtimeSecrets) {
      for (const [secret, expiresAt] of ownerSecrets) {
        if (expiresAt <= now) {
          ownerSecrets.delete(secret);
          this.removeRuntimeOwner(secret, owner);
        } else {
          nextExpiry = Math.min(nextExpiry, expiresAt);
        }
      }

      if (ownerSecrets.size === 0) this.runtimeSecrets.delete(owner);
    }

    this.nextRuntimePruneAt =
      nextExpiry === Number.POSITIVE_INFINITY ? 0 : nextExpiry;
  }

  private removeRuntimeOwner(secret: string, owner: string): void {
    const owners = this.runtimeSecretOwners.get(secret);
    if (!owners) return;
    owners.delete(owner);
    if (owners.size > 0) return;

    this.runtimeSecretOwners.delete(secret);
    if (this.persistentSecrets.has(secret)) return;
    this.secretIndex.delete(secret);
    const prefix = secret.slice(0, SECRET_PREFIX_LENGTH);
    const bucket = this.secretBuckets.get(prefix);
    if (bucket) {
      bucket.delete(secret);
      if (bucket.size === 0) this.secretBuckets.delete(prefix);
    }
  }

  /**
   * Replace every occurrence of every registered secret in `text`.
   *
   * A prefix index narrows candidates while scanning the text once. The
   * longest matching candidate wins, so a credential containing another
   * credential is replaced whole. Text with no match comes back unchanged.
   */
  redact(text: string): string {
    this.pruneRuntimeSecrets(Date.now());
    if (this.secretBuckets.size === 0) return text;

    const ranges: Array<[number, number]> = [];
    for (let index = 0; index < text.length; index++) {
      const match = this.secretAt(text, index);
      if (!match) continue;
      const start = index;
      const end = index + match.length;
      const previous = ranges[ranges.length - 1];
      if (previous && start < previous[1]) {
        previous[1] = Math.max(previous[1], end);
      } else {
        ranges.push([start, end]);
      }
    }
    if (ranges.length === 0) return text;

    let result = '';
    let lastCopied = 0;
    for (const [start, end] of ranges) {
      result += text.slice(lastCopied, start) + REDACTED;
      lastCopied = end;
    }
    return result + text.slice(lastCopied);
  }

  private secretAt(text: string, index: number): string | undefined {
    let best: string | undefined;
    const maxPrefix = Math.min(SECRET_PREFIX_LENGTH, text.length - index);
    for (let prefixLength = 2; prefixLength <= maxPrefix; prefixLength++) {
      const bucket = this.secretBuckets.get(
        text.slice(index, index + prefixLength),
      );
      if (!bucket) continue;
      for (const secret of bucket) {
        if (
          (!best || secret.length > best.length) &&
          text.startsWith(secret, index)
        ) {
          best = secret;
        }
      }
    }
    return best;
  }

  /**
   * Return a redacted deep copy of a JSON-like value.
   *
   * The input is never mutated, so callers can hand an object to this method
   * and keep using it. Plain objects, arrays and Errors are copied; strings
   * inside are redacted. Self-references become `[circular]` and structures
   * deeper than the depth cap become `[truncated]`, so hostile or accidental
   * payloads cannot exhaust the stack. Values that cannot hide a secret —
   * numbers, booleans, null, Dates — pass through as they are.
   *
   * The depth cap defaults to a bound sized for hostile diagnostics. Response
   * bodies that legitimately nest deeper — documentation payloads, argument
   * specifications — can raise it with `maxDepth`.
   */
  redactValue(value: unknown, opts?: { maxDepth?: number }): unknown {
    return this.redactNode(
      value,
      0,
      new Set(),
      opts?.maxDepth ?? MAX_VALUE_DEPTH,
    );
  }

  /**
   * Flatten an error, or anything that was thrown, into one redacted line.
   *
   * JavaScript error chains are arbitrary graphs: a `cause` may point back at
   * an earlier link, hold a thrown string instead of an Error, or run deeper
   * than any real failure ever does. This walk bounds all three, redacts every
   * message on the way, and joins the chain with `': '` — the same shape the
   * content index has always used for its error reporting.
   *
   * A rejection value that is not an object is rendered with `String()`:
   * `null` stays `null`, `42` stays `42`. An error that says nothing at all —
   * an empty message, or an object without one — reads as `unknown error`
   * rather than as an empty string.
   */
  redactErrorText(error: unknown): string {
    if (error === null || error === undefined) {
      return this.redact(String(error));
    }

    const parts: string[] = [];
    const seen = new Set<object>();

    let current: unknown = error;
    for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
      if (current === undefined || current === null) break;

      if (typeof current !== 'object') {
        // A bare primitive mid-chain — usually a thrown string.
        parts.push(this.redact(String(current)));
        return parts.join(': ');
      }

      if (seen.has(current)) {
        parts.push(CAUSE_CHAIN_TRUNCATED);
        return parts.join(': ');
      }
      seen.add(current);

      const message = (current as { message?: unknown }).message;
      parts.push(
        this.redact(typeof message === 'string' ? message : UNKNOWN_ERROR),
      );
      current = (current as { cause?: unknown }).cause;
    }

    // The depth budget ran out while a link was still pending.
    if (current !== undefined && current !== null) {
      parts.push(CAUSE_CHAIN_TRUNCATED);
    }

    const joined = parts.join(': ');
    return joined || UNKNOWN_ERROR;
  }

  /**
   * Redact an error in place: message, stack, and a bounded cause chain.
   *
   * For errors that will be rethrown to a handler we do not control — the
   * platform's task runner, express's error middleware — the original object
   * is what gets formatted, so the original object is what must be cleaned.
   * Returns false when a read-only message or stack prevented complete cleanup.
   */
  redactErrorInPlace(error: unknown): boolean {
    if (typeof error === 'string') return this.redact(error) === error;

    const seen = new Set<unknown>();
    let current: unknown = error;
    let complete = true;
    let depth = 0;
    for (; depth < MAX_CAUSE_DEPTH; depth++) {
      if (current === null || current === undefined || seen.has(current)) break;
      if (typeof current !== 'object') {
        if (typeof current === 'string' && this.redact(current) !== current)
          complete = false;
        break;
      }
      seen.add(current);
      const candidate = current as {
        message?: unknown;
        stack?: unknown;
        cause?: unknown;
      };
      let message: unknown;
      try {
        message = candidate.message;
      } catch {
        complete = false;
        current = candidate.cause;
        continue;
      }
      if (typeof message !== 'string') {
        complete = false;
      } else {
        try {
          const cleanMessage = this.redact(message);
          if (cleanMessage !== message) candidate.message = cleanMessage;
        } catch {
          complete = false;
        }
      }
      try {
        if (typeof candidate.stack === 'string') {
          const cleanStack = this.redact(candidate.stack);
          if (cleanStack !== candidate.stack) candidate.stack = cleanStack;
        }
      } catch {
        complete = false;
      }
      for (const key of Object.keys(candidate)) {
        if (key === 'message' || key === 'stack' || key === 'cause') continue;
        try {
          const field = candidate[key as keyof typeof candidate];
          const cleanField =
            typeof field === 'string'
              ? this.redact(field)
              : this.redactNode(field, 0, new Set([current]), MAX_VALUE_DEPTH);
          if (cleanField !== field)
            (candidate as Record<string, unknown>)[key] = cleanField;
        } catch {
          complete = false;
        }
      }
      current = candidate.cause;
    }
    // A cause was still pending when the depth budget ran out: the original
    // may carry unredacted text beyond this depth, so the caller must replace
    // it with the bounded text form.
    if (depth === MAX_CAUSE_DEPTH && current !== null && current !== undefined)
      complete = false;
    return complete;
  }

  /** Redact an error before handing it to a formatter outside this boundary. */
  redactErrorForRethrow(error: unknown): unknown {
    if (this.redactErrorInPlace(error)) return error;

    const replacement = new Error(this.redactErrorText(error)) as Error & {
      name?: string;
      status?: number;
      statusCode?: number;
    };
    const source = error as {
      name?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    if (typeof source?.name === 'string')
      replacement.name = this.redact(source.name);
    if (typeof source?.status === 'number') replacement.status = source.status;
    if (typeof source?.statusCode === 'number')
      replacement.statusCode = source.statusCode;
    return replacement;
  }

  private redactNode(
    value: unknown,
    depth: number,
    ancestors: Set<object>,
    maxDepth: number,
  ): unknown {
    if (typeof value === 'string') return this.redact(value);
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return value;
    if (ancestors.has(value)) return CIRCULAR;
    if (depth >= maxDepth) return TRUNCATED;

    if (value instanceof Error) {
      const copy = new Error(this.redact(value.message));
      copy.name = this.redact(value.name);
      copy.stack =
        value.stack === undefined ? undefined : this.redact(value.stack);
      ancestors.add(value);
      try {
        (copy as { cause?: unknown }).cause = this.redactNode(
          (value as { cause?: unknown }).cause,
          depth + 1,
          ancestors,
          maxDepth,
        );
      } finally {
        ancestors.delete(value);
      }
      return copy;
    }

    if (Array.isArray(value)) {
      const copy: unknown[] = [];
      ancestors.add(value);
      try {
        for (const item of value) {
          copy.push(this.redactNode(item, depth + 1, ancestors, maxDepth));
        }
      } finally {
        ancestors.delete(value);
      }
      return copy;
    }

    const copy: Record<string, unknown> = {};
    ancestors.add(value);
    try {
      for (const [key, entry] of Object.entries(value)) {
        // Redact keys as well as values. defineProperty preserves hostile JSON
        // keys such as __proto__ as data instead of changing the copy's
        // prototype or silently dropping the key.
        Object.defineProperty(copy, this.redact(key), {
          value: this.redactNode(entry, depth + 1, ancestors, maxDepth),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    } finally {
      ancestors.delete(value);
    }
    return copy;
  }
}

/**
 * Build a redactor holding every credential a set of connections can put on
 * the wire or into a URL: the configured password, the pre-issued token, the
 * base64 basic-auth header content, and any password embedded in the registry
 * URL itself — in both the percent-encoded spelling it appears in URLs and
 * the decoded spelling it appears in configuration. Usernames are not
 * secrets — they belong in audit logs by design.
 *
 * Bearer tokens minted by the token-exchange flow exist only at runtime and
 * cannot be collected here; the client performing the exchange must register
 * each token with `addSecret` as soon as it receives one.
 */
export function redactorForConnections(
  connections: Iterable<RegistryConnection>,
): CredentialRedactor {
  const redactor = new CredentialRedactor();
  for (const connection of connections) {
    const { auth, url } = connection;

    redactor.addSecret(auth.password);
    redactor.addSecret(auth.token);

    if (auth.type === 'basic' && auth.username && auth.password) {
      // The exact bytes OCIClient.basicHeader puts on the wire.
      const raw = `${auth.username}:${auth.password}`;
      redactor.addSecret(Buffer.from(raw, 'utf8').toString('base64'));
    }

    const urlPassword = passwordInUrl(url);
    redactor.addSecret(urlPassword);
    if (urlPassword !== undefined && urlPassword.includes('%')) {
      // The parser hands back the encoded form; configuration holds the
      // decoded one. Register both spellings so either is recognised.
      try {
        redactor.addSecret(decodeURIComponent(urlPassword));
      } catch {
        // Malformed percent-encoding: the encoded form is registered above.
      }
    }
  }
  return redactor;
}

/**
 * A URL safe to show: userinfo, query and fragment removed.
 *
 * Each of those parts can carry a credential, and this is the form served in
 * API responses and written into catalog entities. The URL parser decides
 * which part is which — string surgery is bypassable by spelling. The path
 * stays: a registry mounted under a path is still addressable without its
 * credentials.
 */
export function publicUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return '(unparseable URL)';
  }
}

function passwordInUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).password || undefined;
  } catch {
    return undefined;
  }
}
