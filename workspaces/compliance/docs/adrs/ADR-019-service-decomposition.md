---
title: "ADR-019: ComplianceService Decomposition"
description: "`ComplianceService"
type: adr
status: accepted
date: 2026-06-06
product: "AAP Compliance Dashboard"
---
# ADR-019: ComplianceService Decomposition

**Status:** Accepted (implemented 2026-06-06)  
**Date:** 2026-06-06  
**Deciders:** Massimo Ferrari  

## Context

`ComplianceService.ts` grew to ~1,200 lines handling four distinct concerns:

1. **Findings parsing** -- mapping raw Controller events and Direct POST payloads to `StoredFinding` records, grouping findings by rule, enriching with DB metadata, and building `MultiHostFinding` aggregates.
2. **Remediation plan building** -- grouping rules by target host set for batched Ansible runs, merging extra_vars, computing host/rule counts.
3. **Dashboard aggregation** -- computing posture scores, framework scores, deltas, inventory-level stats, baseline enrichment, and posture history.
4. **Orchestration** -- scan lifecycle, remediation launch, Controller API coordination, profile management.

The first three concerns had no dependency on each other -- they shared only the `ComplianceDatabase` and `LoggerService` injections. Changes to dashboard aggregation logic (e.g., baseline scoring formula fixes) required editing the same file as changes to findings parsing (e.g., deduplication), increasing merge conflict risk and cognitive load during review.

The architect review (ADR-017) informally flagged the monolithic service as a maintainability concern, though it was not prioritized as a formal finding since the code quality was sound.

### Industry pattern

The decomposition follows the standard "extract class" refactoring pattern (Fowler, Refactoring Ch. 7). Each extracted class has a single responsibility:

- `FindingsParser` -- stateless mapping and grouping (no side effects except logging)
- `RemediationPlanBuilder` -- pure computation from selections + findings (no DB access)
- `DashboardAggregator` -- read-only aggregation (DB reads + Controller inventory fetch)

`ComplianceService` retains orchestration: scan/remediation lifecycle, Controller API calls, and delegation to the extracted classes.

## Decision

Extract three focused modules from `ComplianceService`:

### 1. FindingsParser (`service/FindingsParser.ts`)

**Responsibilities:**
- `mapRawFinding()` -- map a single raw finding (Controller event or Direct POST payload) to `StoredFinding` format. Handles severity mapping (lowercase to CAT_*), evidence extraction, actual/expected value parsing.
- `parseJobEvents()` -- parse job events from the normalize job into `StoredFinding` rows. Supports Track B (normalize_xccdf facts) and legacy Track A (compliance_evaluate, deprecated).
- `groupFindingsByRule()` -- group `StoredFinding[]` by rule_id, deduplicating hosts via `seenHosts` Set. Returns a Map suitable for multi-host building.
- `buildMultiHostFindings()` -- enrich grouped findings with DB metadata (`RuleMetadataRecord`) for title, description, fix_text, check_text, disruption, and AAP impact. The DB metadata table is the **sole** source of enrichment -- YAML fallback has been removed.
- `buildRuleMetadataRecords()` -- extract `RuleMetadataRecord[]` from raw findings for upsert into the rule metadata table. Now includes `aap_impact` and `aap_impact_reason` fields.
- `aggregateFindings()` / `aggregateFindingsWithMetadata()` -- public API combining grouping + enrichment.

**Key change -- YAML fallback removal:** Prior to this refactor, `buildMultiHostFindings` had a fallback path that loaded rule metadata from a YAML file (`profiles/*/rules/*.yml`) when the DB metadata table had no entry. This fallback:
- Was unreliable in dist-dynamic packaging (path resolution broke)
- Created a hidden dependency on content that should be self-contained in the collection (ADR-006)
- Masked upsert failures (ADR-017 M11) by silently falling back to YAML

The DB is now the sole runtime cache. The `upsertRuleMetadata` call during ingest populates the DB, and `getRuleMetadataBulk` retrieves it. If metadata is missing from the DB, the finding displays with its rule_id as the title -- the correct behavior, since it signals that the ingest pipeline failed to populate metadata.

### 2. RemediationPlanBuilder (`service/RemediationPlanBuilder.ts`)

**Responsibilities:**
- `buildRemediationPlan()` -- build an optimized remediation plan from user selections and findings. Groups rules by their target host set so that rules targeting the same hosts are batched into a single Ansible run. Supports `failed_only` and `standardize_all` scoping per selection.

**Pure computation:** Takes `RemediationSelection[]` + `MultiHostFinding[]`, returns `RemediationPlan`. No DB access, no side effects. Easily unit-testable.

### 3. DashboardAggregator (`service/DashboardAggregator.ts`)

**Responsibilities:**
- `getDashboardStats()` -- compute dashboard statistics: hosts scanned, critical findings, pending remediation, active profiles, framework scores with contributing scans, inventory posture, baseline enrichment (ADR-014 section 7), and deltas vs previous scan set.
- `getPostureHistory()` -- retrieve posture snapshots over time.
- `getBaselineScoresForProfile()` -- compute baseline pass rates for all inventories pinned to a remediation profile.

**Dependency injection:** Uses a `DashboardServiceDeps` interface (narrow contract: `getInventories`, `getRemediationProfile`, `getDataSource`) instead of importing `ComplianceService` directly. This avoids circular imports and makes the aggregator testable with stubs.

### ComplianceService (retained)

Retains orchestration responsibilities:
- Scan lifecycle (launch, poll, status transitions)
- Remediation launch (concurrent execution guard, Controller job dispatch)
- Controller API coordination via `ControllerClient`
- Profile and baseline management
- Delegation to `FindingsParser`, `RemediationPlanBuilder`, and `DashboardAggregator`

## Consequences

- **Reduced blast radius.** Changes to dashboard aggregation (e.g., baseline formula fixes from ADR-014) no longer touch findings parsing code. Merge conflicts between concurrent feature branches are less likely.
- **Improved testability.** `RemediationPlanBuilder` is a pure function -- tests need only construct input data, no DB mocking. `FindingsParser` tests need only a mock logger and optional mock DB.
- **Clearer ownership.** Each file has a single reason to change. New developers can find the relevant code faster.
- **No behavioral change.** This is a structural refactor. All public APIs, data flows, and test assertions remain identical. The three extracted classes are instantiated by `ComplianceService` in its constructor.
- **Slight increase in file count.** Four files instead of one. Mitigated by the much smaller size of each file (FindingsParser: ~340 lines, RemediationPlanBuilder: ~140 lines, DashboardAggregator: ~370 lines vs the original ~1,200 lines).
- **YAML fallback removal** means that if `upsertRuleMetadata` fails during ingest, rule titles will display as raw rule_ids until the next successful ingest. This is acceptable: the raw rule_id is unambiguous, and the failure is logged at warning level (ADR-017 M11).

## Related

- ADR-014: Remediation lifecycle (amended with decomposition note)
- ADR-017: Architect review hardening (amended with resolution note)
- ADR-006: Self-contained compliance profiles (YAML fallback removal aligns with self-containment principle)
- ADR-018: Findings deduplication (host dedup in FindingsParser)
