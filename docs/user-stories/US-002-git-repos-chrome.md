# US-002 — Git Repos chrome (chips + Run quality scan)

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Developer |
| **Surface** | Self-service Git Repositories table / header (extension points) |
| **Depends on** | [US-001](US-001-quality-tab-scan-with-ai.md) (Quality tab workflow) |

## Story

> As a developer, I want to see quality status on the Git Repositories list and
> start a scan from there, so I can triage repos without opening each catalog
> entity’s Quality tab first.

## Acceptance criteria

- [x] Git Repos table shows a **status chip** per registered repo (via
      `getCatalogRowSlots` → `ApmeRepoStatusChip`) plus **Violations** column.
- [x] List **Actions** kebab includes **Run quality scan** (via
      `getCatalogRowMenuItems`) — opens Quality with `CheckOptionsForm`.
- [x] Detail header **Actions → Run quality scan** opens the Quality tab with
      `CheckOptionsForm` (core version / AI / etc.) — user starts Scan there.
- [x] Implemented as **thin host extensions** on eap-next — no in-repo MUI
      remediation steppers; scan UI remains `@apme/ui-workflow`.
- [x] Wired via self-service / Git Repos extension factories (ADR-010);
      `dynamic-plugins.override.yaml` + janus updated for RHDH Local.
- [x] Verified in local loop (`make react` and/or `make sync` + RHDH).

## Out of scope

- Portal-side SCM commit (`RemediationPublisher`) — Gateway owns SCM (ADR-056).
- Fleet / multi-repo bulk analytics ([US-005](US-005-fleet-quality.md)).
- Quality settings / Remove / Dev Spaces menu items (later stories).

## Notes

- Host contract: `@ansible/backstage-rhaap-common/gitRepositoriesExtensions`.
- Guest factory: `gitRepositoriesExtensionsApiFactory` (thin surfaces only).
- RHDH Local must register **only** the APME factory — also registering
  `defaultGitRepositoriesExtensionsApiFactory` for the same `apiRef` blanks
  the SPA.
