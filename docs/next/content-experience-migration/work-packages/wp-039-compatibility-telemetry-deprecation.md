# WP-039 — Compatibility telemetry/deprecation

| Field      | Value                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Phase      | 11 — Retirement                                                                                  |
| Depends on | WP-014, WP-038, WP-043, and WP-045                                                               |
| Outcome    | Evidence-based removal of aliases, dual paths, old exports, routes, artifacts, and browser state |

## Human summary

**Why this matters:** Temporary aliases, old routes, dual implementations, exports, artifacts, and browser-state readers can become permanent liabilities if nobody knows whether they are still used. Retirement must be based on measured usage, proven parity, working rollback, and complete migration guidance.

**What will change:** Every compatibility mechanism will receive an owner, telemetry, supported-caller record, removal conditions, migration documentation, target release, and rollback evidence. A checked documentation ledger will also link each required guide or reference to its owning work package.

**PR scope:** Generate the compatibility and documentation registers, add privacy-safe measurements, contact known consumers, and enforce retirement gates. Each later contract-family removal is its own focused pull request with post-removal observation.

**Not in this PR:** This work will not invent application programming interface (API) contracts, take documentation ownership away from the work packages that implement them, or combine unrelated compatibility removals. Unknown usage, missing documentation, failed parity, or an untested rollback will block removal.

**Success looks like:** No compatibility mechanism remains indefinitely without an owner and dated removal condition. Retired paths show no regression during observation, rollback remains available for its support window, and the linked migration documentation can be followed in a clean supported environment.

## Scope and changes

Instrument every compatibility mechanism recorded by prior route, runtime, and browser-state work packages with an owner, introduced release, supported callers, usage/error/latency telemetry, migration documentation, rollback mechanism, zero-usage window, target removal release, and removal gate. WP-038 is the parity gate; WP-014, WP-043, and WP-045 provide the directly consumed route, runtime, and browser-state ledgers. Use contract-family retirement, not one global switch.

Own the final documentation-completeness gate without taking implementation ownership away from the authoring WPs. Build a generated/checked documentation ledger with these required assignments: package READMEs (each package-producing WP; WP-039 audits); architecture overview and data-flow diagrams (WP-002); adapter and content-type authoring guides (WP-004); domain dynamic-plugin registration (WP-043); generic settings contributions (WP-022), APME settings storage/migration (WP-028), and source settings administration (WP-042); operation registration plus authorization/audit/exposure (WP-012 and WP-013); declarative templates and custom actions (WP-026); MCP deployment/identity (WP-036 and WP-037); database migration/backup/restore (WP-009), projector rebuild (WP-018), and search rebuild (WP-033/WP-034); compatibility/deprecation and consumer migration (WP-039); APME extraction/install/rollback (WP-032); and the consolidated OpenAPI/schema reference authored by shared DTO/client and normalized-read owners (WP-005/WP-011), operations/jobs (WP-012), AAP operations (WP-027), APME APIs/events/operations (WP-029), search/intent/requirements (WP-035), and source-administration APIs (WP-042). WP-039 audits and publishes the index but never invents another owner's API contract. A missing, stale, unlinked, or unvalidated ledger entry blocks migration completion.

```yaml
compatibility_id: legacy-content-detail
owner: content-platform
introduced_release: x.y
remove_after:
  zero_usage_days: 30
  parity_suite: green
  rollback_rehearsal: passed
  consumer_signoff: required
```

## Implementation slices

1. Generate the compatibility register from route/export/runtime/browser ledgers.
2. Add privacy-safe usage/deprecation metrics and consumer classification.
3. Publish migration notices and contact known consumers.
4. Evaluate and record gates per contract family; schedule each approved removal as a later focused PR.
5. Define post-removal observation and rollback requirements for those focused removal PRs.
6. Generate the documentation ledger, verify every canonical deliverable has an authoring WP/owner and live link, run all documented commands/examples, and publish one indexed migration documentation set.

## Required tests

- Every compatibility ledger row has telemetry/removal metadata and an exercised rollback.
- Metrics avoid principal/content/source high-cardinality or sensitive labels.
- Alias/export/runtime/state removal causes contract tests to fail until fixtures and migration are intentionally updated.
- Re-enable behavior works during the support window.
- Unknown caller usage blocks removal.
- Every required documentation deliverable has a live owner/link, package/config/API names match shipped artifacts, diagrams and examples build, and documented backup/restore/rebuild/install/rollback procedures have recorded rehearsal evidence.

### Acceptance criteria

- Given nonzero or unidentified usage, removal is blocked.
- Given zero usage but failing parity/rollback/security gates, removal is blocked.
- Given removal, telemetry confirms no regression during the observation window.
- Given a compatibility path is retained, it has a named owner and dated removal condition.
- Given any canonical documentation deliverable is absent, stale, or cannot be followed in a clean supported environment, the final migration gate fails with the assigned authoring WP named.

## Rollback and completion

Rollback this setup PR by restoring the previous registers, dashboards, and gate configuration; later focused removal PRs restore their prior compatible route/export/artifact/state reader without restoring divergent canonical state. Done means every remaining shim is owned with a dated condition and the complete linked documentation ledger is green. The migration closes only after the scheduled focused removals complete their observation windows.
