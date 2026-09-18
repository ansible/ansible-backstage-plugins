# WP-020 — Initial trust processors

| Field      | Value                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Phase      | 6 — Projection and processors                                                                               |
| Depends on | WP-004 and WP-019                                                                                           |
| Target     | `content-primitives-backend-module-trust` (module `trust-processors` targeting plugin `content-primitives`) |
| Outcome    | Versioned signature, provenance, freshness, and scoring records with bounded evidence                       |

## Human summary

**Why this matters:** Users need trustworthy, explainable evidence about content signatures, origins, freshness, security findings, and policy scores without missing or failed checks being presented as proof that content is safe.

**What will change:** A trust processor module will verify source-specific Git object and Open Container Initiative (OCI) artifact signatures and provenance, inspect software bills of materials (SBOMs) and vulnerability evidence, assess freshness, optionally run approved isolated behavioral tests, and calculate separately versioned trust scores. Every result will identify the immutable signed subject, mechanism, tools, policies, evidence sources, and versions used.

**PR scope:** Deliver the trust module as the ordered PR series below: contracts/policies, separate Git and OCI signing, provenance and software-supply-chain evidence, isolated behavioral testing, freshness/scoring, and safe exposure/operations. Each PR preserves historical evidence and can be disabled by processor ID/version.

**Not in this PR:** The module will not own routing, the primitive database, or scheduling, and it will not run behavioral tests without an approved isolated runner. Final execution of the shared result fixtures in user-interface, Catalog, and other surfaces belongs to later work packages.

**Success looks like:** Signature substitution fails safely, policy or trust-root changes preserve old evidence while producing new results, and missing or failed scans never become a clean result. Security findings and behavioral-test outcomes remain bounded, redacted where required, and fully traceable to their inputs and tools.

## Scope and changes

Create the Node-only backend module package `content-primitives-backend-module-trust` and implement approved initial processors for source-specific signature verification, attestations/provenance, freshness, security/SBOM evidence, optional behavioral testing, and trust scoring. Git commit/tag/object verification and OCI manifest/artifact-digest verification use distinct processor IDs and applicability contracts; they must not share verifier inputs or infer one signing domain from the other. A common `signing_status` projection may summarize those separate evidence records. The module registers through WP-004/WP-019 extension points and owns no router, primitive database, or scheduler implementation. Security processing inventories approved package/artifact formats, records scanner/database versions and timestamps, and emits vulnerability observations as evidence-backed facts; it does not equate a missing scan, stale advisory database, scanner failure, or unsupported artifact with “no vulnerabilities.” Optional behavioral testing emits `trust.behavioral-testing` records and runs only in an approved isolated runner with explicit content-type applicability, network/resource policy, timeout/cancellation, and untrusted-output handling. Keep cryptographic, inventory/security, behavioral, temporal, and policy/scoring decisions distinct. Anchor all results to immutable digest and record verifier, trust-root, scanner/advisory/runner source, policy, clock/source, and producer versions. Distinguish absent, unsupported, invalid, stale, unknown, not-scanned, partial, and operational failure.

```json
{
  "namespace": "trust",
  "name": "oci-artifact-signature",
  "state": "known",
  "value": { "verified": true },
  "provenance": {
    "signedSubject": "oci-manifest:sha256:…",
    "policyVersion": "…"
  }
}
```

## Implementation slices

1. Approve formats, roots, revocation, freshness clocks, scoring policy, and evidence retention.
2. Implement parsers/verifiers, bounded SBOM/package inventory extraction, vulnerability evidence normalization, isolated behavioral-test integration, and deterministic temporal fact extraction.
3. Implement separately versioned scoring/policy evaluation.
4. Register processors and reprocessing triggers for policy/root/time-window changes.
5. Publish surface-neutral consumer fixtures/contracts and verify existing generic repository queries; route and projector owners expose them later.

## Ordered PR series

1. **Applicability and evidence contracts:** approve formats, semantic states, trust roots, revocation, evidence retention/redaction, freshness clocks, policy inputs, and conformance fixtures; register no production processor.
2. **Signing processors:** implement distinct Git object and OCI artifact processor IDs, applicability, verifier inputs, trust-root rotation, and cross-domain substitution tests.
3. **Provenance and supply-chain evidence:** add attestation/provenance plus bounded SBOM/package inventory and vulnerability normalization with scanner/advisory provenance.
4. **Behavioral testing:** integrate only an approved isolated runner with content-type applicability, resource/network policy, cancellation, bounded output, and disabled/unavailable states.
5. **Freshness and scoring:** add deterministic temporal facts and separately versioned evidence-policy evaluation without source-type fixed scores.
6. **Consumer contracts and operations:** publish authorized/redacted surface-neutral fixtures, verify generic repository queries, and add reprocessing triggers, metrics, runbooks, and final cross-processor fixtures; WP-011/WP-013 and later surface owners publish live APIs.

Each PR must pass its applicable tests below, record prerequisite and policy-owner evidence, remain independently reviewable, and preserve prior immutable evidence on rollback.

## Required tests

- Separate Git commit/tag/object and OCI manifest/artifact-digest fixtures covering valid, invalid, absent, malformed, unsupported, expired, revoked, trust-root rotation, and cross-domain signature substitution.
- Fresh/stale/unknown clock, policy boundary, and deterministic score cases.
- Trust-root/policy rotation supersedes prior results without rewriting evidence.
- Parser/resource/network failures never become false negative facts.
- Restricted signer/provenance evidence is authorized and redacted.
- SBOM absent/present/malformed/oversized, scanner unavailable, stale advisory data, zero/multiple findings, severity normalization, suppression-policy, and sensitive package-evidence fixtures.
- Behavioral runner disabled/unavailable, unsupported content, pass/fail/partial, malicious content, network denial, timeout/cancellation, output bounds, nondeterminism metadata, and runner/policy provenance fixtures.

### Acceptance criteria

- Given a signature for a different subject or signing domain, verification fails safely.
- Given missing evidence, state is not represented as cryptographic invalidity or zero score.
- Given policy/root change, old results remain auditable and new results cite new versions.
- Given operational failure, processor records and the published cross-surface expected-output fixtures preserve the failed/partial semantic state; later surface owners execute those fixtures.
- Given no successful current security scan, no record claims a known clean result; every finding cites the immutable subject, SBOM/scanner, advisory source, and policy versions.
- Given no approved isolated behavioral runner, the canonical `trust.behavioral-testing` record has wire state `not_scanned` and an `unsupported` applicability/reason value rather than a fabricated pass or failure.

## Rollback and completion

Disable the module or individual processor IDs/versions and preserve historical records with validity metadata. Done means package/runtime identity plus approved signature, provenance, security/SBOM, behavioral-testing, rotation, freshness, scoring, processor-record tests, and surface-neutral expected-output contract fixtures pass. Authoritative cross-surface execution occurs in the owning surface WPs and WP-038.
