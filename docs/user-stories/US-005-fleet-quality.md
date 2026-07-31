# US-005 — Fleet Quality overview

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Platform / lead developer |
| **Surface** | Git Repositories → **Quality** page tab |
| **Craig journey** | [J4](user-journeys.md) |
| **Source** | Ported from `prototype/apme` `FleetQualityTab` |

## Story

> As a lead, I want a fleet-level view of Quality across many Git repositories,
> so I can prioritize remediation work across the org.

## Acceptance criteria

- [x] Git Repos **Quality** tab shows cross-repo violation summary (counts,
      severity chips, rule groups).
- [x] Expand a rule to see affected repos; drill into entity Quality
      (`?tab=quality&rule=`).
- [x] Filter by severity / category; sort by impact, severity, repos,
      occurrences, category.
- [x] Thin host only — read-only aggregation via Gateway + catalog; no fat
      remediation UI on the fleet tab.
- [x] EAP Preview chip + feedback link on the tab (ADR-012).
- [x] Unit tests for enabled/disabled + mock fixture render.

## How to verify (local)

1. Portal with APME (`make dev` / `make start`) and ≥1 scanned repo.
2. **Git Repositories → Quality**.
3. Summary matches catalog Violations column aggregates for sampled repos.
4. Expand a rule → open a repo link → Quality tab with rule filter.

```bash
yarn workspace @ansible/plugin-backstage-apme test --watchAll=false \
  FleetQualityTab PreviewChip
```

## Notes

- **Not** the future Content Health dashboard
  ([US-013](US-013-content-health-dashboard.md) / J11).
- Wired via ADR-010 `getPageTabs()` → path `quality` (self-service already
  routes `/repositories/quality`).
- Uses `fetchAllProjectViolations` so large projects are not truncated.
- Settings link goes to slim Quality settings (no rules-admin deep link).
