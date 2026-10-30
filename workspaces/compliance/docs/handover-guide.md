---
title: "AAP Compliance Dashboard — Handover Guide"
description: "Project handover documentation — architecture, patterns, gaps, and alignment with downstream Portal conventions"
type: guide
audience: [developer]
product: "AAP Compliance Dashboard"
product_version: "2.6"
status: current
last_verified: 2026-07-09
related:
  - deployment-guide.md
  - architecture-diagram.md
---

# AAP Compliance Dashboard — Handover Guide

This document is for the team taking over the AAP Compliance Dashboard. It covers how the dashboard aligns with downstream Ansible Portal conventions, the architecture, and what to know to be productive immediately.

## 1. Alignment with ansible-backstage-plugins

This plugin was built to match the patterns in `ansible-backstage-plugins` (the downstream Ansible Portal plugins). Here's the alignment:

| Pattern | Downstream | This Plugin | Notes |
|---------|-----------|-------------|-------|
| Plugin structure | `plugins/<name>/`, `plugins/<name>-backend/` | Same | + `compliance-common` for shared types |
| MUI version | Material-UI v4 (`makeStyles`) | Same | No MUI v5 migration needed |
| Portal components | `Page`, `Header`, `Content`, `InfoCard` | Same | Standard Portal wrappers |
| API client | `createApiRef` + class, `discoveryApi.getBaseUrl()` | Same | Uses `fetchApi.fetch()` |
| Tables | `Table`/`TableHead`/`TableBody`/`TableRow`/`TableCell` | Same | We add `Paper variant="outlined"` and `TABLE_STYLES` for consistent headers |
| Dynamic plugin export | `@red-hat-developer-hub/cli` (`rhdh-cli`) | Same | `app-config.rhdh.yaml` for registration |
| TypeScript config | Extends `@backstage/cli/config/tsconfig.json` | Same | `skipLibCheck: true` |
| Testing | Jest + `@testing-library/react` + `@backstage/test-utils` | Same | 24 suites, 626 backend/frontend tests + 127 collection unit tests |

### Where we extend beyond downstream

| Extension | Why | Files |
|-----------|-----|-------|
| `shared/colors.ts` | Centralized semantic colors — downstream uses inline hex everywhere, we centralize because we have 20+ components using the same compliance-specific palette | `plugins/compliance/src/components/shared/colors.ts` |
| `shared/chipStyles.ts` | Shared chip sizing and table header styles | `plugins/compliance/src/components/shared/chipStyles.ts` |
| `shared/MultiFilterGroup.tsx` | Multi-select chip filter (extends `FilterOption` from `FilterGroup`) — used by trend chart, reusable for any multi-select filter | `plugins/compliance/src/components/shared/MultiFilterGroup.tsx` |
| `react-window` virtualization | `VariableSizeList` for 100+ rule lists in remediation builder — downstream doesn't use virtualization, we add it because STIG profiles have 200+ rules | `plugins/compliance/src/components/RemediationProfileBuilder/VirtualizedFindingsList.tsx` |
| `compliance-common` package | Shared TypeScript types between frontend and backend — downstream uses `backstage-rhaap-common` for the same purpose | `plugins/compliance-common/` |
| Error boundary | Class component in `ComplianceRouter.tsx` wrapping all routes — downstream doesn't use error boundaries | `plugins/compliance/src/components/ComplianceRouter.tsx` |
| `<Progress />` loading states | Standard Portal component — downstream uses plain text `"Loading..."` | Consistent throughout |

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Ansible Portal Frontend                   │
│                                                             │
│  ComplianceRouter (6 tabs, 14 routes)                       │
│  ├── Overview      — ComplianceDashboard (gauges, trend)    │
│  ├── New Scan      — ScanLauncher + ScanProgress            │
│  ├── Results       — ScanHistory → ResultsViewer            │
│  ├── Remediations  — RemediationsList → Execution           │
│  ├── Inventories   — InventoriesList → InventoryDetail      │
│  └── Settings      — ProfileSettings (register profiles)    │
│                                                             │
│  ComplianceBackendClient (API client via createApiRef)      │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────────┐
│                   Ansible Portal Backend                     │
│                                                             │
│  ComplianceService (orchestration layer)                    │
│  ├── ControllerClient  — AAP Gateway API proxy              │
│  ├── FindingsParser    — CFF normalization                  │
│  ├── DashboardAggregator — posture calculations             │
│  └── RemediationPlanBuilder — rule selection → JT params    │
│                                                             │
│  ComplianceDatabase (Knex, 23 migrations)                   │
│  ├── SQLite (local dev) / PostgreSQL (Portal)               │
│  └── Tables: scans, findings, profiles, remediations,       │
│              executions, posture_snapshots, baselines        │
│                                                             │
│  9 route modules: health, scans, findings, remediation,     │
│                   baseline, dashboard, controller,          │
│                   profiles, inventory                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ x-aap-token header (per-user)
┌──────────────────────▼──────────────────────────────────────┐
│              AAP Platform Gateway                           │
│  /api/controller/v2/ (job templates, inventories, jobs)     │
└─────────────────────────────────────────────────────────────┘
```

### Data flow: Scan → Findings → Dashboard

1. User clicks "Launch Scan" → backend calls `POST /api/controller/v2/job_templates/{id}/launch/`
2. Backend polls job status every 5s, frontend shows `ScanProgress`
3. On completion, the Ansible collection's `normalize_xccdf` module POSTs findings to `POST /api/compliance/findings/ingest` with a per-scan ingest token (ADR-010). The normalizer's `load_rules_metadata_map()` reads `fix_text` (CaC Ansible task YAML) and `aap_impact` from the collection's `rules/*.yml` files, merging them into findings at scan time. This replaces XCCDF prose fix descriptions with actual Ansible remediation task YAML, which enables `automationAvailable` detection in the plugin's `FindingsParser.ts` (the `- name:` heuristic).
4. Backend parses CFF JSON, stores in `compliance_findings` table
5. `DashboardAggregator` computes posture snapshots from latest scan per profile×inventory
6. Frontend fetches `GET /api/compliance/dashboard` for aggregated posture

### Data flow: Remediation

1. User selects rules from findings → `RemediationProfileBuilder` saves to `compliance_remediation_profiles`
2. User launches remediation → backend calls `POST /api/controller/v2/job_templates/{id}/launch/` with `--tags` (rule IDs), `--limit` (host scope), `--extra-vars` (parameter overrides)
3. After completion, a verification scan runs automatically
4. `ChainView` shows the assess → remediate → verify chain

## 3. Key Files

### Frontend (`plugins/compliance/src/`)

| File | Purpose |
|------|---------|
| `components/ComplianceRouter.tsx` | Route definitions, error boundary, tab navigation |
| `components/shared/colors.ts` | All semantic colors — SEVERITY, STATUS, EXECUTION, FINDING_STATE, SURFACE |
| `components/shared/chipStyles.ts` | CHIP_SIZES, TABLE_STYLES constants |
| `components/shared/MultiFilterGroup.tsx` | Reusable multi-select chip filter group |
| `components/ComplianceDashboard/TrendFilterBar.tsx` | Profile + inventory filter bar for trend chart |
| `components/RemediationProfileBuilder/FindingCard.tsx` | Memoized finding card (extracted from builder) |
| `components/RemediationProfileBuilder/VirtualizedFindingsList.tsx` | react-window virtualized rule list |
| `api/ComplianceBackendClient.ts` | API client (all backend calls) |
| `api/complianceApiRef.ts` | API ref registration |
| `__testutils__/mockComplianceApi.ts` | Centralized mock factory for tests |

### Backend (`plugins/compliance-backend/src/`)

| File | Purpose |
|------|---------|
| `service/ComplianceService.ts` | Main orchestration (delegates to focused classes) |
| `service/ControllerClient.ts` | AAP Gateway API wrapper |
| `service/FindingsParser.ts` | CFF JSON → database records |
| `service/DashboardAggregator.ts` | Posture calculations |
| `service/RemediationPlanBuilder.ts` | Rule selections → JT launch params |
| `database/ComplianceDatabase.ts` | All CRUD (Knex, 1340 lines — candidate for decomposition) |
| `database/migrations/` | 23 migrations (001-023) |
| `routes/` | 9 route modules |

### Shared (`plugins/compliance-common/src/`)

| File | Purpose |
|------|---------|
| `types/api.ts` | API response/request types, DashboardStats, HostPosture |
| `types/profiles.ts` | ComplianceProfile, ScanCertification |

## 4. Architectural Decisions

37 ADRs document every significant decision: `specs/compliance-pipelines/decisions/ADR-001` through `ADR-037`. Key ones:

| ADR | Decision | Impact |
|-----|----------|--------|
| 001 | Scanner orchestrator (CFF) | Foundation — plugin orchestrates, doesn't scan |
| 003 | Single assessment JT | One JT with 2 plays (scan + normalize), not a workflow |
| 007 | Direct POST findings | Ansible module POSTs to plugin, not event parsing |
| 010 | Per-scan ingest token | Crypto-random token per scan, validated on ingest |
| 014 | Remediation lifecycle | Build → Save → Launch → Verify → Baseline |
| 016 | Lifecycle visualization | Finding states (new/active/fixed/resurfaced), scan grouping, chain view |
| 019 | Service decomposition | ComplianceService delegates to 4 focused classes |
| 025 | Visual consistency | Centralized colors, filled chips, 3-tier thresholds |
| 026 | Portable display configuration | Profile-driven labels, columns, score formulas |
| 027 | Dynamic tab system | Tier 1 (9 widgets) + Tier 2 (BYOT) |
| 029 | CycloneDX normalizer | Syft/Grype SBOM pipeline |
| 030 | Per-host normalization | Loop-per-host prevents OOM |
| 033 | File-streamed API ingestion | compose_post_body + uri src |
| 034 | NDJSON content-type negotiation | Preamble + line-by-line parsing |
| 036 | Profile identity (slug) | Stable profile_slug for routing |
| 037 | OCI artifact push pattern | oras push to PAH, httpAuth for GET |

## 5. Development

```bash
cd backstage-app
yarn install
./bin/start.sh mock   # Demo mode (hardcoded data)
./bin/start.sh live   # Connect to AAP lab
yarn test             # 24 suites, 626 tests (+ 127 collection unit tests)
yarn build            # Build all packages
```

### Dynamic plugin packaging

```bash
yarn workspace @aap-compliance/plugin-compliance-backend export-dynamic
yarn workspace @aap-compliance/plugin-compliance export-dynamic
cd plugins/compliance-backend/dist-dynamic && npm pack
cd plugins/compliance/dist-dynamic && npm pack
```

Registration config: `plugins/*/app-config.rhdh.yaml`

### Deployment

Portal deploys use the generic tarball names `backend.tgz` / `frontend.tgz` in `deploy-artifacts/`. CI auto-bumps versions and commits tarballs to this directory. The `deploy-netrunner` job uploads tarballs to the Portal host, updates integrity hashes, and restarts the service.

**CI/CD split (GitHub + GitLab)**:
- **GitLab CEE** (`.gitlab-ci.yml`): Plugin tests, export, deploy to Netrunner. Collection sanity/unit/lint tests and tarball builds.
- **GitHub Actions** (`build-ee.yml`): Per-collection EE image builds (STIG, CIS L1, CIS L2, Supply Chain). Matrix with `fail-fast: false`. Pushes to GHCR, then mirrored to PAH via `skopeo copy` (ADR-031). Triggers on changes to `profiles/**` or manual `workflow_dispatch`.
- **GitHub Actions** (`ci.yml`): Disabled — placeholder only.
- **EE registry**: Images hosted in Private Automation Hub (PAH) at `aap-netrunner.demoredhat.com/compliance-*:latest`. Controller trusts PAH natively — no external registry credential needed (ADR-031).

**Critical**: Portal's cleanup sweep deletes same-version plugin directories. Every deploy MUST use a bumped version number. CI handles this automatically.

## 6. Scanner Profiles

Four compliance profiles ship under `profiles/` (3 OpenSCAP + 1 Supply Chain):

| Profile | Framework | XCCDF Profile |
|---------|-----------|---------------|
| `rhel9-stig` | DISA STIG V2R8 | `stig` |
| `rhel9-cis-l1` | CIS Level 1 Server | `cis_server_l1` |
| `rhel9-cis-l2` | CIS Level 2 Server | `cis` |

Each profile is a self-contained Ansible collection with: `run_oscap.yml` (assessment), `remediate.yml` (CaC remediation), `normalize_xccdf.py` (XCCDF → CFF module). All share a common normalizer at `profiles/_shared/normalize_common.py` — run `python scripts/sync_shared_modules.py` after editing.

## 7. Known Gaps (for incoming team)

| Gap | Priority | Effort |
|-----|----------|--------|
| Tier 2 adapter PoC (Tenable/Insights) | P1 | 3-5 days |
| CFF `remediation.available` field not populated by normalizers (heuristic in FindingsParser.ts) | P3 | 1-2 days |
| `ComplianceDatabase.ts` is 1340 lines | P2 | 2-3 days to decompose |
| `RemediationExecution.tsx` is 1430 lines | P2 | 2-3 days to split |
| 5 components have no tests (ActiveJobsBanner, FilterGroup, FindingRow, ExportButton, ScanFailedView) | P2 | 3-4h |
| 7 `any` types in Recharts components | P3 | 1h |
| Custom RBAC permissions (placeholder `catalogEntityCreatePermission`) | P3 | 2-3 days |
| ~~MockDataProvider not updated~~ | ~~P3~~ | Resolved — MockDataSeeder (Jul 2026) seeds all 9 DB tables |
| ADR-022 (auto-remediation) is "Proposed" — accept or reject | P3 | 1 day |

## 8. Cross-Cutting Navigation Patterns

Inventory chips throughout the app link to the inventory detail page with profile context:

| Location | Element | Navigates to |
|----------|---------|-------------|
| Scan results header | Inventory chip | `/compliance/inventories/:id?profileId=X` (scan's profile) |
| Remediations execution history | Inventory chip | `/compliance/inventories/:id?profileId=X` (remediation's profile) |
| Inventories list table rows | Row click | `/compliance/inventories/:id?profileId=X` (clicked row's profile) |
| Inventory detail score cards | Overall Compliance | Authoritative scan results (standard view) |
| Inventory detail score cards | Baseline card | Authoritative scan results (`?baselineView=true`) |

The inventory detail page reads `?profileId=` from the URL to pre-select the correct compliance profile in its dropdown. The `?baselineView=true` param triggers `ResultsViewer` to auto-activate the baseline filter on load.

**LaunchScanDialog**: The inventory detail page has a "Scan Now" button in the subheader that opens a dialog with the inventory name (read-only), a profile dropdown (pre-populated from the current view), previous scan status check, and launch button. On success, navigates to the new scan's results page.

**Inventory view improvements (2026-06-16)**: Short profile links via scanTags, chip cluster blocks, view toggle, host findings endpoint (`GET /inventories/:id/hosts/:hostname/findings`), enhanced host drawer with baseline scores, findings list, and clickable severity filters.

**Host filter in ResultsViewer**: The `?host=X` URL param filters findings to a specific host. A blue pill indicator shows the active host filter, and host rows are highlighted in expanded finding rows.

## 9. Security Model

- **User auth**: Per-user AAP tokens via `x-aap-token` header, passed through to Gateway API
- **Scan ingest**: Per-scan crypto-random tokens (ADR-010), validated on POST
- **Rate limiting**: 30 req/min on `/findings/ingest`
- **Input validation**: Body size (50MB — raised from 10MB because fix_text enrichment produces large payloads), finding count (50K), parameterized SQL queries throughout
- **No XSS**: Zero `dangerouslySetInnerHTML` usage
- **Auth mode**: Default is `production` (enforces RBAC). Development mode (`ansible.compliance.authMode: development`) must be set explicitly in `app-config.local.yaml`
