# ADR-003: Probe Registry Capabilities, Never Assume Them

**Status**: Accepted
**Date**: 2026-09-14
**Deciders**: Content management team
**Scope**: Every feature that depends on what a storage backend can do.

## Context

"OCI-compliant" describes a far wider range of behaviour than the specification suggests.
Registries differ in which optional APIs they implement, and — more awkwardly — in which
_permitted_ things they reject. A design that reads the spec and assumes conformance works
against the registry it was written on and breaks elsewhere.

This was not a theoretical worry. Building the end-to-end PoC against a stock
`quay.io/projectquay/quay:latest` found **three** separate rejections of behaviour the OCI
spec allows. Each was discovered by a failed push, not by reading documentation:

1. **Custom artifact media types are rejected outright.** Quay validates `config.mediaType`
   against a fixed allowlist. `application/vnd.oci.empty.v1+json` — the OCI 1.1 empty
   descriptor — is not on it. Custom layer media types were rejected too, and so was
   `application/octet-stream`.
2. **The referrers API is unavailable.** `GET /v2/<repo>/referrers/<digest>` returns 404.
3. **Index descriptors require `platform`.** Quay validates the image index against the
   Docker manifest-list schema, where `platform` is required — but the OCI image index
   spec makes it optional, and a non-image artifact has no meaningful platform.

Any one of these breaks a design that assumes OCI 1.1 behaviour.

## Alternatives Considered

| Alternative                                            | Why rejected                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Assume OCI 1.1 and document a minimum registry version | Excludes most registries customers actually run, and converts an integration problem into a support problem.                         |
| Branch on registry vendor and version                  | Vendor identity is a poor proxy for behaviour — the same Quay build differs by configuration — and it hard-codes a list that ages.   |
| Try the rich path and catch the failure                | Half-right: failures surface late, mid-reconcile, and a push that fails has already had side effects. Probing is cheap and up front. |

## Decision

**Every backend is probed for a capability profile, and every feature gates on that
profile and degrades rather than failing.**

1. A `CapabilityProbe` runs per configured backend and produces `BackendCapabilities`.
2. Features read the profile. A missing capability produces a reduced result and a visible
   indicator, never an error. A registry without `_catalog` still lists — from an explicit
   repository list in configuration, which makes the limitation visible in the config shape
   rather than mysterious at runtime.
3. Referrer discovery uses the referrers API when present and the spec's fallback tag
   (`sha256:abc…` → `sha256-abc…`) when it is not, reporting which path it took.
4. **Payloads travel as standard types.** Because custom artifact and layer media types are
   not portable, the content manifest ships as a standard gzipped tar layer — the
   convention ORAS uses — with Ansible identity carried on `artifactType` and in
   annotations. `artifactType` itself is accepted and preserved, but is not a safe baseline
   on its own.
5. Referrer descriptors carry the conventional placeholder
   `{"architecture": "unknown", "os": "unknown"}` so indexes validate against the stricter
   schema.
6. The profile includes accepted config media types and whether index descriptors require
   `platform`. Both were discovered the hard way, and both are probeable.

### A subtlety worth recording

The fallback tag must hold an **image index listing referrer descriptors**, not the
referrer manifest itself. The first implementation pushed the manifest directly under the
fallback tag, which silently broke discovery on exactly the registries that need the
fallback. Only a live test caught it — which is the argument for testing against a real
registry and against a deliberately crippled one, not against a mock built from the spec.

## Consequences

- "Degrades gracefully" is a property under test, not a claim: a deliberately crippled mock
  registry — no `_catalog`, no referrers, no pagination — is the most valuable test asset in
  the suite.
- Adding a backend means implementing the probe honestly. A probe that over-reports is
  worse than one that under-reports.
- The UI must be able to say _why_ something is missing, which means capability and
  staleness are part of the rendered model, not diagnostics hidden in logs.
