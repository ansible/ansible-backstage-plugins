---
title: "AAP Compliance Dashboard — System Architecture"
description: "System architecture diagram — components, data flow, auth model, and service decomposition"
type: reference
audience: [developer, architect]
product: "AAP Compliance Dashboard"
product_version: "2.6"
status: current
last_verified: 2026-07-09
---

# AAP Compliance Dashboard — System Architecture

Generated 2026-06-26 by architect review.

```
                        AAP COMPLIANCE PIPELINES — SYSTEM ARCHITECTURE
 ============================================================================

                           EXTERNAL SYSTEMS
 +-----------+    +-------------------+    +-------------------+    +---------+
 |  Ansible  |    | AAP Controller    |    | Private Automation|    | OCI/PAH |
 |  Portal   |    | (AWX)             |    | Hub (PAH)         |    | Registry|
 |  (RHDH)   |    | - WJTs / JTs      |    | - EE images       |    | - SBOM  |
 |           |    | - Inventories     |    | - Collections     |    | artifacts|
 |  OAuth +  |    | - Job Events      |    | - SCAP content    |    |         |
 |  Identity |    | - Host Facts      |    |                   |    |         |
 +-----------+    +-------------------+    +-------------------+    +---------+
       |                    |                       |                     |
       | Portal Auth        | REST API              | EE pull             | OCI v2
       | (httpAuth +        | (Bearer token         | (podman)            | (oras
       |  permissions)      |  + x-aap-token)       |                     |  push/pull)
       |                    |                       |                     |
 ======|====================|=======================|=====================|======
       |                    |                       |                     |
       v                    v                       v                     v
 +--------------------------------------------------------------------------+
 |                    COMPLIANCE BACKEND PLUGIN                              |
 |                    (@aap-compliance/plugin-compliance-backend)            |
 |                                                                          |
 |  plugin.ts -- createBackendPlugin()                                      |
 |    |  Reads config: dataSource (mock|live), authMode (dev|prod)          |
 |    |  Runs Knex migrations (TS dev / JS dist-dynamic)                   |
 |    |  Sets up retention cleanup                                          |
 |    |                                                                     |
 |    v                                                                     |
 |  router.ts -- Express Router                                             |
 |    |  Custom body parsing (skips JSON for /findings/ingest)              |
 |    |  SharedState: throttle maps, parse-in-progress set                  |
 |    |  One-time rule_count backfill                                       |
 |    |                                                                     |
 |    +--> 10 ROUTE MODULES (58 endpoints total)                            |
 |    |     +-- health.ts ......... GET /health, POST /settings, /cleanup   |
 |    |     +-- scans.ts .......... GET/POST /scans, /scan, /scan/validate  |
 |    |     +-- findings.ts ....... GET /findings, POST /findings/ingest    |
 |    |     |                       (JSON + NDJSON dual-format, ADR-034)    |
 |    |     +-- controller.ts ..... 9 proxy endpoints to Controller API     |
 |    |     +-- remediation.ts .... POST /remediate, CRUD profiles/execs    |
 |    |     +-- baseline.ts ....... CRUD /baseline-targets, /baseline-scores|
 |    |     +-- dashboard.ts ...... GET /dashboard, /posture, /posture/evts |
 |    |     +-- profiles.ts ....... CRUD /compliance-profiles, bundles      |
 |    |     +-- inventory.ts ...... GET host-posture, host findings         |
 |    |     +-- artifacts.ts ...... POST/GET scan artifacts (OCI registry)  |
 |    |                                                                     |
 |    +--> AUTH LAYER (routes/permissions.ts)                                |
 |          - requirePermission() -> catalogEntityCreatePermission          |
 |          - getUserAapToken()   -> x-aap-token header extraction          |
 |          - extractUserIdentity() -> Portal userEntityRef                 |
 |          - Ingest token auth   -> per-scan UUID (ADR-010)                |
 |                                                                          |
 |  SERVICE LAYER                                                           |
 |  +--------------------------------------------------------------------+ |
 |  | ComplianceService.ts (1131 lines) -- Orchestrator                  | |
 |  |   - mock/live toggle, template resolution (3-level: explicit >     | |
 |  |     DB profile > name search), WJT-to-JT fallback                 | |
 |  |                                                                    | |
 |  | ControllerClient.ts (470 lines) -- HTTP client                     | |
 |  |   - undici, bearer auth, SSL agent, auto-pagination               | |
 |  |                                                                    | |
 |  | FindingsParser.ts (347 lines) -- CFF mapping                       | |
 |  |   - Raw finding -> MultiHostFinding aggregation                    | |
 |  |   - Rule metadata enrichment from DB                              | |
 |  |                                                                    | |
 |  | DashboardAggregator.ts (406 lines) -- Stats engine                 | |
 |  |   - Per-profile/inventory scores, baseline enrichment              | |
 |  |   - Score formulas: compliance_rate, vulnerability_free_rate       | |
 |  |                                                                    | |
 |  | RemediationPlanBuilder.ts (142 lines)                              | |
 |  | PlatformValidator.ts (60 lines)                                    | |
 |  | MockDataProvider.ts (617 lines) -- Demo mode                       | |
 |  +--------------------------------------------------------------------+ |
 |                                                                          |
 |  DATABASE LAYER                                                          |
 |  +--------------------------------------------------------------------+ |
 |  | ComplianceDatabase.ts (1653 lines) -- Knex abstraction              | |
 |  |   9 tables, 19 migrations (SQLite dev / PostgreSQL prod)           | |
 |  |                                                                    | |
 |  |   compliance_scans --------+                                       | |
 |  |   compliance_findings -----+ (FK CASCADE)                          | |
 |  |   compliance_scan_artifacts + (FK CASCADE, ADR-032)                | |
 |  |   compliance_profile_registry (logical ref, no FK)                 | |
 |  |   compliance_rule_metadata                                         | |
 |  |   compliance_posture_snapshots                                     | |
 |  |   compliance_remediation_profiles --+                              | |
 |  |   compliance_remediation_executions + (FK RESTRICT)                | |
 |  |   compliance_baseline_targets ------+ (FK RESTRICT)                | |
 |  +--------------------------------------------------------------------+ |
 +--------------------------------------------------------------------------+
       |
       | REST API (/api/compliance/*)
       |
 +--------------------------------------------------------------------------+
 |                    COMPLIANCE FRONTEND PLUGIN                             |
 |                    (@aap-compliance/plugin-compliance)                    |
 |                                                                          |
 |  ComplianceRouter.tsx -- 6 core tabs + dynamic profile tabs              |
 |    |                                                                     |
 |    +-- [Overview]     ComplianceDashboard (722 lines)                    |
 |    |                    Gauges, trends, posture, baselines               |
 |    |                                                                     |
 |    +-- [New Scan]     ScanLauncher (479) + ScanProgress (270)            |
 |    |                                                                     |
 |    +-- [Results]      ScanHistory (903) + ResultsViewer (1133)           |
 |    |                    FindingRow, ExportButton, ChainView              |
 |    |                                                                     |
 |    +-- [Remediations] RemediationsList (909)                             |
 |    |                    RemediationProfileBuilder (619)                   |
 |    |                    RemediationExecution (1443)                       |
 |    |                                                                     |
 |    +-- [Inventories]  InventoriesList (241) + InventoryDetail (353)      |
 |    |                    HostDetailDrawer, StripPlot, ChipMatrix          |
 |    |                                                                     |
 |    +-- [Dynamic tabs]  DynamicProfileTab + widgets                       |
 |    +-- [Settings]     ProfileSettings (411) + ProfileFormDialog (431)    |
 |    +-- ActiveJobsBanner (270) -- floating banner                         |
 |                                                                          |
 |  API CLIENT: ComplianceBackendClient.ts (497 lines, 46 methods)          |
 +--------------------------------------------------------------------------+
       |
 +--------------------------------------------------------------------------+
 |                    COMMON LIBRARY (@aap-compliance/common)                |
 |  types/findings.ts ... CFF v1.0 (FROZEN)                                 |
 |  types/api.ts ........ 532 lines: all API/DB/Controller types             |
 |  types/display.ts .... ProfileDisplayConfig, widgets, tabs                |
 |  types/profiles.ts ... Framework, RemediationSelection/Profile            |
 |  types/lifecycle.ts .. Connection status, versioning                      |
 +--------------------------------------------------------------------------+

 ============================================================================
                     DATA FLOW: SCAN LIFECYCLE
 ============================================================================

 1. User clicks "New Scan" --> POST /scan --> DB record + ingest_token
 2. Launch WJT on Controller with extra_vars: {scan_id, ingest_token, ...}
 3. Controller runs 2-play JT:
    Play 1 (targets): install scanner, run scan, fetch results, cleanup
    Play 2 (localhost/EE): normalize to CFF, compose NDJSON
 4. Normalizer streams POST to /findings/ingest (application/x-ndjson)
    Preamble: {_meta, scanId, ingestToken, finalize}
    Lines 2-N: one CFF finding per line, batch insert per 500
 5. finalizeIngest(): mark completed, compute finding states, save posture
 6. Frontend polls until completed, then paginated GET /findings
```

## Profiles

| Profile | Framework | Scanner | Certification |
|---------|-----------|---------|---------------|
| rhel9-stig | DISA STIG V2R8 | OpenSCAP | Certified (NIST SCAP 1.2) |
| rhel9-cis-l1 | CIS L1 Server | OpenSCAP | Conformant |
| rhel9-cis-l2 | CIS L2 Server | OpenSCAP | Conformant |
| supply-chain | SUPPLY_CHAIN | Syft + Grype | Uncertified |

Each profile is a self-contained Ansible collection with:
- `compliance-profile.yml` - identity + display config (ADR-026)
- `playbooks/run_oscap.yml` or `run_scan.yml` - 2-play assessment
- `playbooks/remediate.yml` - remediation playbook
- `plugins/modules/normalize_*.py` - CFF normalizer
- `install.yml` / `uninstall.yml` - Controller registration (ADR-028)
- `ee/execution-environment.yml` - EE build definition

## Test Coverage Summary

**Backend: ~7,300 test lines across 7 files (strong)**
**Frontend: ~3,700 test lines across 15 files (moderate)**
**26.5% of frontend source (3,899 lines) has no dedicated tests**

Key untested frontend components: ScanProgress, FindingRow, ExportButton,
InventoryDetail, HostDetailDrawer, ProfileFormDialog, DynamicProfileTab,
ActiveJobsBanner, VirtualizedFindingsList, PostureTrendChart.
