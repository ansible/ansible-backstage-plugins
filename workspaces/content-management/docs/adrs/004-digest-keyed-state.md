# ADR-004: Digest-Keyed State

**Status**: Accepted
**Date**: 2026-09-14
**Deciders**: Content management team
**Scope**: Caching, governance state, and anything else keyed to content.

## Context

A registry addresses content two ways. A **digest** (`sha256:…`) is the hash of the bytes:
the name _is_ the content, so the same digest can never return different content. A **tag**
is a mutable pointer that someone can move at any time, to anything.

Conflating the two produces two distinct failures, one cheap and one expensive:

- Caching a tag lookup makes the catalog lie about what an image contains.
- Keying **approval** to a tag silently transfers that approval to whatever the tag is
  later moved to. An image nobody reviewed inherits the blessing of one that was.

The second is a governance hole that looks like a caching detail.

## Alternatives Considered

| Alternative                            | Why rejected                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cache by tag with a short TTL          | Makes the window smaller, not absent. A tag moved inside the TTL is served wrong, and the TTL is a tuning knob. |
| Key governance to `repository:tag`     | The failure above. Approval must attach to reviewed bytes, not to a name pointing at them.                      |
| Re-fetch everything on every reconcile | Correct and wasteful: config blobs are immutable by digest, so re-fetching them buys nothing.                   |

## Decision

**Anything addressed by digest may be cached forever. Anything addressed by tag is never
cached, and no state is ever keyed to a tag.**

1. `DigestCache` stores digest-addressed reads — manifests resolved by digest, config
   blobs, manifest payloads. No TTL and no invalidation logic, because immutability makes
   both unnecessary.
2. Resolving a **tag** always hits the registry. That lookup is precisely how tag movement
   is detected, so caching it would remove the mechanism that notices drift.
3. **Governance state is keyed on digest.** Approval attaches to the bytes that were
   reviewed. When a tag is re-pointed, the new digest carries no approval, and that is the
   correct and intended outcome.
4. Cache statistics (hits, misses, entries, bytes, evictions) are exposed, because "digest
   caching flattens re-sync cost" is a claim that should be observable rather than assumed.

## Consequences

- Warm re-sync approaches free for unchanged content while still detecting movement,
  because the one uncached call per tag is the one that matters.
- A re-pointed tag shows as new, unapproved content. This is the desired behaviour and it
  will occasionally surprise someone; the UI should make the digest visible so it reads as
  a fact rather than a bug.
- Storage grows with distinct digests observed. Eviction is a size concern, never a
  correctness one.
