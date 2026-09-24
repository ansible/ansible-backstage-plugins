# WP-021 — Initial quality/intent processors

| Field      | Value                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 6 — Projection and processors                                                                                                 |
| Depends on | WP-004 and WP-019                                                                                                             |
| Target     | `content-primitives-backend-module-quality-intent` (module `quality-intent-processors` targeting plugin `content-primitives`) |
| Outcome    | Versioned explainable primitive records for the first approved policies                                                       |

## Human summary

**Why this matters:** Content quality and purpose should be described using visible evidence, not guessed scores or misleading conclusions when source information is unavailable.

**What will change:** A quality and intent processor module will validate approved content structures, report documentation coverage, record maintenance-health facts, and optionally enrich intent using an approved artificial intelligence (AI) provider and policy. Facts remain separate from policy decisions, and every result records its evidence, input, producer, rule version, and semantic state.

**PR scope:** Create and register the module, deterministic bounded parsers, versioned policy evaluators, replay support, explanation documentation, and fixtures for structure, documentation, maintenance, and optional intent processing.

**Not in this PR:** It will not own routing, storage, or scheduling, define a universal quality score or taxonomy, infer abandonment from missing history, or perform behavioral testing. Later work packages will execute the shared result fixtures across the published surfaces.

**Success looks like:** Identical content and policy versions produce identical results, policy changes preserve prior evidence, and unavailable information is reported as unknown, partial, or not scanned rather than fabricated success or failure.

## Scope and changes

Create the Node-only backend module package `content-primitives-backend-module-quality-intent` and implement the required initial processor set: deterministic lightweight structure validation, documentation presence/coverage records, maintenance-health facts, and—only when an approved provider/policy is configured—AI intent enrichment records. The module registers through WP-004/WP-019 extension points and owns no router, primitive database, or scheduler implementation. Separate facts from policy evaluation. Structure checks cover the approved collection/content layouts and malformed/missing required structure without duplicating source-adapter validation. Documentation processors report evidence-backed presence/coverage and semantic unknown/partial states. Maintenance processors use approved observable facts such as release/commit recency, declared support metadata, and deprecation state; they never infer abandonment from unavailable history. Optional AI intent records include taxonomy/prompt/model/provider provenance, confidence, and input digest; when no approved provider exists, the wire state is `not_scanned` and `unsupported` is recorded as an applicability/reason value rather than fabricated intent. Every result identifies policy/rule version, input digest, producer, evidence, confidence where applicable, and semantic state. Avoid a hard-coded universal quality score, maintenance threshold, or intent taxonomy. WP-020 exclusively owns optional behavioral testing and emits it in the `trust` primitive family.

```ts
return {
  namespace: 'quality',
  name: 'documentation-presence',
  schemaVersion: '1.0.0',
  state: 'known',
  value: { present: matches.length > 0 },
  evidence: matches.map(toBoundedEvidence),
  provenance: { policyVersion, inputDigest },
};
```

## Implementation slices

1. Approve schemas/policies for the mandatory structure, documentation, and maintenance processors plus optional AI intent processors; freeze owners, thresholds, taxonomy/versioning, and evidence rules.
2. Build deterministic parsers/fact extractors with resource limits.
3. Build versioned policy evaluators from facts.
4. Register processors, publish surface-neutral consumer fixtures/contracts, and verify existing generic repository queries; route and projector owners expose them later.
5. Add policy-change replay and operator/user explanation documentation.

## Ordered PR series

1. **Applicability and evidence contracts:** approve schemas, policy ownership, semantic states, thresholds/taxonomy versioning, and conformance fixtures; register no production processor.
2. **Deterministic facts:** add bounded structure, documentation, and maintenance fact extractors with malformed/unknown/partial fixtures.
3. **Versioned evaluation:** add policy evaluators, supersession, replay, and explanations without introducing a universal score.
4. **Optional AI intent:** add the approved provider boundary, provenance, redaction, prompt-injection defenses, and explicit disabled/unavailable behavior behind a separate registration flag.
5. **Registration and consumer contracts:** register processor families independently and publish surface-neutral fixtures plus generic repository-query verification.

Each PR must pass its applicable tests, keep every processor family independently disableable by ID/version, and preserve prior immutable evidence during rollback.

## Required tests

- Golden positive, negative, unknown, not-scanned, partial, malformed, and unsupported fixtures.
- Determinism, ordering, locale/time independence, parser bounds, and cancellation.
- Policy version changes supersede records and preserve prior evidence.
- Published API/UI expected-output fixtures explain source facts and do not present unknown as failure; owning surface WPs execute them later.
- Authorization prevents restricted source/evidence leakage.
- Structure fixtures cover valid/missing/malformed collection and contained-content layouts; documentation fixtures cover absent, partial, and complete evidence.
- Optional AI intent tests cover provider disabled/unavailable, deterministic mocked output, low confidence, taxonomy/model change, prompt injection, and provenance/redaction.
- Maintenance tests cover available/unavailable history, current/stale/deprecated evidence, clock boundaries, source disagreement, and policy changes without turning missing data into abandonment.

### Acceptance criteria

- Given identical immutable content and policy version, processing is deterministic.
- Given required evidence is unavailable, state is unknown/partial rather than a fabricated score.
- Given policy changes, the old result remains auditable and the new result is independently addressable.
- Given an unapproved primitive, it cannot be emitted under a reserved namespace.
- Given no approved AI provider/policy, structure and documentation processors still run and intent has wire state `not_scanned` with an `unsupported` applicability/reason value.
- Given unavailable maintenance evidence, the corresponding records are unknown rather than fabricated healthy or failing outcomes.

## Rollback and completion

Disable the module or individual processors by ID/version; never rewrite historical records. Done means package/runtime identity and policy-owner approval for structure, documentation, maintenance, and optional intent semantics plus surface-neutral expected-output fixtures distinguish all states. Authoritative surface execution is deferred to the relevant API/Catalog/frontend WPs and WP-038.
