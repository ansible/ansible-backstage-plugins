/**
 * A cache for content addressed by digest.
 *
 * Anything a registry serves under a `sha256:` address is immutable by definition — the
 * name *is* the hash of the bytes, so the same digest can never return different
 * content. That makes it safe to cache forever, with no invalidation logic and no TTL
 * to tune.
 *
 * The corollary is the important part: anything addressed by **tag** must never be
 * cached here. A tag is a mutable pointer, and caching a tag lookup is precisely how a
 * catalog starts lying about what an image contains.
 */
export interface DigestCacheStats {
  hits: number;
  misses: number;
  entries: number;
  /** Approximate retained payload size, for observability. */
  bytes: number;
  evictions: number;
}

export interface DigestCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, sizeHint?: number): void;
  readonly stats: DigestCacheStats;
  clear(): void;
}

export interface MemoryDigestCacheOptions {
  /** Hard ceiling on entries. Oldest are evicted first. */
  maxEntries?: number;
  /** Hard ceiling on retained bytes, using the size hints supplied on set(). */
  maxBytes?: number;
}

/**
 * Bounded in-memory implementation.
 *
 * Insertion-ordered eviction rather than true LRU: a discovery pass touches each digest
 * once, so recency of *use* carries little signal, and the simpler policy avoids
 * reordering the map on every hit.
 */
export class MemoryDigestCache implements DigestCache {
  private readonly entries = new Map<
    string,
    { value: unknown; bytes: number }
  >();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private bytes = 0;

  constructor(options: MemoryDigestCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 5_000;
    this.maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
  }

  get<T>(key: string): T | undefined {
    const found = this.entries.get(key);
    if (found === undefined) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return found.value as T;
  }

  set<T>(key: string, value: T, sizeHint = 0): void {
    if (this.entries.has(key)) return;

    this.entries.set(key, { value, bytes: sizeHint });
    this.bytes += sizeHint;

    while (
      this.entries.size > this.maxEntries ||
      (this.maxBytes > 0 && this.bytes > this.maxBytes)
    ) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      const evicted = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      this.bytes -= evicted?.bytes ?? 0;
      this.evictions += 1;
    }
  }

  get stats(): DigestCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.entries.size,
      bytes: this.bytes,
      evictions: this.evictions,
    };
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}

/** Cache key. Includes the registry, so one cache can serve many clients safely. */
export function digestKey(
  registry: string,
  repository: string,
  kind: 'manifest' | 'config' | 'blob',
  digest: string,
): string {
  return `${registry}|${repository}|${kind}|${digest}`;
}
